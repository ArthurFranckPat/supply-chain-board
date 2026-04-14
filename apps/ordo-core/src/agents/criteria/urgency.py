"""Critère d'urgence temporelle."""

from typing import Optional
from datetime import date

from .base import BaseCriterion
from ..models import AgentContext, AgentAction


class UrgencyCriterion(BaseCriterion):
    """Critère d'urgence temporelle.

    Évalue l'urgence de l'OF basée sur la date de fin.
    """

    CRITERION_ID = "urgency"
    CRITERION_NAME = "Urgency"
    DESCRIPTION = "Évalue l'urgence de l'OF"

    def score(self, context: AgentContext) -> float:
        """Calcule le score d'urgence basé sur les jours restants."""
        if not context.of.date_fin or not context.current_date:
            return 0.5

        days_until = (context.of.date_fin - context.current_date).days

        very_urgent = self.config.get("very_urgent_days", 3)
        urgent = self.config.get("urgent_days", 7)
        comfortable = self.config.get("comfortable_days", 21)

        if days_until <= very_urgent:
            return 1.0
        elif days_until <= urgent:
            return 0.8
        elif days_until <= comfortable:
            return 0.5
        else:
            return 0.3

    def suggest_action(self, context: AgentContext, score: float) -> Optional[AgentAction]:
        """Suggère ACCEPT_AS_IS pour les OF urgents avec petit gap de composants."""
        if not context.feasibility_result or context.feasibility_result.feasible:
            return None

        missing = context.feasibility_result.missing_components
        total_missing = sum(missing.values())
        total_needed = context.of.qte_restante
        gap_pct = total_missing / total_needed if total_needed > 0 else 0

        if score >= 1.0:  # Very urgent
            max_gap = self.config.get("very_urgent_tolerance", 0.05)
            if gap_pct <= max_gap:
                return AgentAction.ACCEPT_AS_IS
        elif score >= 0.8:  # Urgent
            max_gap = self.config.get("urgent_tolerance", 0.02)
            if gap_pct <= max_gap:
                return AgentAction.ACCEPT_AS_IS

        return None
