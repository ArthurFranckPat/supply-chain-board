"""Modele Nomenclature."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import unicodedata


class TypeArticle(Enum):
    """Type d'article (composant)."""

    ACHETE = "Achete"
    FABRIQUE = "Fabrique"


class NatureConsommation(Enum):
    """Nature de la consommation d'un composant."""

    FORFAIT = "Au Forfait"
    PROPORTIONNEL = "Proportionnel"

    @classmethod
    def from_string(cls, value: str) -> "NatureConsommation":
        value_upper = str(value or "").upper().strip()

        if "FORFAIT" in value_upper:
            return cls.FORFAIT
        if "PROPORTIONNEL" in value_upper:
            return cls.PROPORTIONNEL
        return cls.PROPORTIONNEL


@dataclass(slots=True)
class NomenclatureEntry:
    """Entree de nomenclature (relation parent -> composant)."""

    article_parent: str
    designation_parent: str
    niveau: int
    article_composant: str
    designation_composant: str
    qte_lien: float
    type_article: TypeArticle
    nature_consommation: NatureConsommation = NatureConsommation.PROPORTIONNEL

    def is_achete(self) -> bool:
        return self.type_article == TypeArticle.ACHETE

    def is_fabrique(self) -> bool:
        return self.type_article == TypeArticle.FABRIQUE

    def qte_requise(self, qte_parent: int) -> int:
        if self.nature_consommation == NatureConsommation.FORFAIT:
            return int(self.qte_lien)
        return int(self.qte_lien * qte_parent)

    @classmethod
    def from_csv_row(cls, row: dict) -> "NomenclatureEntry":
        from ..parsers.nomenclature_parser import parse_nomenclature_entry
        return parse_nomenclature_entry(row)

    def __repr__(self) -> str:
        return (
            f"NomenclatureEntry({self.article_parent} -> {self.article_composant}, "
            f"qte={self.qte_lien}, type={self.type_article.value})"
        )


@dataclass(slots=True)
class Nomenclature:
    """Nomenclature d'un article (liste des composants)."""

    article: str
    designation: str
    composants: list[NomenclatureEntry]

    def get_composants_niveau(self, niveau: int) -> list[NomenclatureEntry]:
        return [c for c in self.composants if c.niveau == niveau]

    def get_composants_aches(self) -> list[NomenclatureEntry]:
        return [c for c in self.composants if c.is_achete()]

    def get_composants_fabriques(self) -> list[NomenclatureEntry]:
        return [c for c in self.composants if c.is_fabrique()]

    @classmethod
    def from_csv_rows(cls, article: str, rows: list[dict]) -> "Nomenclature":
        from ..parsers.nomenclature_parser import parse_nomenclature
        return parse_nomenclature(article, rows)

    def __repr__(self) -> str:
        return f"Nomenclature({self.article}: {len(self.composants)} composants)"
