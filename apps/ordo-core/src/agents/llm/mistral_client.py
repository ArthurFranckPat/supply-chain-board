"""Client Mistral AI pour le système de décision LLM."""

import logging
import os
from typing import Optional

try:
    from mistralai.client import Mistral
except ImportError:
    raise ImportError(
        "Le package 'mistralai' est requis. Installez-le avec: pip install mistralai"
    )

from .llm_client import BaseLLMClient


logger = logging.getLogger(__name__)


class MistralLLMClient(BaseLLMClient):
    """Client Mistral AI pour les appels LLM.

    Utilise l'API Mistral avec le modèle configuré (par défaut: mistral-large-latest).
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: str = "mistral-large-latest",
        temperature: float = 0.0,
        max_tokens: int = 2000
    ):
        """Initialise le client Mistral.

        Parameters
        ----------
        api_key : str, optional
            Clé API Mistral. Si None, lit depuis MISTRAL_API_KEY
        model : str
            Modèle à utiliser (défaut: mistral-large-latest)
            Options: mistral-large-latest, mistral-medium-latest, mistral-small-latest
        temperature : float
            Température pour la génération (0.0 = déterministe, 1.0 = créatif)
        max_tokens : int
            Nombre maximal de tokens pour la réponse
        """
        # Récupérer la clé API
        if api_key is None:
            api_key = os.environ.get("MISTRAL_API_KEY")

        if not api_key:
            raise ValueError(
                "Clé API Mistral manquante. Soit passer 'api_key' au constructeur, "
                "soit définir la variable d'environnement MISTRAL_API_KEY"
            )

        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens

        # Initialiser le client Mistral
        self.client = Mistral(api_key=api_key)

        logger.info(f"Client Mistral initialisé avec modèle: {model}")

    def call_llm(
        self,
        prompt: str,
        system_prompt: Optional[str] = None
    ) -> str:
        """Appelle l'API Mistral.

        Parameters
        ----------
        prompt : str
            Prompt utilisateur
        system_prompt : str, optional
            Prompt système

        Returns
        -------
        str
            Réponse du LLM (texte JSON)
        """
        # Construire les messages
        messages = []

        if system_prompt:
            messages.append({
                "role": "system",
                "content": system_prompt
            })

        messages.append({
            "role": "user",
            "content": prompt
        })

        # Logger la requête (sans la clé API)
        logger.debug(f"Appel Mistral API - Modèle: {self.model}")
        logger.debug(f"Prompt utilisateur (longueur: {len(prompt)})")

        try:
            # Appel API
            response = self.client.chat.complete(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens
            )

            # Extraire la réponse
            content = response.choices[0].message.content

            logger.debug(f"Réponse reçue (longueur: {len(content)})")
            logger.debug(f"Tokens utilisés: {response.usage.total_tokens if hasattr(response, 'usage') else 'N/A'}")

            return content

        except Exception as e:
            logger.error(f"Erreur appel API Mistral: {e}")
            raise

    def call_llm_with_retry(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_retries: int = 3
    ) -> str:
        """Appelle l'API Mistral avec retry en cas d'erreur.

        Parameters
        ----------
        prompt : str
            Prompt utilisateur
        system_prompt : str, optional
            Prompt système
        max_retries : int
            Nombre maximal de tentatives

        Returns
        -------
        str
            Réponse du LLM

        Raises
        ------
        Exception
            Si toutes les tentatives échouent
        """
        import time

        last_error = None

        for attempt in range(max_retries):
            try:
                return self.call_llm(prompt, system_prompt)

            except Exception as e:
                last_error = e
                logger.warning(f"Tentative {attempt + 1}/{max_retries} échouée: {e}")

                if attempt < max_retries - 1:
                    # Attendre avant de réessayer (exponentiel backoff)
                    wait_time = 2 ** attempt
                    logger.debug(f"Attente {wait_time}s avant nouvel essai...")
                    time.sleep(wait_time)

        # Toutes les tentatives échouées
        logger.error(f"Toutes les tentatives échouées après {max_retries} essais")
        raise last_error
