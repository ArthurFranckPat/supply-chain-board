"""Modele Stock."""

from dataclasses import dataclass


@dataclass
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

    def _parse_int(value) -> int:
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            cleaned = value.replace(",", "").replace(" ", "").strip()
            if cleaned == "" or cleaned == "-" or cleaned.lower() == "nan":
                return 0
            return int(float(cleaned))
        return 0

    @classmethod
    def from_csv_row(cls, row: dict) -> "Stock":
        return cls(
            article=row.get("ARTICLE", ""),
            stock_physique=cls._parse_int(row.get("STOCK_PHYSIQUE", 0)),
            stock_alloue=cls._parse_int(row.get("ALLOUE_TOTAL", 0)),
            stock_bloque=cls._parse_int(row.get("STOCK_SOUS_CQ", 0)),
        )

    def __repr__(self) -> str:
        return f"Stock({self.article}: {self.disponible()} disponible)"
