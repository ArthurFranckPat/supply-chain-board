"""Évaluateur d'organisation d'atelier"""

from typing import List
from .models import OrganizationType


class OrganizationEvaluator:
    """Évalue et sélectionne les scénarios d'organisation d'atelier"""

    def get_organization_scenarios(self) -> List[OrganizationType]:
        """
        Retourne tous les scénarios d'organisation possibles.

        Returns
        -------
        List[OrganizationType]
            Liste des organisations du plus léger au plus lourd
        """
        return [
            OrganizationType(type="1x8", hours=35.0),
            OrganizationType(type="2x8", hours=70.0),
            OrganizationType(type="3x8", hours=105.0),
            OrganizationType(type="partial", hours=17.5)  # 2.5 days
        ]

    def evaluate_organization(
        self,
        result: 'PosteChargeResult',
        organization: OrganizationType
    ) -> tuple[float, float]:
        """
        Évalue une organisation pour un poste.

        Parameters
        ----------
        result : PosteChargeResult
            Résultat de charge pour le poste
        organization : OrganizationType
            Organisation à évaluer

        Returns
        -------
        tuple[float, float]
            (charge_traitée, taux_couverture%)
        """
        charge_s1 = result.charge_s1

        # La charge traitée est min(charge_s1, capacité)
        charge_treated = min(charge_s1, organization.hours)

        # Taux de couverture de S+1
        coverage_pct = (charge_treated / charge_s1 * 100) if charge_s1 > 0 else 0.0

        return charge_treated, coverage_pct

    def select_optimal_organization(
        self,
        result: 'PosteChargeResult'
    ) -> OrganizationType:
        """
        Sélectionne l'organisation optimale pour un poste.

        Règles:
        - Stable: Organisation adaptée à S+1
        - Hausse: +1 niveau vs S+1 brut
        - Baisse: Organisation S+1 brut

        Parameters
        ----------
        result : PosteChargeResult
            Résultat de charge avec trend

        Returns
        -------
        OrganizationType
            Organisation recommandée
        """
        from .models import TrendType

        scenarios = self.get_organization_scenarios()

        # Organisation de base selon charge S+1
        base_charge = result.charge_s1

        # Si tendance haussière, anticiper +1 niveau
        if result.trend == TrendType.UPWARD:
            target_charge = base_charge + 10  # Marge de sécurité
        else:
            target_charge = base_charge

        # Trouver le scénario le plus léger qui couvre la charge
        for scenario in scenarios:
            if scenario.hours >= target_charge:
                return scenario

        # Si rien ne couvre, retourner le plus léger
        return scenarios[0]
