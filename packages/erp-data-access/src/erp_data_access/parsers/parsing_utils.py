"""Shared parsing utilities for ERP CSV data."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional


def to_str(value) -> str:
    """Convert a value to string, handling NaN and numeric types."""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        if str(value).lower() == "nan":
            return ""
        return str(value)
    return ""


def parse_int(value) -> int:
    """Convert a value to int, handling French thousands separators and NaN."""
    if isinstance(value, (int, float)):
        if str(value).lower() == "nan":
            return 0
        return int(value)
    if isinstance(value, str):
        cleaned = value.replace(",", "").replace(" ", "").strip()
        if cleaned == "" or cleaned == "-" or cleaned.lower() == "nan":
            return 0
        return int(float(cleaned))
    return 0


def parse_float(value) -> float:
    """Convert a value to float, handling French decimal commas."""
    s = str(value).strip().replace(",", ".")
    try:
        return float(s) if s and s.lower() not in ("nan", "none", "") else 0.0
    except ValueError:
        return 0.0


def parse_date(value, default: Optional[date] = None) -> Optional[date]:
    """Try multiple date formats (ERP exports are inconsistent)."""
    raw = to_str(value).strip()
    if not raw:
        return default
    for fmt in (
        "%m/%d/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y",
        "%Y-%m-%d",
    ):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return default
