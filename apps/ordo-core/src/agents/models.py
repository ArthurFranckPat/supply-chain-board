"""Modèles de données pour la couche décision métier."""

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from ..models.of import OF
from ..models.besoin_client import BesoinClient
from ..checkers.base import FeasibilityResult


class AgentAction(Enum):
    """Actions possibles après décision métier."""

    ACCEPT_AS_IS = "accept_as_is"
    # → OF accepté tel quel, pas de modification

    ACCEPT_PARTIAL = "accept_partial"
    # → OF accepté avec quantité réduite (modifie OF.qte_restante)

    REJECT = "reject"
    # → OF rejeté, impossible à satisfaire

    DEFER = "defer"
    # → OF reporté à plus tard

    DEFER_PARTIAL = "defer_partial"
    # → Accepter partie immédiate + reporter le reste


@dataclass
class AgentDecision:
    """Résultat d'une décision métier."""

    action: AgentAction
    # Action décidée

    reason: str
    # Explication courte (ex: "Accepter 98.6% (145/147)")

    modified_quantity: Optional[int] = None
    # Nouvelle quantité si ACCEPT_PARTIAL

    defer_date: Optional[date] = None
    # Date de report si DEFER

    metadata: Dict[str, Any] = field(default_factory=dict)
    # Métadonnées détaillées pour logs/audit

    timestamp: datetime = field(default_factory=datetime.now)
    # Timestamp de la décision


@dataclass
class AgentContext:
    """Contexte disponible pour les critères de décision."""

    of: OF
    # OF à évaluer

    commande: Optional[BesoinClient] = None
    # Commande associée (si disponible)

    feasibility_result: Optional[FeasibilityResult] = None
    # Résultat de vérification de faisabilité (post-allocation)

    initial_stock: Dict[str, int] = field(default_factory=dict)
    # Stock initial par article (avant toute allocation)

    allocated_stock: Dict[str, int] = field(default_factory=dict)
    # Stock alloué par article (cumul des allocations)

    remaining_stock: Dict[str, int] = field(default_factory=dict)
    # Stock restant par article = initial - allocated

    competing_ofs: List[OF] = field(default_factory=list)
    # OFs en concurrence

    current_date: Optional[date] = None
    # Date courante pour calculs d'urgence
