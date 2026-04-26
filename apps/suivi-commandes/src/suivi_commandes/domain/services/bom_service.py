"""Domain service : calcul de rupture composants dans la BOM.

Algorithme pur — ne dépend d'aucune source de données concrète.
Reçoit un BomDataSource (port) pour lire BOM et stock.
"""

from __future__ import annotations

from ..ports import BomDataSource


def get_component_shortages(
    data_source: BomDataSource,
    article: str,
    quantity: float,
    own_allocations: dict[str, float],
    _seen: set[str] | None = None,
) -> dict[str, float]:
    """Descend la BOM récursivement et retourne les composants en rupture.

    Règles métier :
    - Article sans BOM → feuille : comparer besoin net au stock dispo.
    - Composant acheté → feuille : idem.
    - Composant fabriqué → descendre dans sa sous-nomenclature.
    - Les allocations propres à l'OF sont déduites du besoin.

    Parameters
    ----------
    data_source : BomDataSource
        Port d'accès aux données BOM/stock (implémenté par l'infrastructure).
    article : str
        Article racine à analyser.
    quantity : float
        Quantité requise de l'article racine.
    own_allocations : dict[str, float]
        Allocations existantes par article (provenant de l'OF).

    Returns
    -------
    dict[str, float]
        {article_composant: quantite_manquante}
    """
    _seen = _seen or set()
    if article in _seen:
        return {}
    _seen.add(article)

    bom = data_source.get_bom(article)

    # Pas de BOM → article feuille, on compare au stock
    if bom is None:
        dispo = data_source.get_available_stock(article)
        already = own_allocations.get(article, 0.0)
        net = max(0.0, quantity - already)
        if dispo < net:
            return {article: net - dispo}
        return {}

    shortages: dict[str, float] = {}

    for comp in bom.composants:
        net_req = max(0.0, comp.qte_par_parent - own_allocations.get(comp.article, 0.0))
        if net_req <= 0:
            continue

        # Feuille (acheté ou pas de BOM) → comparer au stock
        if comp.est_achete or data_source.get_bom(comp.article) is None:
            dispo = data_source.get_available_stock(comp.article)
            if dispo < net_req:
                shortages[comp.article] = shortages.get(comp.article, 0.0) + (net_req - dispo)
        else:
            # Fabriqué → descente récursive
            sub = get_component_shortages(data_source, comp.article, net_req, own_allocations, _seen.copy())
            for art, qty in sub.items():
                shortages[art] = shortages.get(art, 0.0) + qty

    return shortages


def is_in_bom(
    data_source: BomDataSource,
    component: str,
    article: str,
    _seen: set[str] | None = None,
) -> bool:
    """True si le composant apparaît quelque part dans l'arbre BOM de l'article."""
    _seen = _seen or set()
    if article in _seen:
        return False
    _seen.add(article)

    bom = data_source.get_bom(article)
    if bom is None:
        return False

    for comp in bom.composants:
        if comp.article == component:
            return True
        if comp.est_fabrique and is_in_bom(data_source, component, comp.article, _seen):
            return True
    return False


def is_component_in_subassembly(
    data_source: BomDataSource,
    component: str,
    root_article: str,
) -> bool:
    """True si le composant est dans un sous-ensemble fabriqué (niveau > 1)."""
    bom = data_source.get_bom(root_article)
    if bom is None:
        return False

    direct = {c.article for c in bom.composants}
    if component in direct:
        return False  # Niveau 1 — pas un sous-ensemble

    for comp in bom.composants:
        if comp.est_fabrique:
            sub = data_source.get_bom(comp.article)
            if sub and component in {c.article for c in sub.composants}:
                return True
            if is_in_bom(data_source, component, comp.article):
                return True
    return False
