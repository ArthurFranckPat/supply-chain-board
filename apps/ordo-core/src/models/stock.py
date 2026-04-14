"""Modèle Stock."""

from dataclasses import dataclass


@dataclass
class Stock:
    """État du stock pour un article.

    Attributes
    ----------
    article : str
        Code article
    stock_physique : int
        Stock physique total
    stock_alloue : int
        Stock alloué (réservé pour des commandes/OF)
    stock_bloque : int
        Stock sous contrôle (en contrôle qualité) - DISPO SOUS RÉSERVE
    """

    article: str
    stock_physique: int
    stock_alloue: int
    stock_bloque: int

    def disponible(self) -> int:
        """Retourne le stock disponible (physique - alloué).

        Note: Le stock bloqué (sous contrôle qualité) est CONSIDÉRÉ COMME DISPO
        car c'est du stock disponible sous réserve de contrôle.
        """
        return self.stock_physique - self.stock_alloue

    @property
    def stock_sous_controle(self) -> int:
        """Retourne le stock sous contrôle (en contrôle qualité)."""
        return self.stock_bloque

    def _parse_int(value) -> int:
        """Convertit une valeur en int, en gérant les virgules de milliers."""
        if isinstance(value, (int, float)):
            return int(value)
        if isinstance(value, str):
            # Retirer les virgules de milliers
            cleaned = value.replace(",", "").replace(" ", "").strip()
            if cleaned == "" or cleaned == "-" or cleaned == "NaN":
                return 0
            return int(float(cleaned))
        return 0

    @classmethod
    def from_csv_row(cls, row: dict) -> "Stock":
        """Crée un Stock à partir d'une ligne CSV.

        Parameters
        ----------
        row : dict
            Dictionnaire contenant les champs du CSV

        Returns
        -------
        Stock
            Instance de Stock créée à partir de la ligne CSV
        """
        return cls(
            article=row.get("ARTICLE", ""),
            stock_physique=cls._parse_int(row.get("STOCK_PHYSIQUE", 0)),
            stock_alloue=cls._parse_int(row.get("STOCK_ALLOUE", 0)),
            stock_bloque=cls._parse_int(row.get("STOCK_BLOQUE", 0)),
        )

    def __repr__(self) -> str:
        """Représentation textuelle du stock."""
        return f"Stock({self.article}: {self.disponible()} disponible)"
