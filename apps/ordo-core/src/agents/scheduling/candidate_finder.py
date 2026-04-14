"""Trouve les commandes clients S+2/S+3 et leurs OFs associés."""

from datetime import date, timedelta
from typing import List, Dict, Optional, Any

from .models import SchedulingConfig


class CandidateFinder:
    """Recherche les commandes clients S+2/S+3 et leurs OFs réalisables."""

    # Fenêtres temporelles (en jours depuis aujourd'hui)
    S2_START = 8
    S2_END = 14
    S3_START = 15
    S3_END = 21

    def __init__(self, loader, config: SchedulingConfig):
        self.loader = loader
        self.config = config

    def get_s2_s3_orders(self, reference_date: date = None) -> List[Any]:
        """Retourne les commandes clients positionnées en S+2 et S+3."""
        if reference_date is None:
            reference_date = date.today()

        s2_start = reference_date + timedelta(days=self.S2_START)
        s3_end = reference_date + timedelta(days=self.S3_END)

        return [
            c for c in self.loader.commandes_clients
            if c.est_commande()
            and c.qte_restante > 0
            and s2_start <= c.date_expedition_demandee <= s3_end
        ]

    def calculate_of_hours_per_poste(self, of) -> Dict[str, float]:
        """Calcule les heures de charge par poste pour un OF."""
        gamme = self.loader.get_gamme(of.article)
        hours = {}
        if gamme:
            for operation in gamme.operations:
                if operation.cadence and operation.cadence > 0:
                    hours[operation.poste_charge] = of.qte_restante / operation.cadence
        return hours

    def find_candidates(
        self,
        reference_date: date,
        stockout_components: set,
        feasibility_filter,
        matcher
    ) -> List[Any]:
        """
        Trouve les commandes S+2/S+3 dont les OFs sont faisables.

        Returns liste d'(OF, commande, hours_per_poste).
        """
        orders = self.get_s2_s3_orders(reference_date)

        # Matcher commandes → OFs
        matching_results = matcher.match_commandes(orders)

        candidates = []
        for result in matching_results:
            if result.of is None:
                continue
            of = result.of
            # Vérifier que l'OF ne consomme pas les composants en rupture
            if feasibility_filter.of_uses_stockout_component(of, stockout_components, self.loader):
                continue
            hours = self.calculate_of_hours_per_poste(of)
            if hours:  # Ignorer les OFs sans gamme connue
                candidates.append((of, result.commande, hours))

        return candidates
