"""Agent d'ordonnancement — orchestre la planification de charge."""

import logging
from datetime import date
from typing import Dict, List, Optional, Any

from .models import SchedulingConfig, CandidateOF, PosteSchedule, WeekSchedule, SchedulingResult
from .feasibility_filter import FeasibilityFilter
from .candidate_finder import CandidateFinder
from .component_analyzer import ComponentAnalyzer
from .charge_optimizer import ChargeOptimizer
from .prompt_builder import SchedulingPromptBuilder

logger = logging.getLogger(__name__)


class SchedulingAgent:
    """Agent planificateur de charge hebdomadaire.

    Workflow :
    1. Extraire les composants en rupture depuis les résultats S+1
    2. Calculer la charge S+1 par poste
    3. Identifier les postes en gap
    4. Chercher des commandes S+2/S+3 dont les OFs sont faisables
    5. Scorer et sélectionner les candidats (algorithme + LLM optionnel)
    6. Retourner le plan de charge recommandé
    """

    def __init__(self, loader, config: SchedulingConfig = None, llm_client=None):
        self.loader = loader
        self.config = config or SchedulingConfig()
        self.llm_client = llm_client

        self.feasibility_filter = FeasibilityFilter()
        self.component_analyzer = ComponentAnalyzer(loader)
        self.optimizer = ChargeOptimizer(self.config, self.component_analyzer)
        self.prompt_builder = SchedulingPromptBuilder()

    def plan_schedule(
        self,
        s1_feasible_ofs: List[Any],
        feasibility_results: Dict[str, Any],
        reference_date: date = None,
        matcher=None
    ) -> SchedulingResult:
        """Construit le plan de charge hebdomadaire optimisé.

        Parameters
        ----------
        s1_feasible_ofs : List[OF]
            OFs S+1 faisables (déjà validés)
        feasibility_results : Dict[str, FeasibilityResult]
            Résultats de faisabilité pour tous les OFs S+1
        reference_date : date
            Date de référence (défaut: aujourd'hui)
        matcher : CommandeOFMatcher, optional
            Pour matcher les commandes S+2/S+3 avec leurs OFs

        Returns
        -------
        SchedulingResult
        """
        if reference_date is None:
            reference_date = date.today()

        # 1. Composants en rupture
        stockout_components = self.feasibility_filter.extract_stockout_components(feasibility_results)
        logger.info(f"Composants en rupture : {stockout_components}")

        # 2. Charge S+1 par poste
        s1_hours_per_poste = self.optimizer.build_s1_poste_schedule(s1_feasible_ofs, self.loader)
        logger.info(f"Charge S+1 par poste : {s1_hours_per_poste}")

        # 3. Identifier les postes en gap
        all_postes = set(s1_hours_per_poste.keys())
        gaps = {
            poste: max(0, self.config.target_weekly_hours - hours)
            for poste, hours in s1_hours_per_poste.items()
            if hours < self.config.min_weekly_hours
        }
        logger.info(f"Postes en gap : {gaps}")

        # 4. Chercher candidats S+2/S+3
        s2_s3_candidates_selected = []
        poste_schedules = {}

        if gaps and matcher:
            finder = CandidateFinder(self.loader, self.config)
            raw_candidates = finder.find_candidates(
                reference_date=reference_date,
                stockout_components=stockout_components,
                feasibility_filter=self.feasibility_filter,
                matcher=matcher
            )

            # 5. Scorer et sélectionner pour chaque poste en gap
            for poste, gap_hours in gaps.items():
                current_hours = s1_hours_per_poste.get(poste, 0)

                # Filtrer candidats pour ce poste
                poste_candidates = []
                scheduled_articles = [of.article for of in s1_feasible_ofs]
                for of, commande, hours in raw_candidates:
                    if poste not in hours:
                        continue
                    urgence = self.optimizer.compute_urgence_score(commande, reference_date)
                    c = CandidateOF(
                        of=of, commande=commande,
                        hours_per_poste=hours,
                        component_overlap_score=0.0,
                        urgence_score=urgence,
                        feasible=True
                    )
                    poste_candidates.append(c)

                # Scorer + sélectionner
                scored = self.optimizer.score_candidates(poste_candidates, poste, scheduled_articles)
                selected = self.optimizer.fill_gap(poste, current_hours, scored)
                s2_s3_candidates_selected.extend(selected)

                total_hours = current_hours + sum(c.hours_per_poste.get(poste, 0) for c in selected)
                poste_schedules[poste] = PosteSchedule(
                    poste=poste, candidates=selected,
                    total_hours=total_hours, config=self.config
                )

        # Ajouter les postes sans gap
        for poste, hours in s1_hours_per_poste.items():
            if poste not in poste_schedules:
                poste_schedules[poste] = PosteSchedule(
                    poste=poste, candidates=[],
                    total_hours=hours, config=self.config
                )

        week_schedule = WeekSchedule(postes=poste_schedules, config=self.config)

        # 6. LLM (optionnel) pour justification
        llm_reasoning = None
        if self.llm_client and gaps:
            llm_reasoning = self._get_llm_reasoning(gaps, s2_s3_candidates_selected, stockout_components)

        explanation = self._build_explanation(s1_hours_per_poste, gaps, s2_s3_candidates_selected)

        return SchedulingResult(
            week_schedule=week_schedule,
            s1_feasible_ofs=s1_feasible_ofs,
            s2_s3_candidates_selected=s2_s3_candidates_selected,
            stockout_components=list(stockout_components),
            explanation=explanation,
            llm_reasoning=llm_reasoning
        )

    def _get_llm_reasoning(self, gaps, selected_candidates, stockout_components) -> Optional[str]:
        """Appel LLM optionnel pour justification du plan."""
        try:
            candidates_data = [
                {
                    "of": c.of.num_of,
                    "commande": c.commande.num_commande if c.commande else "-",
                    "heures": sum(c.hours_per_poste.values()),
                    "score": c.composite_score,
                    "poste": list(c.hours_per_poste.keys())[0] if c.hours_per_poste else "-"
                }
                for c in selected_candidates[:15]
            ]
            prompt = self.prompt_builder.build_prompt(gaps, candidates_data, stockout_components)
            system = self.prompt_builder.build_system_prompt()
            return self.llm_client.call_llm_with_retry(prompt=prompt, system_prompt=system)
        except Exception as e:
            logger.warning(f"LLM scheduling failed: {e}")
            return None

    def _build_explanation(self, s1_hours, gaps, selected) -> str:
        lines = ["Plan de charge hebdomadaire :"]
        for poste, hours in s1_hours.items():
            rate = hours / self.config.target_weekly_hours * 100
            lines.append(f"  {poste} : {hours:.1f}h ({rate:.0f}% de la cible)")
        if gaps:
            lines.append(f"Gaps détectés : {len(gaps)} poste(s)")
            lines.append(f"OFs S+2/S+3 avancés : {len(selected)}")
        else:
            lines.append("Charge S+1 suffisante — aucun avancement nécessaire.")
        return "\n".join(lines)
