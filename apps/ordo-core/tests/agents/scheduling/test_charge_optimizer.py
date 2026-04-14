"""Tests pour ChargeOptimizer."""

from unittest.mock import MagicMock
from src.agents.scheduling.charge_optimizer import ChargeOptimizer
from src.agents.scheduling.models import SchedulingConfig, CandidateOF


def _make_candidate(num_of, poste, hours, article="ART001", overlap=0.5, urgence=0.5, feasible=True):
    of = MagicMock(num_of=num_of, article=article)
    c = CandidateOF(
        of=of,
        commande=MagicMock(),
        hours_per_poste={poste: hours},
        component_overlap_score=overlap,
        urgence_score=urgence,
        feasible=feasible
    )
    return c


def test_build_s1_schedule_from_feasible_ofs():
    """Le schedule S+1 est construit à partir des OFs faisables avec leurs heures."""
    optimizer = ChargeOptimizer(config=SchedulingConfig(), component_analyzer=MagicMock())
    of1 = MagicMock(num_of="F001", article="ART1", qte_restante=700)
    loader = MagicMock()
    # Mock une gamme avec des operations
    operation = MagicMock(poste_charge="PP_830", cadence=100.0)
    gamme = MagicMock()
    gamme.operations = [operation]
    loader.get_gamme.return_value = gamme

    schedule = optimizer.build_s1_poste_schedule(feasible_ofs=[of1], loader=loader)
    assert "PP_830" in schedule
    assert abs(schedule["PP_830"] - 7.0) < 0.01


def test_score_candidates_sorts_by_composite():
    optimizer = ChargeOptimizer(config=SchedulingConfig(), component_analyzer=MagicMock())
    c1 = _make_candidate("F001", "PP_830", 3.5, article="ART001", overlap=0.2, urgence=0.9)
    c2 = _make_candidate("F002", "PP_830", 3.5, article="ART002", overlap=0.8, urgence=0.3)
    # Mock the overlap_score to return fixed values
    optimizer.component_analyzer.overlap_score = MagicMock(return_value=0.5)
    scored = optimizer.score_candidates([c1, c2], poste="PP_830", scheduled_articles=[])
    # Les deux doivent être ordonnés
    assert len(scored) == 2
    # c1 a un score urgence plus élevé (0.9 vs 0.3)
    assert scored[0].of.num_of == "F001"


def test_fill_gap_selects_until_target():
    """L'optimiseur sélectionne des candidats jusqu'à atteindre la cible."""
    config = SchedulingConfig()  # target = 35h
    optimizer = ChargeOptimizer(config=config, component_analyzer=MagicMock())
    # S+1 a déjà 20h → gap = 15h
    candidates = [
        _make_candidate(f"F{i}", "PP_830", 5.0) for i in range(10)
    ]
    selected = optimizer.fill_gap(
        poste="PP_830",
        current_hours=20.0,
        candidates=candidates
    )
    total = sum(c.hours_per_poste["PP_830"] for c in selected)
    assert total >= config.min_weekly_hours - 20.0  # comble au moins le min
    assert total <= config.max_weekly_hours - 20.0  # ne dépasse pas le max
