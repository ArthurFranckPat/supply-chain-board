"""Parser for Article entities from ERP CSV rows."""

from ..models.article import Article, TypeApprovisionnement
from .parsing_utils import parse_float, parse_int


def parse_article(row: dict) -> Article:
    """Create an Article from an ERP CSV row dict."""
    type_appro_str = row.get("TYPE_APPRO", "ACHAT")
    try:
        type_appro = TypeApprovisionnement(type_appro_str)
    except ValueError:
        type_appro = TypeApprovisionnement.ACHAT

    return Article(
        code=row.get("ARTICLE", ""),
        description=row.get("DESIGNATION", ""),
        categorie=row.get("CATEGORIE", ""),
        type_appro=type_appro,
        delai_reappro=parse_int(row.get("DELAI_REAPPRO", 0)),
        famille_produit=row.get("FAMILLE_PRODUIT") or None,
        pmp=parse_float(row.get("PMP")) if "PMP" in row and row.get("PMP") not in (None, "") else None,
    )
