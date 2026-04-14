"""Working-day helpers for scheduler bootstrap."""

from __future__ import annotations

from datetime import date, timedelta


def is_workday(day: date) -> bool:
    """Return True when the day is a Monday-Friday."""
    return day.weekday() < 5


def next_workday(day: date) -> date:
    """Return the next workday strictly after ``day``."""
    current = day + timedelta(days=1)
    while not is_workday(current):
        current += timedelta(days=1)
    return current


def previous_workday(day: date, offset: int = 1) -> date:
    """Return the workday ``offset`` days before ``day``."""
    current = day
    remaining = max(0, offset)
    while remaining > 0:
        current -= timedelta(days=1)
        if is_workday(current):
            remaining -= 1
    return current


def build_workdays(start: date, count: int) -> list[date]:
    """Build the next ``count`` workdays starting from ``start``."""
    days: list[date] = []
    current = start
    while len(days) < count:
        if is_workday(current):
            days.append(current)
        current += timedelta(days=1)
    return days
