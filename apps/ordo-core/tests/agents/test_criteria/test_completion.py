"""Tests de CompletionCriterion."""

import pytest
from datetime import date
from src.agents.criteria.completion import CompletionCriterion
from src.agents.models import AgentContext, AgentAction
from src.models.of import OF
from src.checkers.base import FeasibilityResult


def test_completion_criterion_100_percent():
    """Test le score pour un OF 100% faisable."""
    of = OF(
        num_of="F123",
        article="TEST",
        description="Test article",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=date(2026, 3, 30),
        qte_a_fabriquer=147,
        qte_fabriquee=0,
        qte_restante=147
    )

    feasibility = FeasibilityResult(feasible=True)

    context = AgentContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"11019971": 147},
        allocated_stock={},
        remaining_stock={"11019971": 147}
    )

    criterion = CompletionCriterion({
        "min_acceptable_rate": 0.80,
        "target_completion_rate": 0.95,
        "max_absolute_gap": 10
    })

    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert score == 1.0
    assert action == AgentAction.ACCEPT_AS_IS


def test_completion_criterion_98_6_percent():
    """Test le cas motivant : 145/147 (98.6%)."""
    of = OF(
        num_of="F123",
        article="TEST",
        description="Test article",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=date(2026, 3, 30),
        qte_a_fabriquer=147,
        qte_fabriquee=0,
        qte_restante=147
    )

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("11019971", 2)

    context = AgentContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"11019971": 145},
        allocated_stock={},
        remaining_stock={"11019971": 145}
    )

    criterion = CompletionCriterion({
        "min_acceptable_rate": 0.80,
        "target_completion_rate": 0.95,
        "max_absolute_gap": 10
    })

    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert score == 1.0  # 98.6% >= 95% target
    assert action == AgentAction.ACCEPT_PARTIAL


def test_completion_criterion_below_minimum():
    """Test le score pour un OF < 80%."""
    of = OF(
        num_of="F123",
        article="TEST",
        description="Test article",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=date(2026, 3, 30),
        qte_a_fabriquer=100,
        qte_fabriquee=0,
        qte_restante=100
    )

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("COMP1", 50)  # 50%

    context = AgentContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"COMP1": 50},
        allocated_stock={},
        remaining_stock={"COMP1": 50}
    )

    criterion = CompletionCriterion({
        "min_acceptable_rate": 0.80,
        "target_completion_rate": 0.95,
        "max_absolute_gap": 10
    })

    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert score == 0.0
    assert action is None


def test_completion_criterion_no_feasibility_result():
    """Test le score quand pas de résultat de faisabilité."""
    of = OF(
        num_of="F123",
        article="TEST",
        description="Test article",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=date(2026, 3, 30),
        qte_a_fabriquer=100,
        qte_fabriquee=0,
        qte_restante=100
    )

    context = AgentContext(
        of=of,
        feasibility_result=None,
        initial_stock={},
        allocated_stock={},
        remaining_stock={}
    )

    criterion = CompletionCriterion({})

    score = criterion.score(context)

    # Sans résultat de faisabilité → score neutre
    assert score == 0.5
