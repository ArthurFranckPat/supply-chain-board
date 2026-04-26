from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class ChargeCalculatorPort(Protocol):
    """Port : calcul de charge par poste de charge.

    Débloque le couplage transversal suivi-commandes → production_planning.
    """

    def calculate_direct_charge(self, article: str, quantity: float) -> dict[str, float]:
        """Charge de l'article final uniquement (gamme directe).

        Returns
        -------
        dict[str, float]
            {poste_charge: heures}
        """
        ...

    def calculate_recursive_charge(self, article: str, quantity: float) -> dict[str, float]:
        """Charge complète incluant sous-ensembles fabriqués (récursif).

        Returns
        -------
        dict[str, float]
            {poste_charge: heures}
        """
        ...

    def get_poste_libelle(self, poste: str) -> str:
        """Libellé humain d'un poste de charge."""
        ...

    def is_valid_poste(self, poste: str) -> bool:
        """True si le poste est un poste de charge productif."""
        ...
