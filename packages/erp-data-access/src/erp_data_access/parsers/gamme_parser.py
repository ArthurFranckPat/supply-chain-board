"""Parser for GammeOperation entities from ERP CSV rows."""

from ..models.gamme import GammeOperation
from .parsing_utils import parse_float


def parse_gamme_operation(row: dict) -> GammeOperation:
    """Create a GammeOperation from an ERP CSV row dict."""
    return GammeOperation(
        article=row.get("ARTICLE", ""),
        poste_charge=row.get("POSTE_CHARGE", ""),
        libelle_poste=row.get("LIBELLE_POSTE", ""),
        cadence=parse_float(row.get("CADENCE", "0")),
    )
