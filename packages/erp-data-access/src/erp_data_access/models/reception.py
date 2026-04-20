"""Modele Reception."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass
class Reception:
    """Reception fournisseur planifiee."""

    num_commande: str
    article: str
    code_fournisseur: str
    quantite_restante: int
    date_reception_prevue: date

    def est_disponible_avant(self, date_limite: date) -> bool:
        return self.date_reception_prevue < date_limite

    @classmethod
    def from_csv_row(cls, row: dict) -> "Reception":
        from ..parsers.reception_parser import parse_reception
        return parse_reception(row)

    def __repr__(self) -> str:
        return (
            f"Reception({self.article}: {self.quantite_restante} "
            f"prevus le {self.date_reception_prevue})"
        )
