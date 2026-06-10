"""Évaluation de faisabilité pour le planning board, avec what-if.

Réutilise la brique faisabilité du projet (RecursiveChecker + StockState)
en appliquant les overrides locaux du board (dates et statuts effectifs) :

1. Les OF de la fenêtre sont triés par priorité métier :
   fermes d'abord (composants réservés), puis date de besoin croissante,
   puis faisables avant non-faisables (règle 2 — maximiser les OF servis).
2. Chaque OF est vérifié récursivement avec un état de stock virtuel
   partagé ; s'il est faisable, ses composants ACHAT directs sont alloués
   virtuellement (asséchant le stock pour les suivants).
3. Le what-if injecte un OF virtuel (article × quantité × date) dans la
   séquence et compare les statuts avant/après → OF dégradés/améliorés
   et commandes clients touchées.

Limites assumées (V1) : les réceptions fournisseurs sont versées au pot
commun jusqu'à la fin de fenêtre (comme AllocationManager) ; la recherche
de sous-OF dans la récursion BOM s'appuie sur les statuts ERP, pas sur
les overrides locaux.
"""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

from ..domain_rules import is_firm_of_status
from ..feasibility.recursive import RecursiveChecker
from ..models.of import OF
from ..orders.allocation import StockState

WHATIF_NUM_OF = "WHATIF"


@dataclass
class FeasibilityEntry:
    """Résultat de faisabilité d'un OF dans la séquence d'allocation."""

    num_of: str
    article: str
    faisable: bool
    statut: str  # "ok" | "bloque" | "sans_nomenclature"
    missing_components: dict[str, float] = field(default_factory=dict)
    alerts: list[str] = field(default_factory=list)
    allocated: dict[str, float] = field(default_factory=dict)
    date_besoin: Optional[str] = None
    statut_num: int = 3

    def to_dict(self) -> dict[str, Any]:
        return {
            "num_of": self.num_of,
            "article": self.article,
            "faisable": self.faisable,
            "statut": self.statut,
            "missing_components": {k: round(v, 3) for k, v in self.missing_components.items()},
            "alerts": self.alerts,
            "allocated": {k: round(v, 3) for k, v in self.allocated.items()},
            "date_besoin": self.date_besoin,
            "statut_num": self.statut_num,
        }


def _safe_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def build_effective_ofs(
    loader,
    overrides: dict[str, dict[str, Any]],
    from_d: date,
    to_d: date,
) -> list[OF]:
    """Copies d'OF avec dates/statuts effectifs (overrides appliqués), dans la fenêtre."""
    effective: list[OF] = []
    for of in loader.ofs:
        if of.qte_restante <= 0:
            continue
        ov = overrides.get(of.num_of) or {}
        eff = dataclasses.replace(
            of,
            date_debut=_safe_date(ov.get("date_debut")) or of.date_debut,
            date_fin=_safe_date(ov.get("date_fin")) or of.date_fin,
            statut_num=ov.get("statut_num") or of.statut_num,
        )
        start = eff.date_debut or eff.date_fin
        if start is None or not (from_d <= start <= to_d):
            continue
        effective.append(eff)
    return effective


def _build_initial_stock(loader, horizon_end: date) -> dict[str, float]:
    """Stock disponible + réceptions fournisseurs attendues dans l'horizon."""
    stock: dict[str, float] = {}
    for article, stock_obj in loader.stocks.items():
        stock[article] = stock_obj.disponible()
    for reception in loader.receptions:
        if reception.quantite_restante <= 0:
            continue
        if reception.date_reception_prevue and reception.date_reception_prevue <= horizon_end:
            stock[reception.article] = stock.get(reception.article, 0.0) + float(
                reception.quantite_restante
            )
    return stock


