"""Critère de priorité client."""

from typing import Optional

from .base import BaseCriterion
from ..models import AgentContext, AgentAction


class ClientCriterion(BaseCriterion):
    """Critère de priorité client.

    Priorise les clients stratégiques et prioritaires.
    """

    CRITERION_ID = "client"
    CRITERION_NAME = "Client Priority"
    DESCRIPTION = "Priorise les clients stratégiques"

    def score(self, context: AgentContext) -> float:
        # Pas de commande → neutre
        if not context.commande:
            return 0.5

        # Utiliser nom_client pour identifier le client
        # (car BesoinClient n'a pas de champ code_client)
        client_name = context.commande.nom_client
        priority_clients = self.config.get("priority_clients", [])
        strategic_clients = self.config.get("strategic_clients", [])

        if client_name in priority_clients:
            return 1.0  # Client prioritaire (ALDES)
        elif client_name in strategic_clients:
            return 0.8  # Client stratégique
        else:
            return 0.5  # Client standard

    def suggest_action(self, context: AgentContext, score: float) -> Optional[AgentAction]:
        # Client prioritaire avec OF non faisable → forcer
        if score >= 1.0:
            if context.feasibility_result and not context.feasibility_result.feasible:
                # Vérifier si c'est quand même raisonnable
                missing = context.feasibility_result.missing_components
                total_missing = sum(missing.values())
                total_needed = context.of.qte_restante
                gap_pct = total_missing / total_needed if total_needed > 0 else 0

                # Tolérer jusqu'à 5% pour clients prioritaires
                max_gap_pct = self.config.get("priority_client_max_gap", 0.05)
                if gap_pct <= max_gap_pct:
                    return AgentAction.ACCEPT_AS_IS

        return None
