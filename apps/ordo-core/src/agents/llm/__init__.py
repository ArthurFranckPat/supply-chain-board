"""Module LLM pour le système de décision.

Ce module fournit une intégration avec des LLM pour prendre des décisions
métier nuancées basées sur l'analyse contextuelle des OFs, commandes et stocks.
"""

from .models import (
    LLMAnalysisContext,
    OFInfo,
    CommandeInfo,
    ComposantAnalyse,
    ComposantCritique,
    SituationGlobale
)
from .llm_client import BaseLLMClient, MockLLMClient
from .mistral_client import MistralLLMClient
from .llm_decision_rule import LLMDecisionAgent

__all__ = [
    # Models
    "LLMAnalysisContext",
    "OFInfo",
    "CommandeInfo",
    "ComposantAnalyse",
    "ComposantCritique",
    "SituationGlobale",
    # Clients
    "BaseLLMClient",
    "MockLLMClient",
    "MistralLLMClient",
    # Decision rule
    "LLMDecisionAgent",
]
