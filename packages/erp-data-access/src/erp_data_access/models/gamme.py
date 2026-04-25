"""Modèles de données pour les gammes de production."""

from dataclasses import dataclass
from typing import Optional


@dataclass(slots=True)
class GammeOperation:
    """Opération de gamme (poste de charge)."""

    article: str
    poste_charge: str
    libelle_poste: str
    cadence: float

    @classmethod
    def from_csv_row(cls, row: dict) -> "GammeOperation":
        from ..parsers.gamme_parser import parse_gamme_operation
        return parse_gamme_operation(row)


@dataclass(slots=True)
class Gamme:
    """Gamme de production pour un article."""

    article: str
    operations: list[GammeOperation]

    def get_operation_for_poste(self, poste: str) -> Optional[GammeOperation]:
        for op in self.operations:
            if op.poste_charge == poste:
                return op
        return None

    def calculate_hours(self, quantity: float, poste: str) -> float:
        op = self.get_operation_for_poste(poste)
        if not op or op.cadence == 0:
            return 0.0
        return quantity / op.cadence

    def calculate_all_hours(self, quantity: float) -> dict[str, float]:
        result = {}
        for op in self.operations:
            if op.cadence > 0:
                hours = quantity / op.cadence
                result[op.poste_charge] = result.get(op.poste_charge, 0) + hours
        return result
