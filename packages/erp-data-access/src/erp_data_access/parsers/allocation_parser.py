"""Parser for OFAllocation entities from ERP CSV rows."""

from __future__ import annotations

from datetime import datetime

from ..models.allocation import OFAllocation
from .parsing_utils import parse_float


def parse_allocation(row: dict) -> OFAllocation:
    """Create an OFAllocation from an ERP CSV row dict."""
    article = row.get("ARTICLE", "")
    qte_allouee = parse_float(row.get("QTE_ALLOUEE", "0"))
    num_doc = row.get("NUM_ORDRE", "")
    raw_date = row.get("DATE_FIN", "")

    date_besoin_obj = None
    for fmt in (
        "%m/%d/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y",
        "%Y-%m-%d",
    ):
        try:
            date_besoin_obj = datetime.strptime(str(raw_date).strip(), fmt)
            break
        except (ValueError, TypeError):
            continue

    if date_besoin_obj is not None:
        date_besoin = date_besoin_obj.strftime("%d/%m/%Y")
    else:
        date_besoin = str(raw_date or "")

    return OFAllocation(
        article=article,
        qte_allouee=qte_allouee,
        num_doc=num_doc,
        date_besoin=date_besoin,
        date_besoin_obj=date_besoin_obj,
    )
