"""Parser for OF (Ordre de Fabrication) entities from ERP CSV rows."""

from __future__ import annotations

from datetime import date

from ..models.of import OF
from .parsing_utils import parse_int, parse_date


def parse_of(row: dict) -> OF:
    """Create an OF from an ERP CSV row dict."""
    statut_raw = str(row.get("STATUT_ORDRE", "S")).strip().upper()
    statut_num_map = {"F": 1, "P": 2, "S": 3}
    statut_texte_map = {"F": "Ferme", "P": "Planifie", "S": "Suggere"}
    statut_num = statut_num_map.get(statut_raw, 3)
    statut_texte = statut_texte_map.get(statut_raw, "Suggere")

    date_fin = parse_date(row.get("DATE_FIN", ""), default=date.today())
    date_debut = parse_date(row.get("DATE_DEBUT", ""))

    return OF(
        num_of=row.get("NUM_ORDRE", ""),
        article=row.get("ARTICLE", ""),
        description=row.get("DESIGNATION", ""),
        statut_num=statut_num,
        statut_texte=statut_texte,
        date_fin=date_fin,
        qte_a_fabriquer=parse_int(row.get("QTE_COMMANDEE", 0)),
        qte_fabriquee=parse_int(row.get("QTE_REALISEE", 0)),
        qte_restante=parse_int(row.get("QTE_RESTANTE_LIVRAISON", 0)),
        date_debut=date_debut,
        methode_obtention_livraison=str(row.get("METHODE_OBTENTION_LIVRAISON", "")).strip(),
        num_ordre_origine=str(row.get("NUM_ORDRE_ORIGINE", "")).strip(),
    )
