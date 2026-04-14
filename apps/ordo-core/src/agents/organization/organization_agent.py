"""OrganizationAgent - Main orchestrator for workshop organization analysis"""

from datetime import date
from typing import Dict

from .charge_calculator import ChargeCalculator
from .trend_analyzer import TrendAnalyzer
from .organization_evaluator import OrganizationEvaluator
from .models import PosteChargeResult


class OrganizationAgent:
    """
    Orchestrateur principal pour l'analyse de l'organisation de l'atelier.

    Combine:
    - ChargeCalculator : Calcul de la charge par poste
    - TrendAnalyzer : Analyse des tendances
    - OrganizationEvaluator : Sélection et évaluation des organisations
    """

    def __init__(self, loader):
        """
        Initialize agent with dependencies.

        Parameters
        ----------
        loader : DataLoader
            Loader pour accéder aux données
        """
        self.loader = loader
        self.charge_calculator = ChargeCalculator(loader)
        self.trend_analyzer = TrendAnalyzer()
        self.org_evaluator = OrganizationEvaluator()

    def analyze_workshop_organization(
        self,
        reference_date: date = None,
        matcher = None
    ) -> Dict[str, PosteChargeResult]:
        """
        Analyse l'organisation de l'atelier sur 4 semaines.

        Parameters
        ----------
        reference_date : date, optional
            Date de référence (défaut: aujourd'hui)
        matcher : CommandeOFMatcher, optional
            Matcher pour lier commandes aux OF

        Returns
        -------
        Dict[str, PosteChargeResult]
            Résultats par poste avec recommandations
        """
        if reference_date is None:
            reference_date = date.today()

        # 1. Calculer la charge pour tous les horizons
        results = self.charge_calculator.calculate_charge_horizons(
            reference_date=reference_date,
            matcher=matcher
        )

        # 2. Analyser les tendances
        self.trend_analyzer.analyze_trends(results)

        # 3. Évaluer et sélectionner les organisations
        for result in results.values():
            org = self.org_evaluator.select_optimal_organization(result)
            result.recommended_org = org

            charge_treated, coverage_pct = self.org_evaluator.evaluate_organization(
                result, org
            )
            result.charge_treated = charge_treated
            result.coverage_pct = coverage_pct

        return results
