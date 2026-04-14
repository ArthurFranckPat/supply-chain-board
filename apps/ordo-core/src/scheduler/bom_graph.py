"""Helpers BOM et lignes cibles pour AUTORESEARCH."""

from __future__ import annotations

from functools import lru_cache

from .capacity import TARGET_LINES

TRACKED_BDH = ("BDH2216AL", "BDH2231AL", "BDH2251AL")


class BomGraph:
    """Expose quelques lectures derivees a partir des nomenclatures et gammes."""

    def __init__(self, loader):
        self.loader = loader

    def primary_line(self, article: str) -> str | None:
        """Retourne la ligne cible principale d'un article si elle existe."""
        gamme = self.loader.get_gamme(article)
        if not gamme:
            return None
        for target in TARGET_LINES:
            if any(op.poste_charge == target for op in gamme.operations):
                return target
        return None

    @lru_cache(maxsize=None)
    def tracked_component_qty_per_unit(self, article: str) -> dict[str, float]:
        """Calcule la quantite unitaire des BDH suivis dans la BOM recursive."""
        quantities = {component: 0.0 for component in TRACKED_BDH}
        nomenclature = self.loader.get_nomenclature(article)
        if not nomenclature:
            return quantities

        for component in nomenclature.composants:
            if component.article_composant in TRACKED_BDH:
                quantities[component.article_composant] += float(component.qte_lien)
            elif component.is_fabrique():
                child_quantities = self.tracked_component_qty_per_unit(component.article_composant)
                for tracked, child_qty in child_quantities.items():
                    quantities[tracked] += float(component.qte_lien) * child_qty

        return quantities

    def tracked_component_qty(self, article: str, quantity: int) -> dict[str, int]:
        """Explose les quantites BDH suivies pour une quantite d'article."""
        per_unit = self.tracked_component_qty_per_unit(article)
        return {
            tracked: int(round(component_qty * quantity))
            for tracked, component_qty in per_unit.items()
            if component_qty > 0
        }
