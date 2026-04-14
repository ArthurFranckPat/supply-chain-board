"""
TrendAnalyzer - Detection de tendances sur les charges de production

Analyse les tendances de charge sur 4 semaines (S+1 à S+4) en utilisant
une régression linéaire pour calculer la pente de l'évolution.
"""

from typing import Dict, List

import numpy as np


class TrendAnalyzer:
    """
    Analyse les tendances de charge par poste de charge.

    Utilise une régression linéaire pour calculer la pente de l'évolution
    des charges sur 4 semaines, puis classe la tendance en 3 catégories :
    - UPWARD: hausse significative (> +5h/semaine)
    - STABLE: stable (-5 à +5h/semaine)
    - DOWNWARD: baisse significative (< -5h/semaine)
    """

    def compute_slope(self, charges: List[float]) -> float:
        """
        Calcule la pente de régression linéaire.

        Parameters
        ----------
        charges : List[float]
            Liste des charges [S+1, S+2, S+3, S+4]

        Returns
        -------
        float
            Pente en heures/semaine
        """
        if len(charges) < 2:
            return 0.0

        # Régression linéaire simple: y = ax + b
        x = np.arange(len(charges))
        y = np.array(charges)

        # Pente = covariance(x,y) / variance(x)
        x_mean = np.mean(x)
        y_mean = np.mean(y)

        numerator = np.sum((x - x_mean) * (y - y_mean))
        denominator = np.sum((x - x_mean) ** 2)

        if denominator == 0:
            return 0.0

        return float(numerator / denominator)

    def classify_trend(self, slope: float) -> str:
        """
        Classe la tendance selon la pente.

        Parameters
        ----------
        slope : float
            Pente en heures/semaine

        Returns
        -------
        TrendType
            UPWARD si pente > +5
            STABLE si -5 <= pente <= +5
            DOWNWARD si pente < -5
        """
        from .models import TrendType

        if slope > 5.0:
            return TrendType.UPWARD
        elif slope < -5.0:
            return TrendType.DOWNWARD
        else:
            return TrendType.STABLE

    def analyze_trends(self, results: Dict[str, 'PosteChargeResult']) -> None:
        """
        Analyse les tendances pour tous les postes et met à jour les résultats.

        Parameters
        ----------
        results : Dict[str, PosteChargeResult]
            Résultats par poste (modifié in-place)
        """
        for result in results.values():
            charges = [result.charge_s1, result.charge_s2, result.charge_s3, result.charge_s4]
            slope = self.compute_slope(charges)
            trend = self.classify_trend(slope)

            result.slope = slope
            result.trend = trend
