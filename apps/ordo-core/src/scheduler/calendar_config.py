"""Configurable working-day calendar with holidays and manual off-days."""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from datetime import date, timedelta
from pathlib import Path
from typing import Optional


@dataclass
class DayOff:
    """A single non-working day entry."""
    date: str            # ISO "2025-04-25"
    name: str            # "Maintenance preventive" or "Fete du Travail"
    source: str          # "api" | "manual"


@dataclass
class CalendarConfig:
    """Persisted calendar configuration for a given year."""
    year: int
    holidays: list[DayOff] = field(default_factory=list)
    manual_off_days: list[DayOff] = field(default_factory=list)
    holidays_fetched_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Load / Save
# ---------------------------------------------------------------------------

_DEFAULT_CALENDAR: dict = {
    "year": 0,
    "holidays": [],
    "manual_off_days": [],
    "holidays_fetched_at": None,
}


def load_calendar_config(config_dir: str | Path, year: int) -> CalendarConfig:
    """Load calendar.json for the given year, creating defaults if missing."""
    path = Path(config_dir) / "calendar.json"
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            cfg = CalendarConfig(
                year=data.get("year", year),
                holidays=[DayOff(**h) for h in data.get("holidays", [])],
                manual_off_days=[DayOff(**d) for d in data.get("manual_off_days", [])],
                holidays_fetched_at=data.get("holidays_fetched_at"),
            )
            if cfg.year == year:
                return cfg
        except (json.JSONDecodeError, TypeError):
            pass

    # Return empty config for the requested year
    return CalendarConfig(year=year)


def save_calendar_config(config_dir: str | Path, config: CalendarConfig) -> None:
    """Persist calendar configuration to calendar.json."""
    config_dir = Path(config_dir)
    config_dir.mkdir(parents=True, exist_ok=True)
    path = config_dir / "calendar.json"
    data = {
        "year": config.year,
        "holidays": [asdict(h) for h in config.holidays],
        "manual_off_days": [asdict(d) for d in config.manual_off_days],
        "holidays_fetched_at": config.holidays_fetched_at,
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Calendar logic
# ---------------------------------------------------------------------------

def _holidays_set(config: CalendarConfig) -> set[str]:
    return {h.date for h in config.holidays}


def _manual_off_set(config: CalendarConfig) -> set[str]:
    return {d.date for d in config.manual_off_days}


def is_workday(day: date, config: Optional[CalendarConfig] = None) -> bool:
    """Return True if ``day`` is a working day.

    When *config* is ``None``, falls back to simple Mon-Fri check.
    When provided, also excludes holidays and manual off-days.
    """
    if day.weekday() >= 5:
        return False
    if config is None:
        return True
    iso = day.isoformat()
    if iso in _holidays_set(config):
        return False
    if iso in _manual_off_set(config):
        return False
    return True


def build_workdays(start: date, count: int, config: Optional[CalendarConfig] = None) -> list[date]:
    """Build the next *count* working days starting from *start*."""
    days: list[date] = []
    current = start
    while len(days) < count:
        if is_workday(current, config):
            days.append(current)
        current += timedelta(days=1)
    return days


def next_workday(day: date, config: Optional[CalendarConfig] = None) -> date:
    """Return the next working day strictly after *day*."""
    current = day + timedelta(days=1)
    while not is_workday(current, config):
        current += timedelta(days=1)
    return current


def previous_workday(day: date, offset: int = 1, config: Optional[CalendarConfig] = None) -> date:
    """Return the working day *offset* days before *day*."""
    current = day
    remaining = max(0, offset)
    while remaining > 0:
        current -= timedelta(days=1)
        if is_workday(current, config):
            remaining -= 1
    return current


# ---------------------------------------------------------------------------
# Month view for API
# ---------------------------------------------------------------------------

@dataclass
class CalendarDay:
    """Single day status for the month view."""
    date: str
    weekday: int
    status: str     # "workday" | "holiday" | "manual_off" | "weekend"
    holiday: Optional[dict] = None
    manual_off: bool = False
    reason: Optional[str] = None


def get_month_calendar(year: int, month: int, config: CalendarConfig) -> list[dict]:
    """Return a list of day-status dicts for the given month."""
    import calendar
    num_days = calendar.monthrange(year, month)[1]
    holidays_map = {h.date: h for h in config.holidays}
    manual_map = {d.date: d for d in config.manual_off_days}

    days: list[dict] = []
    for day_num in range(1, num_days + 1):
        d = date(year, month, day_num)
        iso = d.isoformat()
        weekday = d.weekday()

        if weekday >= 5:
            status = "weekend"
        elif iso in holidays_map:
            status = "holiday"
        elif iso in manual_map:
            status = "manual_off"
        else:
            status = "workday"

        days.append({
            "date": iso,
            "weekday": weekday,
            "status": status,
            "holiday": {"name": holidays_map[iso].name, "source": holidays_map[iso].source} if iso in holidays_map else None,
            "manual_off": iso in manual_map,
            "reason": manual_map[iso].name if iso in manual_map else None,
        })

    return days
