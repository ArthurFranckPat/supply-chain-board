"""Tests for OrganizationEvaluator"""

import pytest


def test_get_organization_scenarios():
    """Get all possible organization types"""
    from src.agents.organization.organization_evaluator import OrganizationEvaluator

    evaluator = OrganizationEvaluator()
    scenarios = evaluator.get_organization_scenarios()

    assert len(scenarios) == 4
    assert scenarios[0].type == "1x8"
    assert scenarios[0].hours == 35.0
    assert scenarios[1].type == "2x8"
    assert scenarios[1].hours == 70.0
    assert scenarios[2].type == "3x8"
    assert scenarios[2].hours == 105.0
    assert scenarios[3].type == "partial"


def test_evaluate_organization_coverage():
    """Evaluate coverage rate for an organization"""
    from src.agents.organization.organization_evaluator import OrganizationEvaluator
    from src.agents.organization.models import PosteChargeResult, TrendType, OrganizationType

    evaluator = OrganizationEvaluator()

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=25.0,
        charge_s2=35.0,
        charge_s3=45.0,
        charge_s4=60.0,
        trend=TrendType.UPWARD
    )

    org = OrganizationType(type="1x8", hours=35.0)

    charge_treated, coverage_pct = evaluator.evaluate_organization(result, org)

    assert charge_treated == 25.0  # S+1 charge
    assert coverage_pct == 100.0  # 25/35 = 71% mais charge traitée = 100% de S+1


def test_select_optimal_organization_stable_trend():
    """Select organization for stable trend"""
    from src.agents.organization.organization_evaluator import OrganizationEvaluator
    from src.agents.organization.models import PosteChargeResult, TrendType, OrganizationType

    evaluator = OrganizationEvaluator()

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=35.0,  # Exactement 1x8
        charge_s2=36.0,
        charge_s3=34.0,
        charge_s4=35.0,
        trend=TrendType.STABLE
    )

    org = evaluator.select_optimal_organization(result)

    assert org.type == "1x8"
    assert org.hours == 35.0


def test_select_optimal_organization_upward_trend():
    """Select organization for upward trend - should upgrade one level"""
    from src.agents.organization.organization_evaluator import OrganizationEvaluator
    from src.agents.organization.models import PosteChargeResult, TrendType

    evaluator = OrganizationEvaluator()

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=30.0,  # 1x8 suffirait normalement
        charge_s2=45.0,
        charge_s3=55.0,
        charge_s4=65.0,
        trend=TrendType.UPWARD  # Mais tendance haussière → anticiper
    )

    org = evaluator.select_optimal_organization(result)

    # Avec +10 de marge, 30+10 = 40, donc 2x8 (70h) sélectionné
    assert org.type == "2x8"
    assert org.hours == 70.0


def test_select_optimal_organization_downward_trend():
    """Select organization for downward trend - base organization"""
    from src.agents.organization.organization_evaluator import OrganizationEvaluator
    from src.agents.organization.models import PosteChargeResult, TrendType

    evaluator = OrganizationEvaluator()

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=70.0,  # 2x8
        charge_s2=60.0,
        charge_s3=50.0,
        charge_s4=40.0,
        trend=TrendType.DOWNWARD  # Tendance baissière → pas d'anticipation
    )

    org = evaluator.select_optimal_organization(result)

    # Reste sur 2x8 (base S+1)
    assert org.type == "2x8"
    assert org.hours == 70.0


def test_evaluate_organization_insufficient_capacity():
    """Evaluate organization when capacity is insufficient"""
    from src.agents.organization.organization_evaluator import OrganizationEvaluator
    from src.agents.organization.models import PosteChargeResult, TrendType, OrganizationType

    evaluator = OrganizationEvaluator()

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=70.0,  # 2x8 needed
        charge_s2=80.0,
        charge_s3=90.0,
        charge_s4=100.0,
        trend=TrendType.UPWARD
    )

    org = OrganizationType(type="1x8", hours=35.0)  # Capacity insufficient

    charge_treated, coverage_pct = evaluator.evaluate_organization(result, org)

    # Only 35h treated out of 70h
    assert charge_treated == 35.0
    assert coverage_pct == 50.0  # 35/70 = 50%
