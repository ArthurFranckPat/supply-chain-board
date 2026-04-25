"""Configurable capacity per poste de charge with day/week overrides."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path


# Weekday keys: 1=Monday ... 6=Saturday, 7=Sunday
WEEKDAY_KEYS = {"1", "2", "3", "4", "5", "6", "7"}

SHIFT_HOURS = {
    "1x8": 7.0,
    "2x8": 14.0,
    "3x8": 21.0,
}


def _preset_pattern(shift: str, include_saturday: bool = False) -> dict[str, float]:
    """Generate a weekly pattern from a shift preset."""
    hours = SHIFT_HOURS.get(shift, 7.0)
    pattern: dict[str, float] = {}
    for d in range(1, 6):  # Mon-Fri
        pattern[str(d)] = hours
    pattern["6"] = hours if include_saturday else 0.0
    pattern["7"] = 0.0
    return pattern


@dataclass
class PosteCapacity:
    """Capacity configuration for a single poste de charge."""
    label: str = ""
    default_hours: float = 7.0
    shift_pattern: str = "1x8"   # "1x8" | "2x8" | "3x8"
    daily_overrides: dict[str, float] = field(default_factory=dict)        # {"2025-04-21": 7.0}
    daily_override_reasons: dict[str, str] = field(default_factory=dict)   # {"2025-04-21": "Vacances"}


@dataclass
class CapacityConfig:
    """Persisted capacity configuration for all postes."""
    shift_hours: float = 7.0
    max_day_hours: float = 21.0
    min_open_hours: float = 7.0
    postes: dict[str, PosteCapacity] = field(default_factory=dict)
    # weekly_overrides: {"2025-W17": {"PP_830": {"pattern": {"1":7,...}, "reason": "1x8"}}}
    weekly_overrides: dict[str, dict[str, dict]] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Load / Save
# ---------------------------------------------------------------------------

def _migrate_weekly_entry(entry) -> dict:
    """Migrate old [hours, reason] format to new {pattern, reason} format."""
    if isinstance(entry, dict):
        return entry
    if isinstance(entry, list) and len(entry) >= 1:
        hours = float(entry[0])
        reason = entry[1] if len(entry) > 1 else ""
        pattern = {str(d): hours for d in range(1, 8)}
        return {"pattern": pattern, "reason": reason}
    return entry


def load_capacity_config(config_dir: str | Path) -> CapacityConfig:
    """Load capacity.json, returning defaults if missing."""
    path = Path(config_dir) / "capacity.json"
    if not path.exists():
        return CapacityConfig()

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        postes = {}
        for key, val in data.get("postes", {}).items():
            postes[key] = PosteCapacity(
                label=val.get("label", ""),
                default_hours=val.get("default_hours", 7.0),
                shift_pattern=val.get("shift_pattern", "1x8"),
                daily_overrides=val.get("daily_overrides", {}),
                daily_override_reasons=val.get("daily_override_reasons", {}),
            )
        weekly = {}
        for week, postes_w in data.get("weekly_overrides", {}).items():
            weekly[week] = {p: _migrate_weekly_entry(e) for p, e in postes_w.items()}
        return CapacityConfig(
            shift_hours=data.get("shift_hours", 7.0),
            max_day_hours=data.get("max_day_hours", 21.0),
            min_open_hours=data.get("min_open_hours", 7.0),
            postes=postes,
            weekly_overrides=weekly,
        )
    except (json.JSONDecodeError, TypeError):
        return CapacityConfig()


def save_capacity_config(config_dir: str | Path, config: CapacityConfig) -> None:
    """Persist capacity configuration."""
    config_dir = Path(config_dir)
    config_dir.mkdir(parents=True, exist_ok=True)
    path = config_dir / "capacity.json"
    data = {
        "shift_hours": config.shift_hours,
        "max_day_hours": config.max_day_hours,
        "min_open_hours": config.min_open_hours,
        "postes": {
            key: {
                "label": p.label,
                "default_hours": p.default_hours,
                "shift_pattern": p.shift_pattern,
                "daily_overrides": p.daily_overrides,
                "daily_override_reasons": p.daily_override_reasons,
            }
            for key, p in config.postes.items()
        },
        "weekly_overrides": config.weekly_overrides,
    }
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------

def _iso_week_key(day: date) -> str:
    """Return ISO week key like '2025-W17'."""
    iso = day.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def get_capacity_for_day(
    poste: str,
    day: date,
    config: CapacityConfig,
) -> float:
    """Resolve capacity for a poste on a given day.

    Priority: daily override > weekly override (per-day pattern) > poste default > global default.
    """
    iso = day.isoformat()
    weekday_key = str(day.isoweekday())  # 1=Mon ... 7=Sun

    # 1. Daily override
    poste_cfg = config.postes.get(poste)
    if poste_cfg and iso in poste_cfg.daily_overrides:
        return poste_cfg.daily_overrides[iso]

    # 2. Weekly override (pattern)
    week_key = _iso_week_key(day)
    week_overrides = config.weekly_overrides.get(week_key, {})
    if poste in week_overrides:
        entry = week_overrides[poste]
        pattern = entry.get("pattern", {}) if isinstance(entry, dict) else {}
        if weekday_key in pattern:
            return float(pattern[weekday_key])

    # 3. Poste default
    if poste_cfg:
        return poste_cfg.default_hours

    # 4. Global default
    return config.shift_hours


def ensure_poste(config: CapacityConfig, poste: str, label: str = "") -> PosteCapacity:
    """Get or create a PosteCapacity entry."""
    if poste not in config.postes:
        config.postes[poste] = PosteCapacity(label=label or poste)
    elif label and not config.postes[poste].label:
        config.postes[poste].label = label
    return config.postes[poste]


def set_daily_override(
    config: CapacityConfig,
    poste: str,
    day_iso: str,
    hours: float,
    reason: str = "",
) -> None:
    """Add or update a daily override for a poste."""
    poste_cfg = ensure_poste(config, poste)
    poste_cfg.daily_overrides[day_iso] = hours
    if reason:
        poste_cfg.daily_override_reasons[day_iso] = reason
    elif day_iso in poste_cfg.daily_override_reasons:
        del poste_cfg.daily_override_reasons[day_iso]


def remove_daily_override(config: CapacityConfig, poste: str, day_iso: str) -> None:
    """Remove a daily override."""
    poste_cfg = config.postes.get(poste)
    if poste_cfg is None:
        return
    poste_cfg.daily_overrides.pop(day_iso, None)
    poste_cfg.daily_override_reasons.pop(day_iso, None)


def set_weekly_override(
    config: CapacityConfig,
    week_key: str,
    poste: str,
    pattern: dict[str, float],
    reason: str = "",
) -> None:
    """Add or update a weekly override with a per-day pattern."""
    if week_key not in config.weekly_overrides:
        config.weekly_overrides[week_key] = {}
    config.weekly_overrides[week_key][poste] = {
        "pattern": pattern,
        "reason": reason,
    }


def remove_weekly_override(config: CapacityConfig, week_key: str, poste: str) -> None:
    """Remove a weekly override."""
    week = config.weekly_overrides.get(week_key)
    if week and poste in week:
        del week[poste]
        if not week:
            del config.weekly_overrides[week_key]


def to_api_dict(config: CapacityConfig) -> dict:
    """Serialize config for API responses."""
    return {
        "defaults": {
            "shift_hours": config.shift_hours,
            "max_day_hours": config.max_day_hours,
            "min_open_hours": config.min_open_hours,
        },
        "postes": {
            key: {
                "poste": key,
                "label": p.label,
                "default_hours": p.default_hours,
                "shift_pattern": p.shift_pattern,
                "daily_overrides": {
                    d: {"hours": p.daily_overrides[d], "reason": p.daily_override_reasons.get(d, "")}
                    for d in p.daily_overrides
                },
            }
            for key, p in config.postes.items()
        },
        "weekly_overrides": config.weekly_overrides,
    }
