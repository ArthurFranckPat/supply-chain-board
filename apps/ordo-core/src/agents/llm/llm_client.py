"""Client LLM abstrait.

Ce module définit l'interface pour communiquer avec n'importe quel LLM,
permettant de changer facilement de provider (Mistral, Anthropic, OpenAI, etc.).
"""

from abc import ABC, abstractmethod
from typing import Optional


class BaseLLMClient(ABC):
    """Interface abstraite pour les clients LLM."""

    @abstractmethod
    def call_llm(
        self,
        prompt: str,
        system_prompt: Optional[str] = None
    ) -> str:
        """Appelle l'API LLM.

        Parameters
        ----------
        prompt : str
            Prompt utilisateur
        system_prompt : str, optional
            Prompt système

        Returns
        -------
        str
            Réponse du LLM (texte brut)

        Raises
        ------
        Exception
            Si erreur d'API ou timeout
        """
        pass

    @abstractmethod
    def call_llm_with_retry(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_retries: int = 3
    ) -> str:
        """Appelle l'API LLM avec retry en cas d'erreur.

        Parameters
        ----------
        prompt : str
            Prompt utilisateur
        system_prompt : str, optional
            Prompt système
        max_retries : int
            Nombre de tentatives (défaut: 3)

        Returns
        -------
        str
            Réponse du LLM

        Raises
        ------
        Exception
            Si toutes les tentatives échouent
        """
        pass


class MockLLMClient(BaseLLMClient):
    """Client LLM mock pour les tests.

    Simule des réponses LLM sans appeler d'API.
    """

    def __init__(self, response_override: Optional[str] = None):
        """Initialise le client mock.

        Parameters
        ----------
        response_override : str, optional
            Réponse à retourner à la place de la réponse mock par défaut.
            Si None, utilise une réponse pré-définie.
        """
        self.response_override = response_override

    def call_llm(
        self,
        prompt: str,
        system_prompt: Optional[str] = None
    ) -> str:
        """Appelle l'API LLM (mock).

        Parameters
        ----------
        prompt : str
            Prompt utilisateur
        system_prompt : str, optional
            Prompt système (non utilisé en mode mock)

        Returns
        -------
        str
            Réponse mock du LLM
        """
        if self.response_override:
            return self.response_override

        # Réponse mock par défaut
        return """{
  "action": "DEFER",
  "reason": "L'OF n'est pas faisable immédiatement. Analyse du composant EH1706 (Niveau 1, Fabriqué): besoin de 2160 unités, stock net pour cet OF de 1274 unités (disponible: 0 + alloué à cet OF: 1274). Manque de 886 unités. 1274 unités sont déjà allouées. Cependant, 2447 unités sont en contrôle qualité et seront disponibles sous 2-3 jours, ce qui est suffisant pour couvrir le manque (2447 > 886). Action requise: accélérer le contrôle qualité.",
  "defer_date": "2026-03-26",
  "action_required": "Prioriser le contrôle qualité des 2447 EH1706 bloqués. Seuls 886 unités supplémentaires nécessaires au-delà des 1274 déjà allouées.",
  "confidence": 0.9,
  "metadata": {
    "composants_limitants": ["EH1706"],
    "situation": "bloqué_temporaire_avec_allocations_partielles",
    "delai_estime": "2-3 jours",
    "action_nature": "accélérer_process",
    "analyse_detaillee": {
      "eh1706": {
        "besoin": 2160,
        "stock_disponible": 0,
        "stock_alloue_total": 1274,
        "stock_alloue_cet_of": 1274,
        "stock_net": 1274,
        "stock_bloque": 2447,
        "manque": 886,
        "potentiel_deblocage": 2447,
        "ratio_allocation": "59% (1274/2160)"
      }
    }
  }
}"""

    def call_llm_with_retry(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_retries: int = 3
    ) -> str:
        """Appelle l'API LLM avec retry (mock).

        En mode mock, pas de retry, retourne direct la réponse.
        """
        return self.call_llm(prompt, system_prompt)
