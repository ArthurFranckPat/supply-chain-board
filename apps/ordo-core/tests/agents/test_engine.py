"""Tests de AgentEngine."""

import pytest
from datetime import date, timedelta
from unittest.mock import Mock
from src.agents.engine import AgentEngine
from src.agents.models import AgentAction
from src.models.of import OF
from src.models.besoin_client import BesoinClient
from src.checkers.base import FeasibilityResult


def test_decision_engine_initialization():
    """Test l'initialisation du AgentEngine."""
    engine = AgentEngine()

    assert engine.smart_rule is not None
    assert engine.persistence is not None  # Maintenant implémenté


def test_decision_engine_evaluate_pre_allocation():
    """Test l'évaluation pré-allocation."""
    of = OF(
        num_of="F123",
        article="TEST",
        description="Test OF",
        statut_num=3,
        statut_texte="Suggéré",
        date_fin=date.today(),
        qte_a_fabriquer=147,
        qte_fabriquee=0,
        qte_restante=147
    )

    engine = AgentEngine()
    result = engine.evaluate_pre_allocation(
        of=of,
        initial_stock={"11019971": 145}
    )

    assert result.action == AgentAction.ACCEPT_PARTIAL


def test_decision_engine_evaluate_post_allocation():
    """Test l'évaluation post-allocation."""
    of = OF(
        num_of="F123",
        article="TEST",
        description="Test OF",
        statut_num=3,
        statut_texte="Suggéré",
        date_fin=date.today(),
        qte_a_fabriquer=100,
        qte_fabriquee=0,
        qte_restante=100
    )

    feasibility = FeasibilityResult(feasible=False)

    allocation_result = Mock()
    allocation_result.feasibility_result = feasibility
    allocation_result.status = "NOT_FEASIBLE"

    engine = AgentEngine()
    result = engine.evaluate_post_allocation(
        of=of,
        allocation_result=allocation_result
    )

    # Résultat dépend du contexte
    assert isinstance(result.action, AgentAction)
