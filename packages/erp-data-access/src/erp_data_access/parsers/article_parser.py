"""Parser for Article entities from ERP CSV rows."""

from ..models.article import Article, TypeApprovisionnement
from .parsing_utils import parse_float, parse_int, to_str


def parse_article(row: dict) -> Article:
    """Create an Article from an ERP CSV row dict."""
    type_appro_str = row.get("TYPE_APPRO", "ACHAT")
    try:
        type_appro = TypeApprovisionnement(type_appro_str)
    except ValueError:
        type_appro = TypeApprovisionnement.ACHAT

    famille_raw = row.get("FAMILLE_PRODUIT")
    famille_produit = to_str(famille_raw) or None

    lot_eco_raw = row.get("LOT_ECO")
    lot_eco = parse_int(lot_eco_raw) if lot_eco_raw is not None else None

    return Article(
        code=row.get("ARTICLE", ""),
        description=row.get("DESIGNATION", ""),
        categorie=row.get("CATEGORIE", ""),
        type_appro=type_appro,
        delai_reappro=parse_int(row.get("DELAI_REAPRO", 0)),
        famille_produit=famille_produit,
        pmp=parse_float(row.get("PMP")),
        lot_eco=lot_eco,
    )
