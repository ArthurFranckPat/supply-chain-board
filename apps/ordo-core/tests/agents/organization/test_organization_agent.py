"""Tests for OrganizationAgent orchestrator"""

from unittest.mock import MagicMock
from datetime import date
import pytest


def test_organization_agent_init():
    """Initialize agent with loader"""
    from src.agents.organization.organization_agent import OrganizationAgent

    loader = MagicMock()
    agent = OrganizationAgent(loader)

    assert agent.loader == loader
    assert agent.charge_calculator is not None
    assert agent.trend_analyzer is not None
    assert agent.org_evaluator is not None


def test_analyze_workshop_organization_end_to_end():
    """Full analysis workflow"""
    from src.agents.organization.organization_agent import OrganizationAgent
    from src.agents.organization.models import TrendType

    loader = MagicMock()
    loader.commandes_clients = []

    # Mock all dependencies
    agent = OrganizationAgent(loader)

    # Mock calculate_charge_horizons
    def mock_calculate(reference_date=None, matcher=None):
        from src.agents.organization.models import PosteChargeResult
        return {
            "PP_830": PosteChargeResult(
                poste="PP_830",
                charge_s1=25.0,
                charge_s2=35.0,
                charge_s3=45.0,
                charge_s4=60.0
            )
        }
    agent.charge_calculator.calculate_charge_horizons = mock_calculate

    # Mock matcher
    matcher = MagicMock()

    results = agent.analyze_workshop_organization(
        reference_date=date.today(),
        matcher=matcher
    )

    assert "PP_830" in results
    assert results["PP_830"].trend == TrendType.UPWARD
    assert results["PP_830"].recommended_org is not None
