from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol, runtime_checkable, Optional

from suivi_commandes.domain.models import TypeCommande


@dataclass(frozen=True, slots=True)
class OFInfo:
    """Information d'un Ordre de Fabrication — modèle de domaine."""
    num_of: str
    article: str
    qte_restante: float
    statut_num: int
    date_debut: Optional[date] = None
    date_fin: Optional[date] = None


@runtime_checkable
class OfMatcher(Protocol):
    """Port : recherche d'OF correspondant à une ligne de commande."""

    def find_matching_of(
        self,
        num_commande: str,
        article: str,
        type_commande: TypeCommande,
    ) -> OFInfo | None:
        """Trouve l'OF planifiable correspondant à une commande.

        Logique :
        1. Hard-pegging (of_contremarque ou origine) pour MTS
        2. Fallback sur n'importe quel OF planifiable de l'article
        """
        ...

    def get_allocations(self, num_of: str) -> dict[str, float]:
        """Quantités déjà allouées dans l'ERP pour un OF donné."""
        ...
