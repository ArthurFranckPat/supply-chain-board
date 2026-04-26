from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class BomNavigator(Protocol):
    """Port : navigation et analyse de la nomenclature (BOM).

    Centralise la logique de descente récursive dans la BOM,
    partagée entre l'analyse des causes de retard et le calcul de charge.
    """

    def get_component_shortages(
        self,
        article: str,
        quantity: float,
        own_allocations: dict[str, float],
    ) -> dict[str, float]:
        """Descend la BOM et retourne les composants en rupture.

        Returns
        -------
        dict[str, float]
            {article_composant: quantite_manquante}
        """
        ...

    def is_component_in_subassembly(self, component: str, root_article: str) -> bool:
        """True si le composant est dans un sous-ensemble fabriqué (niveau > 1)."""
        ...

    def is_in_bom(self, component: str, article: str) -> bool:
        """True si le composant apparaît quelque part dans l'arbre BOM de l'article."""
        ...
