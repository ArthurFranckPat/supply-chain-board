"""Modele BesoinClient pour les extractions ERP."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Optional


class TypeCommande(Enum):
    """Type de commande exploite par le moteur."""

    MTS = "MTS"
    NOR = "NOR"
    MTO = "MTO"


class NatureBesoin(Enum):
    """Nature du besoin."""

    COMMANDE = "COMMANDE"
    PREVISION = "PREVISION"


@dataclass(slots=True)
class BesoinClient:
    """Besoin client (commande ou prevision) issu de l'ERP."""

    nom_client: str
    code_pays: str
    type_commande: TypeCommande
    num_commande: str
    nature_besoin: NatureBesoin
    article: str
    description: str
    categorie: str
    source_origine_besoin: str
    of_contremarque: str
    date_commande: Optional[date]
    date_expedition_demandee: date
    qte_commandee: int
    qte_allouee: int
    qte_restante: int
    qte_restante_livraison: int

    def is_mts(self) -> bool:
        return self.type_commande == TypeCommande.MTS

    def is_nor_mto(self) -> bool:
        return self.type_commande in (TypeCommande.NOR, TypeCommande.MTO)

    def est_commande(self) -> bool:
        return self.nature_besoin == NatureBesoin.COMMANDE

    def est_prevision(self) -> bool:
        return self.nature_besoin == NatureBesoin.PREVISION

    def est_france(self) -> bool:
        return self.code_pays == "FR"

    def est_export(self) -> bool:
        return self.code_pays != "FR"

    @classmethod
    def from_csv_row(cls, row: dict) -> "BesoinClient":
        from ..parsers.besoin_client_parser import parse_besoin_client
        return parse_besoin_client(row)

    def __repr__(self) -> str:
        nature = self.nature_besoin.value
        return (
            f"BesoinClient({self.num_commande} - {self.article} - "
            f"{self.qte_restante} unites - {nature} - "
            f"{self.date_expedition_demandee})"
        )
