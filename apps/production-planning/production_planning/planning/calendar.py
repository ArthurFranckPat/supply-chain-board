"""Backward-compatible workday helpers.

This module now delegates to ``calendar_config`` so the codebase has a single
implementation of workday logic. Callers that do not use a config keep the
same behavior as before (Mon-Fri only).
"""

from __future__ import annotations

from datetime import date

from .calendar_config import (
    build_workdays as _build_workdays,
    is_workday as _is_workday,
    next_workday as _next_workday,
    previous_workday as _previous_workday,
)


def is_workday(day: date) -> bool:
    """Return True when the day is a Monday-Friday."""
    return _is_workday(day, None)


def next_workday(day: date) -> date:
    """Return the next workday strictly after ``day``."""
    return _next_workday(day, None)


def previous_workday(day: date, offset: int = 1) -> date:
    """Return the workday ``offset`` days before ``day``."""
    return _previous_workday(day, offset, None)


def build_workdays(start: date, count: int) -> list[date]:
    """Build the next ``count`` workdays starting from ``start``."""
    return _build_workdays(start, count, None)
