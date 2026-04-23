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

    lot_eco_raw = row.get("LOT_ECONOMIQUE")
    lot_eco = parse_int(lot_eco_raw) if lot_eco_raw is not None else None

    def _opt_int(key: str):
        raw = row.get(key)
        return parse_int(raw) if raw is not None else None

    def _opt_str(key: str):
        raw = row.get(key)
        val = to_str(raw)
        return val or None

    return Article(
        code=row.get("ARTICLE", ""),
        description=row.get("DESIGNATION", ""),
        categorie=row.get("CATEGORIE", ""),
        type_appro=type_appro,
        delai_reappro=parse_int(row.get("DELAI_REAPPRO", 0)),
        famille_produit=famille_produit,
        pmp=parse_float(row.get("PMP")),
        lot_eco=lot_eco,
        cond_qte_1=_opt_int("COND_QTE_1"),
        cond_type_1=_opt_str("COND_TYPE_1"),
        cond_qte_2=_opt_int("COND_QTE_2"),
        cond_type_2=_opt_str("COND_TYPE_2"),
        cond_qte_3=_opt_int("COND_QTE_3"),
        cond_type_3=_opt_str("COND_TYPE_3"),
        unite_stock=_opt_str("UNITE_STOCK"),
        unite_achat=_opt_str("UNITE_ACHAT"),
        coeff_ua_us=parse_float(row.get("COEFF_UA_US")) or 1.0,
    )
