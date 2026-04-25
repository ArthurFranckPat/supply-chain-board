"""Modèle Article."""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class TypeApprovisionnement(Enum):
    """Type d'approvisionnement."""

    ACHAT = "ACHAT"
    FABRICATION = "FABRICATION"


@dataclass
class Article:
    """Article du catalogue produits."""

    code: str
    description: str
    categorie: str
    type_appro: TypeApprovisionnement
    delai_reappro: int
    famille_produit: Optional[str] = None
    pmp: Optional[float] = None
    lot_eco: Optional[int] = None
    cond_qte_1: Optional[int] = None
    cond_type_1: Optional[str] = None
    cond_qte_2: Optional[int] = None
    cond_type_2: Optional[str] = None
    cond_qte_3: Optional[int] = None
    cond_type_3: Optional[str] = None
    unite_stock: Optional[str] = None
    unite_achat: Optional[str] = None
    coeff_ua_us: float = 1.0

    def conditionnements(self) -> list[tuple[int, str]]:
        """Retourne les conditionnements tries par quantite croissante."""
        conds = []
        for qte, typ in [
            (self.cond_qte_1, self.cond_type_1),
            (self.cond_qte_2, self.cond_type_2),
            (self.cond_qte_3, self.cond_type_3),
        ]:
            if qte and qte > 0:
                conds.append((qte, typ or ""))
        return sorted(conds, key=lambda c: c[0])

    def arrondir_au_conditionnement(self, qte: int) -> int:
        """Arrondit une quantite au conditionnement le plus proche (arrondi superieur)."""
        conds = self.conditionnements()
        if not conds or qte <= 0:
            return qte
        plus_petit = conds[0][0]
        return ((qte + plus_petit - 1) // plus_petit) * plus_petit

    def is_achat(self) -> bool:
        return self.type_appro == TypeApprovisionnement.ACHAT

    def is_fabrication(self) -> bool:
        return self.type_appro == TypeApprovisionnement.FABRICATION

    def is_fantome(self) -> bool:
        return str(self.categorie or "").upper() == "AFANT"

    @classmethod
    def from_csv_row(cls, row: dict) -> "Article":
        from ..parsers.article_parser import parse_article
        return parse_article(row)

    def __repr__(self) -> str:
        return f"Article({self.code} - {self.description})"
