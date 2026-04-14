"""Règle de décision intelligente combinant tous les critères avec scoring pondéré."""

from typing import Dict, Any, List, Optional, Tuple
from datetime import date, datetime

from .config import load_config
from .models import AgentContext, AgentDecision, AgentAction
from .criteria import BaseCriterion, CompletionCriterion, ClientCriterion, UrgencyCriterion


class SmartDecisionRule:
    """Règle de décision intelligente avec scoring pondéré multi-critères.

    Combinaison de tous les critères avec poids :
    - completion: 0.5 (taux de complétion)
    - client: 0.3 (priorité client)
    - urgency: 0.2 (urgence temporelle)

    Algorithme :
    1. Charge la configuration YAML
    2. Initialise tous les critères
    3. Évalue le contexte avec chaque critère
    4. Calcule le score pondéré : Σ(score × weight)
    5. Détermine l'action basée sur :
       - Suggestions explicites des critères (priorité)
       - Seuils de score pondéré (≥0.7 accept, ≤0.3 reject)
    6. Génère les métadonnées détaillées
    """

    def __init__(self, config_path: str = "config/decisions.yaml"):
        """Initialise la règle avec la configuration.

        Parameters
        ----------
        config_path : str
            Chemin vers le fichier de configuration YAML
        """
        self.config = load_config(config_path)
        self.weights = self.config["smart_rule"]["criteria_weights"]
        self.thresholds = self.config["thresholds"]

        # Initialiser les critères
        completion_config = self.config.get("completion", {})
        client_config = self.config.get("client", {})
        urgency_config = self.config.get("urgency", {})

        self.criteria: List[BaseCriterion] = [
            CompletionCriterion(completion_config),
            ClientCriterion(client_config),
            UrgencyCriterion(urgency_config)
        ]

    def evaluate(self, context: AgentContext) -> AgentDecision:
        """Évalue un contexte de décision et retourne une action.

        Parameters
        ----------
        context : AgentContext
            Contexte de décision à évaluer

        Returns
        -------
        AgentDecision
            Résultat de la décision (action, reason, metadata)
        """
        # 1. Évaluer chaque critère
        criteria_scores: Dict[str, float] = {}
        suggestions: List[Tuple[str, Optional[AgentAction]]] = []

        for criterion in self.criteria:
            if criterion.is_applicable(context):
                score = criterion.score(context)
                action = criterion.suggest_action(context, score)

                criteria_scores[criterion.CRITERION_ID] = score
                if action is not None:
                    suggestions.append((criterion.CRITERION_ID, action))

        # 2. Calculer le score pondéré
        weighted_score = self._calculate_weighted_score(criteria_scores)

        # 3. Déterminer l'action
        action = self._decide_action(weighted_score, suggestions, context)

        # 4. Calculer la quantité partielle si nécessaire
        modified_quantity = None
        if action == AgentAction.ACCEPT_PARTIAL:
            modified_quantity = self._calculate_partial_quantity(context)

        # 5. Générer la raison et les métadonnées
        reason, metadata = self._generate_reason(
            action, weighted_score, criteria_scores, suggestions, context
        )

        # 6. Créer et retourner le résultat
        return AgentDecision(
            action=action,
            reason=reason,
            modified_quantity=modified_quantity,
            metadata=metadata
        )

    def _calculate_weighted_score(self, criteria_scores: Dict[str, float]) -> float:
        """Calcule le score pondéré à partir des scores des critères.

        Parameters
        ----------
        criteria_scores : Dict[str, float]
            Scores par critère (criterion_id → score)

        Returns
        -------
        float
            Score pondéré total (0.0 à 1.0)
        """
        weighted_sum = 0.0
        total_weight = 0.0

        for criterion_id, score in criteria_scores.items():
            weight = self.weights.get(criterion_id, 0.0)
            weighted_sum += score * weight
            total_weight += weight

        # Normaliser si les poids ne somment pas à 1
        if total_weight > 0:
            return weighted_sum / total_weight
        return 0.5  # Score neutre si pas de poids

    def _decide_action(
        self,
        weighted_score: float,
        suggestions: List[Tuple[str, Optional[AgentAction]]],
        context: AgentContext
    ) -> AgentAction:
        """Détermine l'action basée sur le score pondéré et les suggestions.

        Priorité :
        1. Suggestions explicites des critères
        2. Seuils de score pondéré

        Parameters
        ----------
        weighted_score : float
            Score pondéré total
        suggestions : List[Tuple[str, Optional[AgentAction]]]
            Suggestions des critères (criterion_id, action)
        context : AgentContext
            Contexte de décision

        Returns
        -------
        AgentAction
            Action décidée
        """
        accept_threshold = self.thresholds.get("accept_threshold", 0.7)
        reject_threshold = self.thresholds.get("reject_threshold", 0.3)

        # 1. Priorité aux suggestions explicites des critères
        if suggestions:
            # Compter les suggestions par action
            suggestion_counts: Dict[AgentAction, int] = {}
            for criterion_id, action in suggestions:
                if action is not None:
                    suggestion_counts[action] = suggestion_counts.get(action, 0) + 1

            # Si un critère suggère ACCEPT_AS_IS → priorité absolue
            if AgentAction.ACCEPT_AS_IS in suggestion_counts:
                return AgentAction.ACCEPT_AS_IS

            # Si un critère suggère ACCEPT_PARTIAL → priorité haute
            if AgentAction.ACCEPT_PARTIAL in suggestion_counts:
                return AgentAction.ACCEPT_PARTIAL

            # Si un critère suggère REJECT → priorité haute
            if AgentAction.REJECT in suggestion_counts:
                return AgentAction.REJECT

        # 2. Basé sur le score pondéré
        if weighted_score >= accept_threshold:
            return AgentAction.ACCEPT_AS_IS
        elif weighted_score <= reject_threshold:
            return AgentAction.REJECT
        else:
            # Zone intermédiaire → ACCEPT_PARTIAL par défaut
            return AgentAction.ACCEPT_PARTIAL

    def _calculate_partial_quantity(self, context: AgentContext) -> int:
        """Calcule la quantité pour une acceptation partielle.

        Utilise le taux de complétion cible (target_completion_rate).

        Parameters
        ----------
        context : AgentContext
            Contexte de décision

        Returns
        -------
        int
            Quantité partielle acceptée
        """
        target_rate = self.config.get("completion", {}).get("target_completion_rate", 0.95)
        original_quantity = context.of.qte_restante

        # Calculer la quantité partielle avec arrondi au plus proche
        partial_quantity = int(original_quantity * target_rate + 0.5)

        # S'assurer que c'est au moins 1 et pas plus que l'original
        partial_quantity = max(1, min(partial_quantity, original_quantity))

        return partial_quantity

    def _generate_reason(
        self,
        action: AgentAction,
        weighted_score: float,
        criteria_scores: Dict[str, float],
        suggestions: List[Tuple[str, Optional[AgentAction]]],
        context: AgentContext
    ) -> Tuple[str, Dict[str, Any]]:
        """Génère la raison et les métadonnées de la décision.

        Parameters
        ----------
        action : AgentAction
            Action décidée
        weighted_score : float
            Score pondéré total
        criteria_scores : Dict[str, float]
            Scores par critère
        suggestions : List[Tuple[str, Optional[AgentAction]]]
            Suggestions des critères
        context : AgentContext
            Contexte de décision

        Returns
        -------
        Tuple[str, Dict[str, Any]]
            (raison, métadonnées)
        """
        # Construire la raison
        reason_parts = []

        # Ajouter le score pondéré
        reason_parts.append(f"Score: {weighted_score:.2f}")

        # Ajouter les détails des critères
        for criterion_id, score in criteria_scores.items():
            criterion_name = self._get_criterion_name(criterion_id)
            reason_parts.append(f"{criterion_name}: {score:.2f}")

        # Ajouter les suggestions
        if suggestions:
            suggestion_strs = [f"{cid}→{act.value}" for cid, act in suggestions]
            reason_parts.append(f"Suggestions: {', '.join(suggestion_strs)}")

        # Ajouter des détails spécifiques à l'action
        if action == AgentAction.ACCEPT_AS_IS:
            if context.feasibility_result and context.feasibility_result.feasible:
                reason_parts.insert(0, "100% faisable")
            # Ajouter le client si prioritaire
            if context.commande and context.commande.nom_client:
                priority_clients = self.config.get("client", {}).get("priority_clients", [])
                if context.commande.nom_client in priority_clients:
                    reason_parts.insert(0, f"Client prioritaire {context.commande.nom_client}")
        elif action == AgentAction.ACCEPT_PARTIAL:
            if context.feasibility_result and not context.feasibility_result.feasible:
                missing = context.feasibility_result.missing_components
                if missing:
                    total_missing = sum(missing.values())
                    completion_rate = (context.of.qte_restante - total_missing) / context.of.qte_restante
                    reason_parts.insert(0, f"{completion_rate * 100:.1f}% faisable")

        reason = " | ".join(reason_parts)

        # Construire les métadonnées
        metadata = {
            "weighted_score": weighted_score,
            "criteria_scores": criteria_scores,
            "suggestions": [{"criterion": cid, "action": act.value if act else None} for cid, act in suggestions],
            "original_quantity": context.of.qte_restante,
            "decision_timestamp": datetime.now().isoformat()
        }

        # Ajouter des détails sur la faisabilité
        if context.feasibility_result:
            metadata["feasibility"] = {
                "feasible": context.feasibility_result.feasible,
                "missing_components": context.feasibility_result.missing_components,
                "alerts": context.feasibility_result.alerts,
                "components_checked": context.feasibility_result.components_checked
            }

        # Ajouter des détails sur la commande
        if context.commande:
            metadata["commande"] = {
                "client": context.commande.nom_client,
                "type": context.commande.type_commande.value,
                "date_expedition": context.commande.date_expedition_demandee.isoformat()
            }

        return reason, metadata

    def _get_criterion_name(self, criterion_id: str) -> str:
        """Retourne le nom lisible d'un critère.

        Parameters
        ----------
        criterion_id : str
            Identifiant du critère

        Returns
        -------
        str
            Nom du critère
        """
        for criterion in self.criteria:
            if criterion.CRITERION_ID == criterion_id:
                return criterion.CRITERION_NAME
        return criterion_id
