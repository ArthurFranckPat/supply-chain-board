"""Base Checker - Classes de base pour la vérification de faisabilité."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from ..models.of import OF


@dataclass
class FeasibilityResult:
    """Résultat d'une vérification de faisabilité.

    Attributes
    ----------
    feasible : bool
        True si l'OF est faisable
    missing_components : dict[str, float]
        Dictionnaire des composants manquants (article → quantité manquante)
    alerts : list[str]
        Liste des alertes (nomenclatures non disponibles, etc.)
    depth : int
        Profondeur de récursion atteinte
    components_checked : int
        Nombre de composants vérifiés
    """

    feasible: bool = True
    missing_components: dict[str, float] = field(default_factory=dict)
    alerts: list[str] = field(default_factory=list)
    depth: int = 0
    components_checked: int = 0

    def add_missing(self, article: str, quantity: float):
        """Ajoute un composant manquant.

        Parameters
        ----------
        article : str
            Code du composant manquant
        quantity : float
            Quantité manquante
        """
        if article in self.missing_components:
            self.missing_components[article] += quantity
        else:
            self.missing_components[article] = quantity

    def add_alert(self, alert: str):
        """Ajoute une alerte.

        Parameters
        ----------
        alert : str
            Message d'alerte
        """
        self.alerts.append(alert)

    def merge(self, other: "FeasibilityResult"):
        """Fusionne un autre résultat dans celui-ci.

        Parameters
        ----------
        other : FeasibilityResult
            Résultat à fusionner
        """
        if not other.feasible:
            self.feasible = False
        for article, quantity in other.missing_components.items():
            self.add_missing(article, quantity)
        self.alerts.extend(other.alerts)
        self.depth = max(self.depth, other.depth)
        self.components_checked += other.components_checked

    def __repr__(self) -> str:
        """Représentation textuelle du résultat."""
        status = "✅ Faisable" if self.feasible else "❌ Non faisable"
        return (
            f"{status} - {self.components_checked} composants vérifiés, "
            f"{len(self.missing_components)} manquants, {len(self.alerts)} alertes"
        )


class BaseChecker(ABC):
    """Classe de base pour les checkers de faisabilité."""

    def __init__(self, data_loader):
        """Initialise le checker.

        Parameters
        ----------
        data_loader : DataLoader
            Loader de données
        """
        self.data_loader = data_loader

    @abstractmethod
    def check_of(self, of: OF) -> FeasibilityResult:
        """Vérifie la faisabilité d'un OF.

        Parameters
        ----------
        of : OF
            Ordre de fabrication à vérifier

        Returns
        -------
        FeasibilityResult
            Résultat de la vérification
        """
        pass

    def check_all_ofs(self, ofs: list[OF]) -> dict[str, FeasibilityResult]:
        """Vérifie la faisabilité de plusieurs OF.

        Parameters
        ----------
        ofs : list[OF]
            Liste des OF à vérifier

        Returns
        -------
        dict[str, FeasibilityResult]
            Dictionnaire des résultats indexé par numéro d'OF
        """
        results = {}
        for of in ofs:
            results[of.num_of] = self.check_of(of)
        return results
