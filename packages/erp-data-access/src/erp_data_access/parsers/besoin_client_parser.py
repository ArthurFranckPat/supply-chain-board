"""Parser for BesoinClient entities from ERP CSV rows."""

from __future__ import annotations

from datetime import date

from ..models.besoin_client import BesoinClient, TypeCommande, NatureBesoin
from .parsing_utils import parse_int, parse_date, to_str


def parse_besoin_client(row: dict) -> BesoinClient:
    """Create a BesoinClient from an ERP CSV row dict."""
    source_origine = to_str(row.get("SOURCE_ORIGINE_BESOIN", "")).strip()
    source_upper = source_origine.upper()

    if source_upper.startswith("VENT"):
        nature_besoin = NatureBesoin.COMMANDE
    else:
        nature_besoin = NatureBesoin.PREVISION

    type_str = to_str(row.get("TYPE_COMMANDE", "NOR")).strip().upper()
    try:
        type_commande = TypeCommande(type_str)
    except ValueError:
        type_commande = TypeCommande.NOR

    date_commande = parse_date(row.get("DATE_DEBUT", ""))
    date_expedition = parse_date(row.get("DATE_FIN", "")) or date.today()

    qte_commandee = parse_int(row.get("QTE_COMMANDEE", 0))
    qte_allouee = parse_int(row.get("QTE_ALLOUEE", 0))
    qte_rest_fabrication = parse_int(row.get("QTE_RESTANTE_FABRICATION", 0))
    qte_restante = max(qte_rest_fabrication, 0)
    qte_rest_livraison = parse_int(row.get("QTE_RESTANTE_LIVRAISON", 0))
    qte_restante_livraison = max(qte_rest_livraison, 0)

    return BesoinClient(
        nom_client=to_str(row.get("NOM_FOURNISSEUR_OU_CLIENT", "")).strip(),
        code_pays=to_str(row.get("PAYS", "")).strip(),
        type_commande=type_commande,
        num_commande=to_str(row.get("NUM_ORDRE", "")).strip(),
        nature_besoin=nature_besoin,
        article=to_str(row.get("ARTICLE", "")).strip(),
        description=to_str(row.get("DESIGNATION", "")).strip(),
        categorie=to_str(row.get("CATEGORIE", "")).strip(),
        source_origine_besoin=source_origine,
        of_contremarque=to_str(row.get("OF_CONTREMARQUE", "")).strip(),
        date_commande=date_commande,
        date_expedition_demandee=date_expedition,
        qte_commandee=qte_commandee,
        qte_allouee=qte_allouee,
        qte_restante=qte_restante,
        qte_restante_livraison=qte_restante_livraison,
    )
