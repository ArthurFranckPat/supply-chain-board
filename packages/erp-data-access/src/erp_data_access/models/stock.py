from dataclasses import dataclass


@dataclass(slots=True)
class Stock:
    article: str
    stock_physique: int
    stock_alloue: int
    stock_bloque: int

    def disponible(self) -> int:
        """Stock utilisable pour la planification (inclut le stock Q)."""
        return self.stock_physique - self.stock_alloue

    def disponible_strict(self) -> int:
        """Stock strictement disponible (exclut le stock sous contrôle qualité)."""
        return self.stock_physique - self.stock_alloue - self.stock_bloque

    @property
    def stock_sous_controle(self) -> int:
        return self.stock_bloque

    @classmethod
    def from_csv_row(cls, row: dict) -> 'Stock':
        from ..parsers.stock_parser import parse_stock
        return parse_stock(row)

    def __repr__(self) -> str:
        return f'Stock({self.article}: {self.disponible()} disponible)'
