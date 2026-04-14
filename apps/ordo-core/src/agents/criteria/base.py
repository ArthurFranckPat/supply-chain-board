"""Interface de base pour les critères de décision."""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

from ..models import AgentContext, AgentAction


class BaseCriterion(ABC):
    """Interface pour les critères de décision.

    Un critère évalue un contexte et retourne un score entre 0.0 (défavorable)
    et 1.0 (favorable), puis suggère éventuellement une action.
    """

    # Class attributes to be overridden by subclasses
    CRITERION_ID: str = ""
    CRITERION_NAME: str = ""
    DESCRIPTION: str = ""

    def __init__(self, config: Dict[str, Any]):
        """Initialise le critère avec sa configuration.

        Parameters
        ----------
        config : Dict[str, Any]
            Configuration du critère (ex: thresholds, tolerances)
        """
        self.config = config

    @abstractmethod
    def score(self, context: AgentContext) -> float:
        """Calcule un score entre 0 et 1.

        - 1.0 = Favorable (accepter sans hésitation)
        - 0.5 = Neutre (ni pour ni contre)
        - 0.0 = Défavorable (rejeter si possible)

        Parameters
        ----------
        context : AgentContext
            Contexte de décision

        Returns
        -------
        float
            Score entre 0.0 et 1.0
        """
        pass

    @abstractmethod
    def suggest_action(self, context: AgentContext, score: float) -> Optional[AgentAction]:
        """Suggère une action basée sur le score.

        Parameters
        ----------
        context : AgentContext
            Contexte de décision
        score : float
            Score calculé par la méthode score()

        Returns
        -------
        Optional[AgentAction]
            Action suggérée, ou None si le critère ne suggère rien
        """
        pass

    def is_applicable(self, context: AgentContext) -> bool:
        """Vérifie si le critère s'applique au contexte.

        Par défaut, tous les critères sont applicables. Overridez cette
        méthode pour des critères conditionnels.

        Parameters
        ----------
        context : AgentContext
            Contexte de décision

        Returns
        -------
        bool
            True si le critère s'applique
        """
        return True
