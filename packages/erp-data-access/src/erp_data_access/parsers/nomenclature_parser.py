"""Parser for Nomenclature entities from ERP CSV rows."""

from __future__ import annotations

import unicodedata

from ..models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle, NatureConsommation
from .parsing_utils import parse_float


def parse_nomenclature_entry(row: dict) -> NomenclatureEntry:
    """Create a NomenclatureEntry from an ERP CSV row dict."""
    qte_lien = parse_float(row.get("QTE_LIEN", "0"))

    type_raw = str(row.get("TYPE_COMPOSANT", "Achete")).strip()
    normalized_type = (
        unicodedata.normalize("NFKD", type_raw)
        .encode("ASCII", "ignore")
        .decode("ASCII")
        .upper()
    )
    type_article = TypeArticle.FABRIQUE if normalized_type.startswith("FAB") else TypeArticle.ACHETE

    nature_str = row.get("NATURE_CONSOMMATION", "Proportionnel")
    nature_consommation = NatureConsommation.from_string(nature_str)

    return NomenclatureEntry(
        article_parent=row.get("ARTICLE_PARENT", ""),
        designation_parent=row.get("DESIGNATION_PARENT", ""),
        niveau=int(row.get("NIVEAU", 0)),
        article_composant=row.get("ARTICLE_COMPOSANT", ""),
        designation_composant=row.get("DESIGNATION_COMPOSANT", ""),
        qte_lien=qte_lien,
        type_article=type_article,
        nature_consommation=nature_consommation,
    )


def parse_nomenclature(article: str, rows: list[dict]) -> Nomenclature:
    """Create a Nomenclature from a grouped set of ERP CSV rows."""
    if not rows:
        return Nomenclature(article=article, designation="", composants=[])
    designation = rows[0].get("DESIGNATION_PARENT", "")
    composants = [parse_nomenclature_entry(row) for row in rows]
    return Nomenclature(article=article, designation=designation, composants=composants)
