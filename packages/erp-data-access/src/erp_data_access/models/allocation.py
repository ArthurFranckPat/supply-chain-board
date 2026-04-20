"""Modele OF Allocation - lien OF/commande vers composants alloues."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass(slots=True)
class OFAllocation:
    """Allocation d'un article a un document (OF ou commande)."""

    article: str
    qte_allouee: float
    num_doc: str
    date_besoin: str
    date_besoin_obj: Optional[datetime] = None

    @classmethod
    def from_csv_row(cls, row: dict) -> "OFAllocation":
        from ..parsers.allocation_parser import parse_allocation
        return parse_allocation(row)

    def __repr__(self) -> str:
        return f"OFAllocation({self.article} : {self.qte_allouee} -> {self.num_doc})"
