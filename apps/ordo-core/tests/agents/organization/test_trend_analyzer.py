"""
Tests for TrendAnalyzer

Tests trend detection using linear regression on charge data across 4 weeks.
"""

import pytest


def test_compute_slope_upward_trend():
    """Compute slope from upward trend"""
    from src.agents.organization.trend_analyzer import TrendAnalyzer

    analyzer = TrendAnalyzer()

    # S+1=25, S+2=35, S+3=45, S+4=60 → pente ~11.5h/semaine
    charges = [25.0, 35.0, 45.0, 60.0]
    slope = analyzer.compute_slope(charges)

    assert abs(slope - 11.5) < 0.1


def test_classify_trend_thresholds():
    """Classify trends based on slope thresholds"""
    from src.agents.organization.trend_analyzer import TrendAnalyzer
    from src.agents.organization.models import TrendType

    analyzer = TrendAnalyzer()

    # Hausse significative: pente > +5
    assert analyzer.classify_trend(11.5) == TrendType.UPWARD
    assert analyzer.classify_trend(5.1) == TrendType.UPWARD

    # Stable: -5 <= pente <= +5
    assert analyzer.classify_trend(0.0) == TrendType.STABLE
    assert analyzer.classify_trend(3.0) == TrendType.STABLE
    assert analyzer.classify_trend(-3.0) == TrendType.STABLE
    assert analyzer.classify_trend(5.0) == TrendType.STABLE
    assert analyzer.classify_trend(-5.0) == TrendType.STABLE

    # Baisse significative: pente < -5
    assert analyzer.classify_trend(-5.1) == TrendType.DOWNWARD
    assert analyzer.classify_trend(-15.0) == TrendType.DOWNWARD


def test_analyze_trends_updates_results():
    """Analyze trends and update PosteChargeResult objects"""
    from src.agents.organization.trend_analyzer import TrendAnalyzer
    from src.agents.organization.models import PosteChargeResult, TrendType

    analyzer = TrendAnalyzer()

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=25.0,
        charge_s2=35.0,
        charge_s3=45.0,
        charge_s4=60.0
    )

    results = {"PP_830": result}
    analyzer.analyze_trends(results)

    assert result.trend == TrendType.UPWARD
    assert abs(result.slope - 11.5) < 0.1
