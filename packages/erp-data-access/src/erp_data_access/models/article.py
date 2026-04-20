"""Modèle Article."""

from dataclasses import dataclass
from enum import Enum


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
