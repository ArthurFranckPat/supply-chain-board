"""Modèle BesoinClient - Remplace CommandeClient pour besoins_clients.csv."""

from dataclasses import dataclass
from datetime import date
from datetime import datetime
from enum import Enum
from typing import Optional


class TypeCommande(Enum):
    """Type de commande."""

    MTS = "MTS"
    NOR = "NOR"
    MTO = "MTO"


class NatureBesoin(Enum):
    """Nature du besoin."""

    COMMANDE = "COMMANDE"
    PREVISION = "PREVISION"


@dataclass
class BesoinClient:
    """Besoin client (commande ou prévision).

    Structure basée UNIQUEMENT sur les colonnes RÉELLES de besoins_clients.csv.
    AUCUN champ inventé (pas de ligne_commande, code_client, description, flag_contremarque).

    Attributes
    ----------
    nom_client : str
        Nom du client (NOM_CLIENT)
    code_pays : str
        Code pays du client (PAYS_CLIENT: FR, DE, ES, IT, etc.)
    type_commande : TypeCommande
        Type de commande (TYPE_COMMANDE: MTS, NOR, MTO)
    num_commande : str
        Numéro de commande (NUM_COMMANDE)
    nature_besoin : NatureBesoin
        Nature du besoin (NATURE_BESOIN: COMMANDE, PREVISION)
    article : str
        Code article commandé (ARTICLE)
    of_contremarque : str
        Numéro d'OF lié (OF_CONTREMARQUE) - pour MTS
    date_commande : Optional[date]
        Date de passage de commande (DATE_COMMANDE) - peut être vide
    date_expedition_demandee : date
        Date d'expédition demandée (DATE_EXPEDITION_DEMANDEE)
    qte_commandee : int
        Quantité commandée (QTE_COMMANDEE)
    qte_allouee : int
        Quantité déjà allouée (QTE_ALLOUEE)
    qte_restante : int
        Quantité restante à servir (QTE_RESTANTE)
    """

    nom_client: str
    code_pays: str
    type_commande: TypeCommande
    num_commande: str
    nature_besoin: NatureBesoin
    article: str
    of_contremarque: str
    date_commande: Optional[date]
    date_expedition_demandee: date
    qte_commandee: int
    qte_allouee: int
    qte_restante: int

    def is_mts(self) -> bool:
        """Vérifie si c'est une commande MTS."""
        return self.type_commande == TypeCommande.MTS

    def is_nor_mto(self) -> bool:
        """Vérifie si c'est une commande NOR ou MTO."""
        return self.type_commande in (TypeCommande.NOR, TypeCommande.MTO)

    def est_commande(self) -> bool:
        """Vérifie si c'est une commande réelle."""
        return self.nature_besoin == NatureBesoin.COMMANDE

    def est_prevision(self) -> bool:
        """Vérifie si c'est une prévision."""
        return self.nature_besoin == NatureBesoin.PREVISION

    def est_france(self) -> bool:
        """Vérifie si c'est un client France (marché domestique)."""
        return self.code_pays == "FR"

    def est_export(self) -> bool:
        """Vérifie si c'est un client Export (hors France)."""
        return self.code_pays != "FR"

    @classmethod
    def from_csv_row(cls, row: dict) -> "BesoinClient":
        """Crée un BesoinClient depuis une ligne CSV.

        Parameters
        ----------
        row : dict
            Ligne CSV parsée

        Returns
        -------
        BesoinClient
            Instance créée
        """
        # Helper pour convertir n'importe quel type en string
        def _to_str(value) -> str:
            """Convertit une valeur en string, gérant les types pandas."""
            if isinstance(value, str):
                return value
            if isinstance(value, (int, float)):
                # Gérer NaN
                if str(value) == "nan" or str(value) == "NaN":
                    return ""
                return str(value)
            return ""

        # Parser TYPE_COMMANDE
        type_str = _to_str(row.get("TYPE_COMMANDE", "")).strip().upper()
        try:
            type_commande = TypeCommande(type_str)
        except ValueError:
            type_commande = TypeCommande.NOR  # Défaut si vide ou invalide

        # Parser NATURE_BESOIN
        nature_str = _to_str(row.get("NATURE_BESOIN", "COMMANDE")).strip().upper()
        try:
            nature_besoin = NatureBesoin(nature_str)
        except ValueError:
            nature_besoin = NatureBesoin.COMMANDE  # Défaut

        # Parser les dates
        def _parse_date(date_str: str) -> Optional[date]:
            """Parse une date au format français JJ/MM/AAAA."""
            date_str = _to_str(date_str)
            if not date_str or not date_str.strip():
                return None
            try:
                return datetime.strptime(date_str.strip(), "%d/%m/%Y").date()
            except ValueError:
                return None

        # Parser les entiers
        def _parse_int(value) -> int:
            if isinstance(value, (int, float)):
                # Gérer NaN
                if str(value) == "nan" or str(value) == "NaN":
                    return 0
                return int(value)
            if isinstance(value, str):
                cleaned = value.replace(",", "").replace(" ", "").strip()
                if cleaned == "" or cleaned == "-" or cleaned == "NaN":
                    return 0
                return int(float(cleaned))
            return 0

        return cls(
            nom_client=_to_str(row.get("NOM_CLIENT", "")).strip(),
            code_pays=_to_str(row.get("PAYS_CLIENT", "")).strip(),
            type_commande=type_commande,
            num_commande=_to_str(row.get("NUM_COMMANDE", "")).strip(),
            nature_besoin=nature_besoin,
            article=_to_str(row.get("ARTICLE", "")).strip(),
            of_contremarque=_to_str(row.get("OF_CONTREMARQUE", "")).strip(),
            date_commande=_parse_date(row.get("DATE_COMMANDE", "")),
            date_expedition_demandee=_parse_date(row.get("DATE_EXPEDITION_DEMANDEE", "")) or date.today(),
            qte_commandee=_parse_int(row.get("QTE_COMMANDEE", 0)),
            qte_allouee=_parse_int(row.get("QTE_ALLOUEE", 0)),
            qte_restante=_parse_int(row.get("QTE_RESTANTE", 0)),
        )

    def __repr__(self) -> str:
        """Représentation textuelle du besoin."""
        type_str = self.type_commande.value
        of_link = f" → OF: {self.of_contremarque}" if self.of_contremarque else ""
        return (
            f"BesoinClient({self.num_commande} - {self.article} - "
            f"{self.qte_restante} unités - {type_str}{of_link} - "
            f"{self.date_expedition_demandee})"
        )
