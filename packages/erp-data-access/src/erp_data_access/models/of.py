"""Modele OF (Ordre de Fabrication)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Optional


class StatutOF(Enum):
    """Statut d'un OF."""

    FERME = 1
    PLANIFIE = 2
    SUGGERE = 3


@dataclass
class OF:
    """Ordre de fabrication."""

    num_of: str
    article: str
    description: str
    statut_num: int
    statut_texte: str
    date_fin: date
    qte_a_fabriquer: int
    qte_fabriquee: int
    qte_restante: int
    date_debut: Optional[date] = None
    methode_obtention_livraison: str = ""
    num_ordre_origine: str = ""

    def is_ferme(self) -> bool:
        return self.statut_num == 1

    def is_suggere(self) -> bool:
        return self.statut_num == 3

    @classmethod
    def from_csv_row(cls, row: dict) -> "OF":
        from ..parsers.of_parser import parse_of
        return parse_of(row)

    def __repr__(self) -> str:
        return (
            f"OF({self.num_of}: {self.article} - {self.qte_restante} "
            f"a fabriquer avant le {self.date_fin})"
        )
