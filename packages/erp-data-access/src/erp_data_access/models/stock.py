from dataclasses import dataclass


@dataclass(slots=True)
class Stock:
    article: str
    stock_physique: int
    stock_alloue: int
    stock_sous_cq: int

    def disponible(self) -> int:
        """Stock utilisable pour la planification (inclut le stock sous CQ)."""
        return self.stock_physique + self.stock_sous_cq - self.stock_alloue

    def disponible_strict(self) -> int:
        """Stock strictement disponible (exclut le stock sous contrôle qualité)."""
        return self.stock_physique - self.stock_alloue

    @property
    def stock_sous_controle_qualite(self) -> int:
        return self.stock_sous_cq

    @classmethod
    def from_csv_row(cls, row: dict) -> 'Stock':
        from ..parsers.stock_parser import parse_stock
        return parse_stock(row)

    def __repr__(self) -> str:
        return f'Stock({self.article}: {self.disponible()} disponible)'
