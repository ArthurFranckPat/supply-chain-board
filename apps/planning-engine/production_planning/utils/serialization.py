"""Serialization helpers for dataclasses, dates, and nested structures."""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from typing import Any


def serialize_value(value: Any) -> Any:
    """Serialize a value for JSON/API output.

    Handles:
    - date / datetime → ISO string
    - dataclasses → dict (recursively)
    - dict / list → recursive serialization
    - everything else → as-is
    """
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if is_dataclass(value):
        return {
            key: serialize_value(item)
            for key, item in asdict(value).items()
            if not key.startswith("_")
        }
    if isinstance(value, dict):
        return {key: serialize_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [serialize_value(item) for item in value]
    return value
