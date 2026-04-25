from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache

SHIFT_HOURS = 7.0
MAX_DAY_HOURS = 14.0
MIN_OPEN_HOURS = 7.0
WORKING_DAYS_DEFAULT = 15

# Default fallback - used if config file not found
_DEFAULT_TARGET_LINES = ('PP_830', 'PP_153')


@lru_cache(maxsize=1)
def _load_target_lines_cached(config_dir: str) -> tuple[str, ...]:
    from .lines_config import load_lines_config
    lines = load_lines_config(config_dir)
    return tuple(sorted(line.code for line in lines))


def get_target_lines(config_dir: str = 'config') -> tuple[str, ...]:
    return _load_target_lines_cached(config_dir)


def __getattr__(name: str):
    if name == 'TARGET_LINES':
        # Lazy load from config, fallback to default
        try:
            return _load_target_lines_cached('config')
        except Exception:
            return _DEFAULT_TARGET_LINES
    raise AttributeError(f'module {__name__!r} has no attribute {name!r}')


def build_working_day_horizon(start_day: date, num_days: int = WORKING_DAYS_DEFAULT) -> list[date]:
    days: list[date] = []
    current = start_day
    while len(days) < num_days:
        if current.weekday() < 5:
            days.append(current)
        current += timedelta(days=1)
    return days


def is_line_open(hours: float) -> bool:
    return hours >= MIN_OPEN_HOURS
