"""Implémentation de BomNavigator via le DataReader ERP.

⚠️  DEPRECATED — utilise BomNavigatorFacade + BomDataSource + BomService à la place.
Ce fichier est conservé pour la compatibilité ascendante uniquement.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from suivi_commandes.domain.bom_port import BomNavigator

if TYPE_CHECKING:
    from erp_data_access.protocols import DataReader


class DataReaderBomNavigator(BomNavigator):
    """Implémentation de BomNavigator via le DataReader ERP."""

    def __init__(self, data_reader: "DataReader") -> None:
        self._reader = data_reader

    def get_component_shortages(
        self,
        article: str,
        quantity: float,
        own_allocations: dict[str, float],
        seen: set[str] | None = None,
    ) -> dict[str, float]:
        seen = seen or set()
        if article in seen:
            return {}
        seen.add(article)

        nom = self._reader.get_nomenclature(article)
        if nom is None:
            stock = self._reader.get_stock(article)
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

            if comp.is_achete() or self._reader.get_nomenclature(comp.article_composant) is None:
                stock = self._reader.get_stock(comp.article_composant)
                dispo = stock.disponible() if stock else 0.0
                if dispo < net_req:
                    shortages[comp.article_composant] = (
                        shortages.get(comp.article_composant, 0.0) + (net_req - dispo)
                    )
            else:
                sub = self.get_component_shortages(
                    comp.article_composant,
                    net_req,
                    own_allocations,
                    seen.copy(),
                )
                for art, qty in sub.items():
                    shortages[art] = shortages.get(art, 0.0) + qty

        return shortages

    def is_component_in_subassembly(self, component: str, root_article: str) -> bool:
        nom = self._reader.get_nomenclature(root_article)
        if nom is None:
            return False

        direct_components = {c.article_composant for c in nom.composants}
        if component in direct_components:
            return False

        for comp in nom.composants:
            if comp.is_fabrique():
                sub_nom = self._reader.get_nomenclature(comp.article_composant)
                if sub_nom:
                    sub_components = {c.article_composant for c in sub_nom.composants}
                    if component in sub_components:
                        return True
                if self.is_in_bom(component, comp.article_composant):
                    return True
        return False

    def is_in_bom(self, component: str, article: str, seen: set[str] | None = None) -> bool:
        seen = seen or set()
        if article in seen:
            return False
        seen.add(article)

        nom = self._reader.get_nomenclature(article)
        if nom is None:
            return False

        for comp in nom.composants:
            if comp.article_composant == component:
                return True
            if comp.is_fabrique() and self.is_in_bom(component, comp.article_composant, seen):
                return True
        return False
