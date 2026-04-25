"""Parser for Stock entities from ERP CSV rows."""

from ..models.stock import Stock
from .parsing_utils import parse_int


def parse_stock(row: dict) -> Stock:
    """Create a Stock from an ERP CSV row dict."""
    return Stock(
        article=row.get("ARTICLE", ""),
        stock_physique=parse_int(row.get("STOCK_PHYSIQUE", 0)),
        stock_alloue=parse_int(row.get("ALLOUE_TOTAL", 0)),
        stock_sous_cq=parse_int(row.get("STOCK_SOUS_CQ", 0)),
    )
