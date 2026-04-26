"""Facade BomNavigator — assemble BomDataSource + BomService.

Garde le contrat BomNavigator existant tout en séparant
internement l'accès aux données (BomDataSource) de la logique
métier (BomService).
"""

from __future__ import annotations

from suivi_commandes.domain.bom_port import BomNavigator
from suivi_commandes.domain.bom_service import (
    get_component_shortages as _shortages,
    is_component_in_subassembly as _in_sub,
    is_in_bom as _in_bom,
)
from suivi_commandes.domain.bom_source_port import BomDataSource


class BomNavigatorFacade(BomNavigator):
    """Implémente BomNavigator en déléguant à BomDataSource + BomService."""

    def __init__(self, data_source: BomDataSource) -> None:
        self._ds = data_source

    def get_component_shortages(
        self,
        article: str,
        quantity: float,
        own_allocations: dict[str, float],
    ) -> dict[str, float]:
        return _shortages(self._ds, article, quantity, own_allocations)

    def is_component_in_subassembly(self, component: str, root_article: str) -> bool:
        return _in_sub(self._ds, component, root_article)

    def is_in_bom(self, component: str, article: str) -> bool:
        return _in_bom(self._ds, component, article)
