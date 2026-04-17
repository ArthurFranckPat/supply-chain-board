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


@dataclass
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
        """Quantite requise pour ce composant.

        FORFAIT : quantite fixe par OF (qte_lien), independamment du volume.
        PROPORTIONNEL : qte_lien * qte_parent.
        """
        if self.nature_consommation == NatureConsommation.FORFAIT:
            return int(self.qte_lien)
        return int(self.qte_lien * qte_parent)

    @classmethod
    def from_csv_row(cls, row: dict) -> "NomenclatureEntry":
        qte_str = str(row.get("QTE_LIEN", "0")).replace(",", ".")
        qte_lien = float(qte_str) if qte_str else 0.0

        type_raw = str(row.get("TYPE_COMPOSANT", "Achete")).strip()
        normalized_type = (
            unicodedata.normalize("NFKD", type_raw)
            .encode("ASCII", "ignore")
            .decode("ASCII")
            .upper()
        )
        if normalized_type.startswith("FAB"):
            type_article = TypeArticle.FABRIQUE
        else:
            type_article = TypeArticle.ACHETE

        nature_str = row.get("NATURE_CONSOMMATION", "Proportionnel")
        nature_consommation = NatureConsommation.from_string(nature_str)

        return cls(
            article_parent=row.get("ARTICLE_PARENT", ""),
            designation_parent=row.get("DESIGNATION_PARENT", ""),
            niveau=int(row.get("NIVEAU", 0)),
            article_composant=row.get("ARTICLE_COMPOSANT", ""),
            designation_composant=row.get("DESIGNATION_COMPOSANT", ""),
            qte_lien=qte_lien,
            type_article=type_article,
            nature_consommation=nature_consommation,
        )

    def __repr__(self) -> str:
        return (
            f"NomenclatureEntry({self.article_parent} -> {self.article_composant}, "
            f"qte={self.qte_lien}, type={self.type_article.value})"
        )


@dataclass
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
        if not rows:
            return cls(article=article, designation="", composants=[])

        designation = rows[0].get("DESIGNATION_PARENT", "")
        composants = [NomenclatureEntry.from_csv_row(row) for row in rows]

        return cls(article=article, designation=designation, composants=composants)

    def __repr__(self) -> str:
        return f"Nomenclature({self.article}: {len(self.composants)} composants)"
