"""Parser for TarifAchat entities from ERP CSV rows."""

from __future__ import annotations

from ..models.tarif_achat import TarifAchat
from .parsing_utils import parse_date, parse_float, parse_int, to_str


def parse_tarif_achat(row: dict) -> TarifAchat:
    return TarifAchat(
        fiche_tarif=to_str(row.get("FICHE_TARIF", "")),
        code_fournisseur=parse_int(row.get("CODE_FOURNISSEUR", 0)),
        article=to_str(row.get("ARTICLE", "")),
        date_debut_validite=parse_date(row.get("DATE_DEBUT_VALIDITE")),
        date_fin_validite=parse_date(row.get("DATE_FIN_VALIDITE")),
        quantite_mini=parse_float(row.get("QUANTITE_MINI", 0)),
        quantite_maxi=parse_float(row.get("QUANTITE_MAXI", 0)),
        prix_unitaire=parse_float(row.get("PRIX_UNITAIRE", 0)),
        unite=to_str(row.get("UNITE", "")),
        devise=to_str(row.get("DEVISE", "")),
    )
