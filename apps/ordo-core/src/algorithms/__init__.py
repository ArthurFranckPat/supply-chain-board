"""Algorithmes pour la gestion de la concurrence et l'ordonnancement."""

from .allocation import AllocationManager, AllocationResult, AllocationStatus
from .charge_calculator import (
    calculate_article_charge,
    calculate_weekly_charge_heatmap,
    get_week_info,
    group_by_week,
)
from .forecast_consumption import consume_forecasts_by_article, format_consumption_stats
from .matching import CommandeOFMatcher, MatchingResult

__all__ = [
    "AllocationManager",
    "AllocationResult",
    "AllocationStatus",
    "CommandeOFMatcher",
    "MatchingResult",
    "calculate_article_charge",
    "calculate_weekly_charge_heatmap",
    "consume_forecasts_by_article",
    "format_consumption_stats",
    "get_week_info",
    "group_by_week",
]
