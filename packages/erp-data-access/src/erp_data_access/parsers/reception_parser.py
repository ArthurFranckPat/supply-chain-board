"""Parser for Reception entities from ERP CSV rows."""

from __future__ import annotations

from datetime import date

from ..models.reception import Reception
from .parsing_utils import parse_int, parse_date


def parse_reception(row: dict) -> Reception:
    """Create a Reception from an ERP CSV row dict."""
    return Reception(
        num_commande=row.get("NUM_ORDRE", ""),
        article=row.get("ARTICLE", ""),
        code_fournisseur=row.get("NOM_FOURNISSEUR_OU_CLIENT", ""),
        quantite_restante=parse_int(row.get("QTE_RESTANTE_FABRICATION", 0)),
        date_reception_prevue=parse_date(row.get("DATE_FIN", ""), default=date.today()),
    )