def _direct_purchase_requirements(loader, article: str, quantity: float) -> dict[str, float]:
    """Besoins en composants ACHAT directs (niveau 1) d'un article."""
    requirements: dict[str, float] = {}
    nomenclature = loader.get_nomenclature(article)
    if not nomenclature:
        return requirements
    for composant in nomenclature.composants:
        if composant.is_achete():
            requirements[composant.article_composant] = (
                requirements.get(composant.article_composant, 0.0)
                + composant.qte_requise(quantity)
            )
    return requirements


def _classify(result, missing: dict[str, float]) -> str:
    if any("Nomenclature non disponible" in alert for alert in result.alerts):
        return "sans_nomenclature"
    return "ok" if result.feasible else "bloque"


def evaluate_window(
    loader,
    effective_ofs: list[OF],
    *,
    horizon_end: date,
    use_receptions: bool = True,
) -> dict[str, FeasibilityEntry]:
    """Évalue la faisabilité de tous les OF avec allocation virtuelle séquentielle."""
    initial_stock = _build_initial_stock(loader, horizon_end) if use_receptions else {
        article: stock_obj.disponible() for article, stock_obj in loader.stocks.items()
    }
    stock_state = StockState(initial_stock)

    # OF fermes avec allocations ERP : composants déjà réservés dans l'ERP
    # (le stock disponible exclut déjà le stock alloué) → pas d'allocation virtuelle.
    firm_with_erp_allocations = {
        of.num_of
        for of in effective_ofs
        if is_firm_of_status(of.statut_num) and loader.get_allocations_of(of.num_of)
    }

    # Pré-passe : faisabilité sur stock complet, pour la règle 2 (faisable d'abord)
    pre_checker = RecursiveChecker(loader, use_receptions=use_receptions)
    pre_feasible: dict[str, bool] = {}
    for of in effective_ofs:
        if of.num_of in firm_with_erp_allocations:
            continue
        pre_feasible[of.num_of] = pre_checker.check_of(of).feasible

    def _date_besoin(of: OF) -> date:
        return of.date_debut or of.date_fin

    ordered = sorted(
        (of for of in effective_ofs if of.num_of not in firm_with_erp_allocations),
        key=lambda of: (
            0 if is_firm_of_status(of.statut_num) else 1,  # affermis prioritaires
            _date_besoin(of),
            not pre_feasible.get(of.num_of, False),  # règle 2 : faisable d'abord
            of.num_of,
        ),
    )

    entries: dict[str, FeasibilityEntry] = {}

    # 1. Fermes avec allocations ERP : vérification simple, sans stock virtuel
    for of in effective_ofs:
        if of.num_of not in firm_with_erp_allocations:
            continue
        result = pre_checker.check_of(of)
        entries[of.num_of] = FeasibilityEntry(
            num_of=of.num_of,
            article=of.article,
            faisable=result.feasible,
            statut=_classify(result, result.missing_components),
            missing_components=dict(result.missing_components),
            alerts=list(result.alerts),
            date_besoin=_date_besoin(of).isoformat(),
            statut_num=of.statut_num,
        )

    # 2. Les autres : allocation virtuelle séquentielle (concurrence composants)
    runtime_checker = RecursiveChecker(
        loader, use_receptions=use_receptions, stock_state=stock_state
    )
    for of in ordered:
        result = runtime_checker.check_of(of)
        allocated: dict[str, float] = {}
        if result.feasible:
            for article, besoin in _direct_purchase_requirements(
                loader, of.article, of.qte_restante
            ).items():
                qte = min(besoin, stock_state.get_available(article))
                if qte > 0:
                    allocated[article] = qte
            if allocated:
                stock_state.allocate(of.num_of, allocated)
        entries[of.num_of] = FeasibilityEntry(
            num_of=of.num_of,
            article=of.article,
            faisable=result.feasible,
            statut=_classify(result, result.missing_components),
            missing_components=dict(result.missing_components),
            alerts=list(result.alerts),
            allocated=allocated,
            date_besoin=_date_besoin(of).isoformat(),
            statut_num=of.statut_num,
        )

    return entries


