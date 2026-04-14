"""Algorithme de scoring et sélection pour optimiser la charge par poste."""

from typing import List, Dict, Tuple
from datetime import date
from .models import SchedulingConfig, CandidateOF


class ChargeOptimizer:
    """Sélectionne les OFs candidats pour combler les gaps de charge."""

    def __init__(self, config: SchedulingConfig, component_analyzer):
        self.config = config
        self.component_analyzer = component_analyzer

    def build_s1_poste_schedule(self, feasible_ofs, loader) -> Dict[str, float]:
        """Calcule les heures S+1 déjà planifiées par poste."""
        hours_per_poste: Dict[str, float] = {}
        for of in feasible_ofs:
            gamme = loader.get_gamme(of.article)
            if gamme:
                for operation in gamme.operations:
                    if operation.cadence and operation.cadence > 0:
                        h = of.qte_restante / operation.cadence
                        hours_per_poste[operation.poste_charge] = hours_per_poste.get(operation.poste_charge, 0) + h
        return hours_per_poste

    def score_candidates(
        self,
        candidates: List[CandidateOF],
        poste: str,
        scheduled_articles: List[str]
    ) -> List[CandidateOF]:
        """Enrichit les scores de similarité et trie par score composite décroissant."""
        for candidate in candidates:
            candidate.component_overlap_score = self.component_analyzer.overlap_score(
                candidate.of.article, scheduled_articles
            )
        return sorted(candidates, key=lambda c: c.composite_score, reverse=True)

    def fill_gap(
        self,
        poste: str,
        current_hours: float,
        candidates: List[CandidateOF]
    ) -> List[CandidateOF]:
        """Sélectionne les candidats pour combler le gap jusqu'à la cible max."""
        selected = []
        cumulative = current_hours
        target_max = self.config.max_weekly_hours

        for candidate in candidates:
            h = candidate.hours_per_poste.get(poste, 0)
            if h <= 0:
                continue
            if cumulative + h > target_max:
                continue  # Éviter de dépasser le maximum
            selected.append(candidate)
            cumulative += h
            if cumulative >= self.config.min_weekly_hours:
                break  # On a atteint le minimum acceptable

        return selected

    def compute_urgence_score(self, commande, reference_date) -> float:
        """Score d'urgence : 1 = très urgent, 0 = lointain."""
        if reference_date is None:
            reference_date = date.today()
        delta = (commande.date_expedition_demandee - reference_date).days
        if delta <= 7:
            return 1.0
        elif delta <= 14:
            return 0.7
        elif delta <= 21:
            return 0.4
        return 0.1
