"""Modele Stock."""

from dataclasses import dataclass


@dataclass(slots=True)
class Stock:
    """Etat du stock pour un article."""

    article: str
    stock_physique: int
    stock_alloue: int
    stock_bloque: int

    def disponible(self) -> int:
        """Retourne le stock disponible (physique - alloue)."""
        return self.stock_physique - self.stock_alloue

    @property
    def stock_sous_controle(self) -> int:
        return self.stock_bloque

    @classmethod
    def from_csv_row(cls, row: dict) -> "Stock":
        from ..parsers.stock_parser import parse_stock
        return parse_stock(row)

    def __repr__(self) -> str:
        return f"Stock({self.article}: {self.disponible()} disponible)"
