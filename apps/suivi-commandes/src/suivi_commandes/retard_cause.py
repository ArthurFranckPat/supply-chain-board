"""Analyse des causes de retard de production.

Pour chaque ligne en "Retard Prod", identifie si un composant est en rupture
en descendant la nomenclature de l'article commandé.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from erp_data_access.loaders import DataLoader
    from erp_data_access.models.of import OF


def _get_of_allocations(loader: "DataLoader", of_num: str) -> dict[str, float]:
    """Quantités déjà allouées dans l'ERP pour un OF donné."""
    allocs = loader.get_allocations_of(of_num)
    result: dict[str, float] = {}
    for a in allocs:
        result[a.article] = result.get(a.article, 0.0) + float(a.qte_allouee)
    return result


def _find_matching_of(
    loader: "DataLoader",
    num_commande: str,
    article: str,
    type_commande: str,
) -> "OF | None":
    """Trouve l'OF correspondant à une ligne de commande.

    Pour MTS: cherche d'abord le hard-pegging (of_contremarque ou origine),
    puis fallback sur n'importe quel OF planifiable de l'article.
    """
    def _is_plannable_of_status(statut_num: int | None) -> bool:
        return int(statut_num or 0) in (1, 2, 3)

    # 1. Chercher par of_contremarque dans le besoin client
    besoin = None
    for b in loader.commandes_clients:
        if b.num_commande == num_commande and b.article == article:
            besoin = b
            break

    if besoin and besoin.of_contremarque:
        of = loader.get_of_by_num(besoin.of_contremarque)
        if of and of.article == article and _is_plannable_of_status(of.statut_num) and of.qte_restante > 0:
            return of

    # 2. Pour MTS, chercher par origine (hard-pegging ERP)
    if type_commande == "MTS":
        ofs = loader.get_ofs_by_origin(num_commande, article=article)
        ofs = [
            o
            for o in ofs
            if str(o.methode_obtention_livraison).strip().lower()
            == "ordre de fabrication"
            and _is_plannable_of_status(o.statut_num)
            and o.qte_restante > 0
        ]
        if ofs:
            ofs.sort(
                key=lambda o: (
                    {1: 0, 2: 1, 3: 2}.get(o.statut_num, 3),
                    abs(
                        (o.date_fin - o.date_debut).days
                        if o.date_fin and o.date_debut
                        else 0
                    ),
                    o.num_of,
                )
            )
            return ofs[0]

    # 3. Fallback: chercher n'importe quel OF planifiable de l'article
    ofs = [
        o
        for o in loader.get_ofs_by_article(article)
        if _is_plannable_of_status(o.statut_num) and o.qte_restante > 0
    ]

    if not ofs:
        return None

    ofs.sort(
        key=lambda o: (
            {1: 0, 2: 1, 3: 2}.get(o.statut_num, 3),
            abs(
                (o.date_fin - o.date_debut).days
                if o.date_fin and o.date_debut
                else 0
            ),
            o.num_of,
        )
    )
    return ofs[0]


def _check_component_shortages(
    loader: "DataLoader",
    article: str,
    quantity: float,
    own_allocations: dict[str, float],
    seen: set[str] | None = None,
) -> dict[str, float]:
    """Descend récursivement la BOM et retourne les composants en rupture.

    Retourne {article_composant: quantite_manquante}.
    """
    seen = seen or set()
    if article in seen:
        return {}
    seen.add(article)

    # Si pas de nomenclature → article achat (ou feuille)
    nom = loader.get_nomenclature(article)
    if nom is None:
        stock = loader.get_stock(article)
        dispo = stock.disponible() if stock else 0.0
        already = own_allocations.get(article, 0.0)
        net = max(0.0, quantity - already)
        if dispo < net:
            return {article: net - dispo}
        return {}

    shortages: dict[str, float] = {}
    for comp in nom.composants:
        req = comp.qte_requise(quantity)
        already = own_allocations.get(comp.article_composant, 0.0)
        net_req = max(0.0, req - already)

        if net_req <= 0:
            continue

        # Composant achat ou feuille → check stock direct
        if comp.is_achete() or loader.get_nomenclature(comp.article_composant) is None:
            stock = loader.get_stock(comp.article_composant)
            dispo = stock.disponible() if stock else 0.0
            if dispo < net_req:
                shortages[comp.article_composant] = (
                    shortages.get(comp.article_composant, 0.0) + (net_req - dispo)
                )
        else:
            # Composant fabriqué → recurse dans sa propre nomenclature
            sub = _check_component_shortages(
                loader,
                comp.article_composant,
                net_req,
                own_allocations,
                seen.copy(),
            )
            for art, qty in sub.items():
                shortages[art] = shortages.get(art, 0.0) + qty

    return shortages


def get_retard_cause(
    loader: "DataLoader",
    num_commande: str,
    article: str,
    type_commande: str,
    quantity: float,
    is_fabrique: bool,
) -> str:
    """Retourne la cause métier du retard, ou '' si non identifiée."""
    if not is_fabrique:
        return "Attente réception fournisseur"

    of = _find_matching_of(loader, num_commande, article, type_commande)

    if of is None:
        return "Aucun OF planifié"

    own_allocs = _get_of_allocations(loader, of.num_of)
    shortages = _check_component_shortages(
        loader, article, quantity, own_allocs
    )

    # Filtrer les quantités quasi-nulles (epsilon = 0.001)
    shortages = {art: qty for art, qty in shortages.items() if qty > 0.001}

    if shortages:
        def _fmt_qty(value: float) -> str:
            rounded = round(value, 3)
            if abs(rounded - round(rounded)) < 1e-9:
                return str(int(round(rounded)))
            return str(rounded)

        parts = [
            f"{art} x{_fmt_qty(qty)}" for art, qty in sorted(shortages.items())
        ]
        return "Rupture composants: " + ", ".join(parts)

    return ""


def enrich_retard_causes(df, loader: "DataLoader") -> dict[int, str]:
    """Pour chaque ligne en 'Retard Prod', calcule la cause.

    Retourne un dict {index_dataframe: cause_texte}.
    """
    causes: dict[int, str] = {}
    if df.empty or "Statut" not in df.columns:
        return causes

    for idx, row in df.iterrows():
        if row.get("Statut") != "Retard Prod":
            continue

        num_cmd = str(row.get("No commande", ""))
        article = str(row.get("Article", ""))
        type_cmd = str(row.get("Type commande", ""))
        qte = float(row.get("Quantité restante", 0))
        is_fab = bool(row.get("_is_fabrique", False))

        if not num_cmd or not article:
            continue

        cause = get_retard_cause(
            loader, num_cmd, article, type_cmd, qte, is_fab
        )
        if cause:
            causes[idx] = cause

    return causes
