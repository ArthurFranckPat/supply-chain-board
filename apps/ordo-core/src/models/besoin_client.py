"""Modele BesoinClient pour les extractions ERP."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
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


@dataclass
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
        def _to_str(value) -> str:
            if isinstance(value, str):
                return value
            if isinstance(value, (int, float)):
                if str(value).lower() == "nan":
                    return ""
                return str(value)
            return ""

        def _parse_date(value) -> Optional[date]:
            raw = _to_str(value).strip()
            if not raw:
                return None
            for fmt in (
                "%m/%d/%Y %H:%M:%S",
                "%d/%m/%Y %H:%M:%S",
                "%d/%m/%Y",
                "%Y-%m-%d",
            ):
                try:
                    return datetime.strptime(raw, fmt).date()
                except ValueError:
                    continue
            return None

        def _parse_int(value) -> int:
            if isinstance(value, (int, float)):
                if str(value).lower() == "nan":
                    return 0
                return int(value)
            if isinstance(value, str):
                cleaned = value.replace(",", "").replace(" ", "").strip()
                if cleaned == "" or cleaned == "-" or cleaned.lower() == "nan":
                    return 0
                return int(float(cleaned))
            return 0

        source_origine = _to_str(row.get("SOURCE_ORIGINE_BESOIN", "")).strip()
        source_upper = source_origine.upper()

        if source_upper.startswith("VENT"):
            nature_besoin = NatureBesoin.COMMANDE
        else:
            nature_besoin = NatureBesoin.PREVISION

        type_str = _to_str(row.get("TYPE_COMMANDE", "NOR")).strip().upper()
        try:
            type_commande = TypeCommande(type_str)
        except ValueError:
            type_commande = TypeCommande.NOR

        date_commande = _parse_date(row.get("DATE_DEBUT", ""))
        date_expedition = _parse_date(row.get("DATE_FIN", "")) or date.today()

        qte_commandee = _parse_int(row.get("QTE_COMMANDEE", 0))
        qte_allouee = _parse_int(row.get("QTE_ALLOUEE", 0))
        qte_rest_fabrication = _parse_int(row.get("QTE_RESTANTE_FABRICATION", 0))
        # Pour le matching OF, on utilise la quantité réellement à fabriquer.
        qte_restante = max(qte_rest_fabrication, 0)

        return cls(
            nom_client=_to_str(row.get("NOM_FOURNISSEUR_OU_CLIENT", "")).strip(),
            code_pays=_to_str(row.get("PAYS", "")).strip(),
            type_commande=type_commande,
            num_commande=_to_str(row.get("NUM_ORDRE", "")).strip(),
            nature_besoin=nature_besoin,
            article=_to_str(row.get("ARTICLE", "")).strip(),
            description=_to_str(row.get("DESIGNATION", "")).strip(),
            categorie=_to_str(row.get("CATEGORIE", "")).strip(),
            source_origine_besoin=source_origine,
            of_contremarque=_to_str(row.get("OF_CONTREMARQUE", "")).strip(),
            date_commande=date_commande,
            date_expedition_demandee=date_expedition,
            qte_commandee=qte_commandee,
            qte_allouee=qte_allouee,
            qte_restante=qte_restante,
        )

    def __repr__(self) -> str:
        nature = self.nature_besoin.value
        return (
            f"BesoinClient({self.num_commande} - {self.article} - "
            f"{self.qte_restante} unites - {nature} - "
            f"{self.date_expedition_demandee})"
        )
