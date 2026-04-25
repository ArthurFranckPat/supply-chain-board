"""French public-holiday fetching via the Nager.Date API with local caching."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.request import urlopen, Request
from urllib.error import URLError

from .calendar_config import CalendarConfig, DayOff, save_calendar_config

log = logging.getLogger(__name__)

_API_URL = "https://date.nager.at/api/v3/PublicHolidays/{year}/FR"
_TIMEOUT_SEC = 10


def _cache_path(config_dir: Path, year: int) -> Path:
    return config_dir / f"holidays_{year}.json"


def fetch_holidays(year: int) -> list[DayOff]:
    """Fetch French public holidays from Nager.Date API.

    Returns an empty list on network errors (graceful degradation).
    """
    url = _API_URL.format(year=year)
    req = Request(url, headers={"Accept": "application/json"})
    try:
        with urlopen(req, timeout=_TIMEOUT_SEC) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except (URLError, OSError, json.JSONDecodeError) as exc:
        log.warning("Failed to fetch holidays for %d: %s", year, exc)
        return []

    holidays: list[DayOff] = []
    for entry in data:
        holidays.append(DayOff(
            date=entry["date"],
            name=entry.get("localName", entry.get("name", "")),
            source="api",
        ))
    return holidays


def _load_cache(config_dir: Path, year: int) -> Optional[list[DayOff]]:
    """Load holidays from cache file, return None if missing/invalid."""
    path = _cache_path(config_dir, year)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return [DayOff(**h) for h in data]
    except (json.JSONDecodeError, TypeError, KeyError):
        return None


def _save_cache(config_dir: Path, year: int, holidays: list[DayOff]) -> None:
    """Persist holidays to cache file."""
    config_dir.mkdir(parents=True, exist_ok=True)
    path = _cache_path(config_dir, year)
    data = [{"date": h.date, "name": h.name, "source": h.source} for h in holidays]
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_holidays(year: int, config_dir: str | Path) -> list[DayOff]:
    """Return holidays for *year*, using cache when available."""
    config_dir = Path(config_dir)
    cached = _load_cache(config_dir, year)
    if cached is not None:
        return cached

    holidays = fetch_holidays(year)
    if holidays:
        _save_cache(config_dir, year, holidays)
    return holidays


def refresh_holidays(year: int, config_dir: str | Path) -> list[DayOff]:
    """Force re-fetch holidays from API and update cache."""
    config_dir = Path(config_dir)
    holidays = fetch_holidays(year)
    if holidays:
        _save_cache(config_dir, year, holidays)
    return holidays


def ensure_holidays_in_calendar(
    config_dir: str | Path,
    config: CalendarConfig,
) -> CalendarConfig:
    """Ensure the CalendarConfig has holidays loaded (fetch if needed)."""
    config_dir = Path(config_dir)
    if config.holidays and config.year == config.year:
        return config

    holidays = get_holidays(config.year, config_dir)
    if holidays:
        config.holidays = holidays
        config.holidays_fetched_at = datetime.now(timezone.utc).isoformat()
        save_calendar_config(config_dir, config)
    return config
