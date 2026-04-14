"""Critère de taux de complétion."""

from typing import Optional

from .base import BaseCriterion
from ..models import AgentContext, AgentAction


class CompletionCriterion(BaseCriterion):
    """Critère de taux de complétion.

    Accepte les OFs avec un taux de complétion ≥ seuil configuré.
    """

    CRITERION_ID = "completion"
    CRITERION_NAME = "Completion Rate"
    DESCRIPTION = "Évalue le taux de complétion de l'OF"

    def score(self, context: AgentContext) -> float:
        # Si pas de résultat de faisabilité → score neutre
        if not context.feasibility_result:
            return 0.5

        if context.feasibility_result.feasible:
            return 1.0  # 100% faisable

        missing = context.feasibility_result.missing_components
        if not missing:
            return 1.0

        # Calculer le taux de complétion (composant limitant)
        of = context.of
        total_needed = of.qte_restante
        total_missing = sum(missing.values())

        completion_rate = 1.0
        for component, qte_missing in missing.items():
            stock = context.initial_stock.get(component, 0)
            if stock + qte_missing > 0:
                component_rate = stock / (stock + qte_missing)
                completion_rate = min(completion_rate, component_rate)

        # Score linéaire : 0.0 si < 80%, 1.0 si ≥ 95%
        min_rate = self.config.get("min_acceptable_rate", 0.80)
        target_rate = self.config.get("target_completion_rate", 0.95)

        if completion_rate >= target_rate:
            return 1.0
        elif completion_rate <= min_rate:
            return 0.0
        else:
            # Interpolation linéaire
            return (completion_rate - min_rate) / (target_rate - min_rate)

    def suggest_action(self, context: AgentContext, score: float) -> Optional[AgentAction]:
        # Si 100% faisable → accepter tel quel
        if context.feasibility_result and context.feasibility_result.feasible:
            return AgentAction.ACCEPT_AS_IS

        # Si score élevé mais pas faisable à 100% → proposer acceptation partielle
        if score >= 0.8 and context.feasibility_result and context.feasibility_result.missing_components:
            missing = context.feasibility_result.missing_components
            total_missing = sum(missing.values())

            # Vérifier l'écart absolu max
            max_gap = self.config.get("max_absolute_gap", 10)
            if total_missing <= max_gap:
                return AgentAction.ACCEPT_PARTIAL

        # Si score parfait (1.0) mais pas de missing (cas théorique)
        if score >= 1.0:
            return AgentAction.ACCEPT_AS_IS

        return None
