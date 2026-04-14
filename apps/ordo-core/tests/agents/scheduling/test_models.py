"""Tests pour les modèles de planification de charge."""

import pytest
from src.agents.scheduling.models import (
    SchedulingConfig, CandidateOF, PosteSchedule, WeekSchedule, SchedulingResult
)


def test_scheduling_config_defaults():
    """Configuration doit avoir des valeurs par défaut."""
    config = SchedulingConfig()
    assert config.hours_per_day == 7.0
    assert config.tolerance_pct == 0.10
    assert config.days_per_week == 5


def test_scheduling_config_target_hours():
    """Configuration doit calculer les heures cibles."""
    config = SchedulingConfig()
    assert config.target_weekly_hours == 35.0  # 7 * 5


def test_scheduling_config_min_max_hours():
    """Configuration doit calculer les bornes min/max."""
    config = SchedulingConfig()
    assert config.min_weekly_hours == 31.5   # 35 * 0.90
    assert config.max_weekly_hours == 38.5   # 35 * 1.10


def test_candidate_of_score():
    """CandidateOF doit avoir un score composite."""
    from unittest.mock import MagicMock
    candidate = CandidateOF(
        of=MagicMock(num_of="F001"),
        commande=MagicMock(),
        hours_per_poste={"PP_830": 3.5},
        component_overlap_score=0.6,
        urgence_score=0.8,
        feasible=True
    )
    assert candidate.composite_score > 0


def test_poste_schedule_charge_rate():
    """PosteSchedule doit calculer le taux de charge."""
    config = SchedulingConfig()
    schedule = PosteSchedule(poste="PP_830", candidates=[], total_hours=31.5, config=config)
    assert abs(schedule.charge_rate - 0.90) < 0.01


def test_week_schedule_gaps():
    """WeekSchedule doit calculer les gaps."""
    config = SchedulingConfig()
    poste = PosteSchedule(poste="PP_830", candidates=[], total_hours=20.0, config=config)
    week = WeekSchedule(postes={"PP_830": poste}, config=config)
    assert week.gaps["PP_830"] == pytest.approx(35.0 - 20.0)
