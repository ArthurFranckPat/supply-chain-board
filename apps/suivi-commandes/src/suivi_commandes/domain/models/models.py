from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Optional


class TypeCommande(Enum):
    MTS = "MTS"
    MTO = "MTO"
    NOR = "NOR"


class Status(Enum):
    A_EXPEDIER = "A Expédier"
    ALLOCATION_A_FAIRE = "Allocation à faire"
    RETARD_PROD = "Retard Prod"
    RAS = "RAS"


@dataclass(frozen=True, slots=True)
class Emplacement:
    """Un emplacement physique de stock pour une ligne de commande."""
    nom: str
    hum: Optional[str] = None
    date_mise_en_stock: Optional[date] = None
    qte_palette: Optional[float] = None


@dataclass(frozen=True, slots=True)
class OrderLine:
    """Ligne de commande client — modèle de domaine pur.

    Immutable, sans dépendance pandas ni ERP.
    """
    num_commande: str
    article: str
    designation: str = ""
    nom_client: str = ""
    type_commande: TypeCommande = TypeCommande.MTO

    date_expedition: Optional[date] = None
    date_liv_prevue: Optional[date] = None

    qte_commandee: float = 0.0
    qte_allouee: float = 0.0
    qte_restante: float = 0.0

    is_fabrique: bool = False
    is_hard_pegged: bool = False

    emplacements: list[Emplacement] = field(default_factory=list)

    def besoin_net(self) -> float:
        return max(0.0, self.qte_restante - self.qte_allouee)

    def en_zone_expedition(self, pattern: str = r"QUAI|SM|EXP|S9C|S3C") -> bool:
        import re
        regex = re.compile(pattern, re.IGNORECASE)
        return any(regex.search(e.nom) for e in self.emplacements)

    def is_retard(self, ref_date: date) -> bool:
        if self.date_expedition is None:
            return False
        return self.date_expedition < ref_date and not self.en_zone_expedition()

    def to_dict(self) -> dict:
        """Sérialisation légère pour la présentation."""
        return {
            "No commande": self.num_commande,
            "Article": self.article,
            "Désignation 1": self.designation,
            "Nom client commande": self.nom_client,
            "Type commande": self.type_commande.value,
            "Date expedition": self.date_expedition.isoformat() if self.date_expedition else None,
            "Date liv prévue": self.date_liv_prevue.isoformat() if self.date_liv_prevue else None,
            "Quantité commandée": self.qte_commandee,
            "Qté allouée": self.qte_allouee,
            "Quantité restante": self.qte_restante,
            "Emplacement": ", ".join(e.nom for e in self.emplacements) if self.emplacements else None,
            "HUM": self.emplacements[0].hum if self.emplacements else None,
            "_is_fabrique": self.is_fabrique,
            "_is_hard_pegged": self.is_hard_pegged,
        }