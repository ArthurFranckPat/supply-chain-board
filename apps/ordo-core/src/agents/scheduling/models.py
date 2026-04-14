"""Modèles de données pour le planificateur de charge."""

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional, Any


@dataclass
class SchedulingConfig:
    """Configuration de l'atelier pour le planning."""
    hours_per_day: float = 7.0
    tolerance_pct: float = 0.10
    days_per_week: int = 5

    @property
    def target_weekly_hours(self) -> float:
        return self.hours_per_day * self.days_per_week

    @property
    def min_weekly_hours(self) -> float:
        return self.target_weekly_hours * (1 - self.tolerance_pct)

    @property
    def max_weekly_hours(self) -> float:
        return self.target_weekly_hours * (1 + self.tolerance_pct)


@dataclass
class CandidateOF:
    """OF candidat pour remplir un gap de charge."""
    of: Any                              # OF
    commande: Any                        # BesoinClient
    hours_per_poste: Dict[str, float]    # {poste: heures}
    component_overlap_score: float       # 0..1 (similarité avec OFs déjà planifiés)
    urgence_score: float                 # 0..1 (1 = très urgent)
    feasible: bool

    @property
    def composite_score(self) -> float:
        """Score composite : urgence 50% + overlap 30% + heures 20% (normalisé)."""
        return (self.urgence_score * 0.5) + (self.component_overlap_score * 0.3) + (0.2 if self.feasible else 0)


@dataclass
class PosteSchedule:
    """Plan de charge pour un poste sur une semaine."""
    poste: str
    candidates: List[CandidateOF]
    total_hours: float
    config: SchedulingConfig

    @property
    def charge_rate(self) -> float:
        target = self.config.target_weekly_hours
        return self.total_hours / target if target > 0 else 0.0

    @property
    def gap_hours(self) -> float:
        return max(0.0, self.config.target_weekly_hours - self.total_hours)

    @property
    def is_within_target(self) -> bool:
        return self.config.min_weekly_hours <= self.total_hours <= self.config.max_weekly_hours


@dataclass
class WeekSchedule:
    """Plan de charge hebdomadaire par poste."""
    postes: Dict[str, PosteSchedule]
    config: SchedulingConfig

    @property
    def gaps(self) -> Dict[str, float]:
        return {poste: ps.gap_hours for poste, ps in self.postes.items()}

    @property
    def total_gap_hours(self) -> float:
        return sum(self.gaps.values())


@dataclass
class SchedulingResult:
    """Résultat final du planificateur de charge."""
    week_schedule: WeekSchedule
    s1_feasible_ofs: List[Any]           # OFs S+1 faisables retenus
    s2_s3_candidates_selected: List[CandidateOF]  # OFs S+2/S+3 sélectionnés
    stockout_components: List[str]        # Composants en rupture détectés
    explanation: str                      # Explication texte
    llm_reasoning: Optional[str] = None  # Justification LLM (si activé)
