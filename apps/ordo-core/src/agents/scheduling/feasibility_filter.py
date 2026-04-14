"""Filtre les OFs selon la disponibilité des composants."""

from typing import Dict, Set, Any


class FeasibilityFilter:
    """Identifie les composants en rupture et filtre les OFs candidats."""

    def extract_stockout_components(self, feasibility_results: Dict[str, Any]) -> Set[str]:
        """Extrait les composants en rupture depuis les résultats de faisabilité S+1."""
        stockouts = set()
        for result in feasibility_results.values():
            if not result.feasible and hasattr(result, 'missing_components'):
                stockouts.update(result.missing_components.keys())
        return stockouts

    def of_uses_stockout_component(self, of, stockout_components: Set[str], loader) -> bool:
        """Retourne True si l'OF utilise au moins un composant en rupture."""
        if not stockout_components:
            return False
        nomenclature = loader.get_nomenclature(of.article)
        if not nomenclature or not nomenclature.composants:
            return False  # Nomenclature inconnue → pas bloqué par défaut
        return any(
            comp.article_composant in stockout_components
            for comp in nomenclature.composants
        )

    def filter_feasible_candidates(self, ofs, stockout_components: Set[str], loader) -> list:
        """Retourne les OFs qui NE consomment PAS les composants en rupture."""
        return [
            of for of in ofs
            if not self.of_uses_stockout_component(of, stockout_components, loader)
        ]
