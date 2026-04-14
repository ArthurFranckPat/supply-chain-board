"""Tests du critère d'urgence temporelle."""

import pytest
from datetime import date, timedelta

from src.agents.criteria.urgency import UrgencyCriterion
from src.agents.models import AgentContext, AgentAction
from src.models.of import OF
from src.checkers.base import FeasibilityResult


@pytest.fixture
def today():
    """Date du jour pour les tests."""
    return date.today()


@pytest.fixture
def base_context(today):
    """Contexte de base pour les tests."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        description="Test OF",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=today + timedelta(days=10),
        qte_a_fabriquer=100,
        qte_fabriquee=0
    )
    return AgentContext(
        of=of,
        current_date=today,
        feasibility_result=None
    )


def test_urgency_criterion_very_urgent(base_context, today):
    """Test: OF très urgent (≤ 3 jours) → score 1.0."""
    base_context.of.date_fin = today + timedelta(days=2)

    criterion = UrgencyCriterion({})
    score = criterion.score(base_context)

    assert score == 1.0


def test_urgency_criterion_urgent(base_context, today):
    """Test: OF urgent (≤ 7 jours) → score 0.8."""
    base_context.of.date_fin = today + timedelta(days=5)

    criterion = UrgencyCriterion({})
    score = criterion.score(base_context)

    assert score == 0.8


def test_urgency_criterion_comfortable(base_context, today):
    """Test: OF confortable (≤ 21 jours) → score 0.5."""
    base_context.of.date_fin = today + timedelta(days=14)

    criterion = UrgencyCriterion({})
    score = criterion.score(base_context)

    assert score == 0.5


def test_urgency_criterion_plenty_of_time(base_context, today):
    """Test: OF avec beaucoup de temps (> 21 jours) → score 0.3."""
    base_context.of.date_fin = today + timedelta(days=30)

    criterion = UrgencyCriterion({})
    score = criterion.score(base_context)

    assert score == 0.3


def test_urgency_criterion_no_date(base_context, today):
    """Test: OF sans date_fin → score 0.5."""
    base_context.of.date_fin = None

    criterion = UrgencyCriterion({})
    score = criterion.score(base_context)

    assert score == 0.5


def test_urgency_criterion_no_current_date(base_context):
    """Test: Pas de current_date → score 0.5."""
    base_context.current_date = None

    criterion = UrgencyCriterion({})
    score = criterion.score(base_context)

    assert score == 0.5


def test_urgency_criterion_suggest_action_very_urgent(today):
    """Test: OF très urgent avec petit gap → ACCEPT_AS_IS."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        description="Test OF",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=today + timedelta(days=2),
        qte_a_fabriquer=100,
        qte_fabriquee=0
    )

    # Gap de 3% (3/100)
    missing = {
        "COMP1": 3,
        "COMP2": 0
    }

    feasibility = FeasibilityResult(
        feasible=False,
        missing_components=missing
    )

    context = AgentContext(
        of=of,
        current_date=today,
        feasibility_result=feasibility
    )

    criterion = UrgencyCriterion({})
    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert score == 1.0
    assert action == AgentAction.ACCEPT_AS_IS


def test_urgency_criterion_suggest_action_urgent(today):
    """Test: OF urgent avec très petit gap → ACCEPT_AS_IS."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        description="Test OF",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=today + timedelta(days=5),
        qte_a_fabriquer=100,
        qte_fabriquee=0
    )

    # Gap de 1% (1/100)
    missing = {
        "COMP1": 1
    }

    feasibility = FeasibilityResult(
        feasible=False,
        missing_components=missing
    )

    context = AgentContext(
        of=of,
        current_date=today,
        feasibility_result=feasibility
    )

    criterion = UrgencyCriterion({})
    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert score == 0.8
    assert action == AgentAction.ACCEPT_AS_IS


def test_urgency_criterion_no_action_if_feasible(today):
    """Test: Pas d'action si l'OF est faisable."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        description="Test OF",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=today + timedelta(days=2),
        qte_a_fabriquer=100,
        qte_fabriquee=0
    )

    feasibility = FeasibilityResult(
        feasible=True,
        missing_components={}
    )

    context = AgentContext(
        of=of,
        current_date=today,
        feasibility_result=feasibility
    )

    criterion = UrgencyCriterion({})
    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert score == 1.0
    assert action is None


def test_urgency_criterion_no_action_if_large_gap(today):
    """Test: Pas d'ACCEPT_AS_IS si le gap est trop grand."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        description="Test OF",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=today + timedelta(days=2),
        qte_a_fabriquer=100,
        qte_fabriquee=0
    )

    # Gap de 20% (20/100) - trop grand pour very_urgent_tolerance de 5%
    missing = {
        "COMP1": 20
    }

    feasibility = FeasibilityResult(
        feasible=False,
        missing_components=missing
    )

    context = AgentContext(
        of=of,
        current_date=today,
        feasibility_result=feasibility
    )

    criterion = UrgencyCriterion({})
    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert score == 1.0
    assert action is None
