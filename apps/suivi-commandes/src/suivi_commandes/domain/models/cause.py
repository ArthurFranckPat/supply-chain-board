from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class CauseType(Enum):
    STOCK_DISPONIBLE_NON_ALLOUE = "stock_disponible_non_alloue"
    ATTENTE_RECEPTION_FOURNISSEUR = "attente_reception_fournisseur"
    AUCUN_OF_PLANIFIE = "aucun_of_planifie"
    RUPTURE_COMPOSANTS = "rupture_composants"
    INCONNUE = "inconnue"


@dataclass(frozen=True, slots=True)
class RetardCause:
    """Cause structurée d'un retard de production — remplace le parsing textuel.

    Avant : "Rupture composants: COMP-001 x2, COMP-002 x5"
    Après  : RetardCause(type=RUPTURE_COMPOSANTS, composants={"COMP-001": 2.0, ...})
    """
    type_cause: CauseType
    composants: dict[str, float] = field(default_factory=dict)
    message: str = ""

    def to_display_string(self) -> str:
        if self.type_cause == CauseType.STOCK_DISPONIBLE_NON_ALLOUE:
            return "Stock disponible — non alloué"
        if self.type_cause == CauseType.ATTENTE_RECEPTION_FOURNISSEUR:
            return "Attente réception fournisseur"
        if self.type_cause == CauseType.AUCUN_OF_PLANIFIE:
            return "Aucun OF planifié"
        if self.type_cause == CauseType.RUPTURE_COMPOSANTS:
            parts = [f"{art} x{self._fmt_qty(qty)}" for art, qty in sorted(self.composants.items())]
            return "Rupture composants: " + ", ".join(parts)
        return self.message or ""

    @staticmethod
    def _fmt_qty(value: float) -> str:
        rounded = round(value, 3)
        if abs(rounded - round(rounded)) < 1e-9:
            return str(int(round(rounded)))
        return str(rounded)
