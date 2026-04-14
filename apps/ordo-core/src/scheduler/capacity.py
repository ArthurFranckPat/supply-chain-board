"""Capacite journaliere du scheduler AUTORESEARCH."""

from __future__ import annotations

from datetime import date, timedelta

SHIFT_HOURS = 7.0
MAX_DAY_HOURS = 14.0
MIN_OPEN_HOURS = 7.0
WORKING_DAYS_DEFAULT = 15
TARGET_LINES = ("PP_830", "PP_153")


def build_working_day_horizon(start_day: date, num_days: int = WORKING_DAYS_DEFAULT) -> list[date]:
    """Retourne les `num_days` prochains jours ouvres a partir de `start_day`."""
    days: list[date] = []
    current = start_day
    while len(days) < num_days:
        if current.weekday() < 5:
            days.append(current)
        current += timedelta(days=1)
    return days


def is_line_open(hours: float) -> bool:
    """Une ligne est consideree ouverte si au moins 7h sont planifiees."""
    return hours >= MIN_OPEN_HOURS
