"""Règle de décision basée sur LLM."""

import logging
from datetime import date
from typing import Dict, Optional, List

from ..models import AgentDecision, AgentAction, AgentContext
from ...models import OF, BesoinClient
from ...loaders import DataLoader
from .models import LLMAnalysisContext
from .context_builder import LLMContextBuilder
from .prompt_builder import LLMPromptBuilder
from .response_parser import LLMResponseParser
from .llm_client import BaseLLMClient


logger = logging.getLogger(__name__)


class LLMDecisionAgent:
    """Règle de décision basée sur LLM.

    Orchestre l'analyse contextuelle et l'appel au LLM pour prendre
    des décisions métier nuancées.
    """

    def __init__(
        self,
        llm_client: BaseLLMClient,
        config_path: Optional[str] = None
    ):
        """Initialise la règle avec tous les composants.

        Parameters
        ----------
        llm_client : BaseLLMClient
            Client LLM (peut être MockLLMClient pour les tests)
        config_path : str, optional
            Chemin vers la configuration YAML (pas utilisé pour l'instant)
        """
        self.llm_client = llm_client
        self.config_path = config_path

        # Initialiser les composants
        self.context_builder = LLMContextBuilder(loader=None)  # Sera défini dans evaluate()
        self.prompt_builder = LLMPromptBuilder()
        self.response_parser = LLMResponseParser()

    def _apply_prefilter(self, context) -> Optional["AgentDecision"]:
        """Résout les cas triviaux sans appel LLM.

        Returns None si le cas est ambigu et nécessite le LLM.
        Returns AgentDecision directement pour les cas évidents :
        - faisable → ACCEPT_AS_IS
        - non_faisable sans bloqué ni réception → REJECT
        """
        faisabilite = context.situation_globale.faisabilite

        if faisabilite == "faisable":
            return AgentDecision(
                action=AgentAction.ACCEPT_AS_IS,
                reason="Tous les composants disponibles, OF faisable immédiatement.",
                metadata={"prefilter": True, "faisabilite": "faisable"}
            )

        if faisabilite == "non_faisable":
            a_bloque = any(
                c.type_probleme in ("bloqué", "bloqué_insuffisant")
                for c in context.composants_critiques
            )
            a_reception = any(
                getattr(c, 'receptions_imminentes', 0) > 0
                for c in context.composants
            )
            if not a_bloque and not a_reception:
                raison = context.situation_globale.raison_blocage or "Composants manquants sans perspective"
                return AgentDecision(
                    action=AgentAction.REJECT,
                    reason=f"OF non faisable : {raison}. Aucune perspective de déblocage à court terme.",
                    metadata={"prefilter": True, "faisabilite": "non_faisable"}
                )

        return None

    def evaluate(
        self,
        of: OF,
        commande: Optional[BesoinClient],
        loader: DataLoader,
        competing_ofs: Optional[List[OF]] = None,
        current_date: date = date.today()
    ) -> AgentDecision:
        """Évalue un OF en utilisant le LLM.

        Parameters
        ----------
        of : OF
            OF à évaluer
        commande : BesoinClient, optional
            Commande associée
        loader : DataLoader
            DataLoader avec accès aux données
        competing_ofs : List[OF], optional
            OFs en concurrence (non utilisé pour l'instant)
        current_date : date
            Date courante

        Returns
        -------
        AgentDecision
            Décision prise par le LLM
        """
        try:
            # 1. Construire le contexte d'analyse
            logger.info(f"[{of.num_of}] Construction du contexte LLM...")
            self.context_builder.loader = loader
            context = self.context_builder.build_context(
                of, commande, current_date=current_date, competing_ofs=competing_ofs
            )

            # 2. Pré-filtre : résoudre les cas triviaux sans appel LLM
            prefilter_result = self._apply_prefilter(context)
            if prefilter_result is not None:
                logger.info(f"[{of.num_of}] Pré-filtre appliqué : {prefilter_result.action.value}")
                return prefilter_result

            # 3. Construire le prompt (cas ambigu → appel LLM)
            logger.debug(f"[{of.num_of}] Construction du prompt...")
            prompt_dict = context.to_dict()
            prompt = self.prompt_builder.build_decision_prompt(prompt_dict)
            system_prompt = self.prompt_builder.build_system_prompt()

            # 3. Appeler le LLM
            logger.info(f"[{of.num_of}] Appel au LLM...")
            llm_response = self.llm_client.call_llm_with_retry(
                prompt=prompt,
                system_prompt=system_prompt,
                max_retries=3
            )

            logger.debug(f"[{of.num_of}] Réponse LLM reçue (longueur: {len(llm_response)})")

            # 4. Parser la réponse
            logger.debug(f"[{of.num_of}] Parsing de la réponse...")
            parsed_decision = self.response_parser.parse_decision(llm_response)

            # 5. Valider la décision
            if not self.response_parser.validate_decision(parsed_decision):
                logger.warning(f"[{of.num_of}] Décision LLM invalide, utilisation des valeurs par défaut")
                # Fallback : décision conservative
                return self._create_fallback_decision(context)

            # 6. Créer le AgentDecision
            return self._create_decision_result(parsed_decision, context)

        except Exception as e:
            logger.error(f"[{of.num_of}] Erreur lors de l'évaluation LLM: {e}")
            import traceback
            logger.error(traceback.format_exc())
            # Fallback : décision conservative
            return self._create_fallback_decision_from_error(of, commande, str(e))

    def _create_decision_result(
        self,
        parsed_decision,
        context: LLMAnalysisContext
    ) -> AgentDecision:
        """Crée un AgentDecision à partir d'une décision parsée.

        Parameters
        ----------
        parsed_decision : ParsedLLMDecision
            Décision parsée du LLM
        context : LLMAnalysisContext
            Contexte d'analyse

        Returns
        -------
        AgentDecision
            AgentDecision
        """
        from datetime import datetime

        # Mapper l'action
        action_map = {
            "ACCEPT_AS_IS": AgentAction.ACCEPT_AS_IS,
            "ACCEPT_PARTIAL": AgentAction.ACCEPT_PARTIAL,
            "REJECT": AgentAction.REJECT,
            "DEFER": AgentAction.DEFER,
            "DEFER_PARTIAL": AgentAction.DEFER_PARTIAL
        }

        action = action_map.get(parsed_decision.action, AgentAction.REJECT)

        # Convertir defer_date si présent
        defer_date = None
        if parsed_decision.defer_date:
            from datetime import datetime
            try:
                defer_date = datetime.strptime(parsed_decision.defer_date, "%Y-%m-%d").date()
            except ValueError:
                logger.warning(f"Format de date invalide: {parsed_decision.defer_date}")

        # Créer le résultat
        result = AgentDecision(
            action=action,
            reason=parsed_decision.reason,
            modified_quantity=parsed_decision.modified_quantity,
            defer_date=defer_date,
            metadata={
                **parsed_decision.metadata,
                "llm_generated": True,
                "llm_confidence": parsed_decision.confidence,
                "timestamp": datetime.now().isoformat()
            }
        )

        return result

    def _create_fallback_decision(self, context: LLMAnalysisContext) -> AgentDecision:
        """Crée une décision de fallback basée sur l'analyse contextuelle.

        Parameters
        ----------
        context : LLMAnalysisContext
            Contexte d'analyse

        Returns
        -------
        AgentDecision
            Décision de fallback
        """
        # Décision basée sur la situation globale
        faisabilite = context.situation_globale.faisabilite

        if faisabilite == "faisable":
            return AgentDecision(
                action=AgentAction.ACCEPT_AS_IS,
                reason=f"OF faisable (analyse automatique)",
                metadata={"fallback": True, "faisabilite": faisabilite}
            )

        elif faisabilite in ("faisable_avec_conditions", "faisable_apres_reception"):
            # Faisable après déblocage ou réception → DEFER
            from datetime import timedelta

            # Estimer la date de déblocage (2-3 jours)
            defer_date = date.today() + timedelta(days=3)

            # Construire la raison
            conditions = context.situation_globale.conditions_deblocage
            reason = f"OF faisable après déblocage: {', '.join(conditions[:2])}"

            return AgentDecision(
                action=AgentAction.DEFER,
                reason=reason,
                defer_date=defer_date,
                metadata={
                    "fallback": True,
                    "faisabilite": faisabilite,
                    "conditions_deblocage": conditions,
                    "action_required": "Remplir les conditions de déblocage"
                }
            )

        else:
            # Non faisable → REJECT
            return AgentDecision(
                action=AgentAction.REJECT,
                reason=f"OF non faisable: {context.situation_globale.raison_blocage}",
                metadata={
                    "fallback": True,
                    "faisabilite": faisabilite,
                    "action_required": "Réapprovisionner les composants ou annuler l'OF"
                }
            )

    def _create_fallback_decision_from_error(
        self,
        of: OF,
        commande: Optional[BesoinClient],
        error_message: str
    ) -> AgentDecision:
        """Crée une décision de fallback en cas d'erreur.

        Parameters
        ----------
        of : OF
            OF en erreur
        commande : BesoinClient, optional
            Commande associée
        error_message : str
            Message d'erreur

        Returns
        -------
        AgentDecision
            Décision de fallback (REJECT par sécurité)
        """
        logger.error(f"[{of.num_of}] Erreur LLM, utilisation de fallback REJECT: {error_message}")

        return AgentDecision(
            action=AgentAction.REJECT,
            reason=f"Erreur lors de l'évaluation automatique: {error_message}",
            metadata={
                "fallback": True,
                "error": error_message,
                "llm_error": True,
                "action_required": "Révision manuelle requise"
            }
        )