def _orders_linked_to_of(loader) -> dict[str, list[dict[str, Any]]]:
    """Index num_of → commandes clients liées (contremarque MTS ou ordre d'origine)."""
    origin_by_of: dict[str, str] = {
        of.num_of: of.num_ordre_origine for of in loader.ofs if of.num_ordre_origine
    }
    linked: dict[str, list[dict[str, Any]]] = {}
    by_num_commande: dict[str, list[Any]] = {}
    for besoin in loader.commandes_clients:
        by_num_commande.setdefault(besoin.num_commande, []).append(besoin)
        if besoin.of_contremarque:
            linked.setdefault(besoin.of_contremarque, []).append(_order_dict(besoin))
    for num_of, origine in origin_by_of.items():
        for besoin in by_num_commande.get(origine, []):
            entry = _order_dict(besoin)
            if entry not in linked.get(num_of, []):
                linked.setdefault(num_of, []).append(entry)
    return linked


def _order_dict(besoin) -> dict[str, Any]:
    return {
        "num_commande": besoin.num_commande,
        "client": besoin.nom_client,
        "article": besoin.article,
        "qte_restante": besoin.qte_restante,
        "date_expedition": besoin.date_expedition_demandee.isoformat()
        if besoin.date_expedition_demandee
        else None,
        "type_commande": str(getattr(besoin.type_commande, "value", besoin.type_commande)),
    }


def whatif_order(
    loader,
    overrides: dict[str, dict[str, Any]],
    *,
    article: str,
    quantite: int,
    date_besoin: date,
    from_d: date,
    to_d: date,
) -> dict[str, Any]:
    """Simule une nouvelle commande/OF et mesure l'impact sur l'existant.

    Cas métier : un client demande X pièces d'un article à une date.
    Avant d'enregistrer, on veut savoir si c'est faisable et surtout si
    cela assèche des composants d'OF/commandes déjà en place.
    """
    effective_ofs = build_effective_ofs(loader, overrides, from_d, to_d)
    horizon_end = max(to_d, date_besoin)

    baseline = evaluate_window(loader, effective_ofs, horizon_end=horizon_end)

    virtual = OF(
        num_of=WHATIF_NUM_OF,
        article=article,
        description=f"Simulation commande {quantite} x {article}",
        statut_num=3,
        statut_texte="Suggéré",
        date_debut=date_besoin,
        date_fin=date_besoin,
        qte_a_fabriquer=quantite,
        qte_fabriquee=0,
        qte_restante=quantite,
    )
    scenario = evaluate_window(
        loader, effective_ofs + [virtual], horizon_end=horizon_end
    )

    new_entry = scenario.pop(WHATIF_NUM_OF)
    linked_orders = _orders_linked_to_of(loader)

    degraded: list[dict[str, Any]] = []
    improved: list[dict[str, Any]] = []
    for num_of, before in baseline.items():
        after = scenario.get(num_of)
        if after is None:
            continue
        if before.faisable and not after.faisable:
            new_missing = {
                comp: qty
                for comp, qty in after.missing_components.items()
                if comp not in before.missing_components
            }
            degraded.append(
                {
                    **after.to_dict(),
                    "composants_perdus": {k: round(v, 3) for k, v in new_missing.items()},
                    "commandes": linked_orders.get(num_of, []),
                }
            )
        elif not before.faisable and after.faisable:
            improved.append(after.to_dict())

    degraded.sort(key=lambda item: item["date_besoin"] or "9999")

    return {
        "demande": {
            "article": article,
            "quantite": quantite,
            "date_besoin": date_besoin.isoformat(),
        },
        "nouvelle": new_entry.to_dict(),
        "degraded": degraded,
        "improved": improved,
        "stats": {
            "nb_of_evalues": len(baseline),
            "nb_degrades": len(degraded),
            "nb_ameliores": len(improved),
            "nb_commandes_touchees": sum(len(d["commandes"]) for d in degraded),
        },
    }
