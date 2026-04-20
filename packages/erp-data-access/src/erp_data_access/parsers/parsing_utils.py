"""Shared parsing utilities for ERP CSV data."""

from __future__ import annotations

from datetime import date, datetime
from functools import lru_cache
from typing import Optional


# Pre-compile common string checks for faster comparison
_NAN_VALUES = frozenset(("nan", "none", "", "-"))


def to_str(value) -> str:
    """Convert a value to string, handling NaN and numeric types."""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        # Fast NaN check without string conversion when possible
        if isinstance(value, float) and value != value:  # NaN is the only value != itself
            return ""
        return str(value)
    return ""


def parse_int(value) -> int:
    """Convert a value to int, handling French thousands separators and NaN."""
    # Fast path for common types
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        # Fast NaN check
        if value != value:  # NaN check
            return 0
        return int(value)
    if isinstance(value, str):
        # Fast path for empty/zero strings
        val = value.strip()
        if not val or val in _NAN_VALUES:
            return 0
        # Remove French thousands separators
        if "," in val or " " in val:
            val = val.replace(",", "").replace(" ", "")
        try:
            return int(float(val))
        except ValueError:
            return 0
    return 0


def parse_float(value) -> float:
    """Convert a value to float, handling French decimal commas."""
    # Fast path for common types
    if isinstance(value, float):
        # Return 0 for NaN
        return 0.0 if value != value else value
    if isinstance(value, int):
        return float(value)

    if isinstance(value, str):
        val = value.strip()
        if not val or val.lower() in _NAN_VALUES:
            return 0.0
        # Handle French decimal comma
        if "," in val:
            val = val.replace(",", ".")
        try:
            return float(val)
        except ValueError:
            return 0.0

    return 0.0


# Cache datetime parsers for repeated formats
@lru_cache(maxsize=4)
def _get_date_parser(fmt: str):
    """Get cached strptime function for a format."""
    return lambda s: datetime.strptime(s, fmt).date()


def parse_date(value, default: Optional[date] = None) -> Optional[date]:
    """Try multiple date formats (ERP exports are inconsistent)."""
    # Fast path for None
    if value is None:
        return default

    # Fast path for date objects
    if isinstance(value, date) and not isinstance(value, datetime):
        return value

    # Convert to string once
    if isinstance(value, str):
        raw = value.strip()
    else:
        raw = str(value).strip()

    if not raw:
        return default

    # Try formats in order of likelihood
    formats = (
        "%m/%d/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y",
        "%Y-%m-%d",
    )

    for fmt in formats:
        try:
            return _get_date_parser(fmt)(raw)
        except ValueError:
            continue

    return default
