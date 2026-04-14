"""Weights loader for AUTORESEARCH scheduler."""

from __future__ import annotations

import json
from pathlib import Path

DEFAULT_WEIGHTS = {
    "w1": 0.7,
    "w2": 0.2,
    "w3": 0.1,
}


def normalize_weights(raw_weights: dict[str, float]) -> dict[str, float]:
    """Normalize weights so they always sum to 1.0."""
    weights = {
        "w1": float(raw_weights.get("w1", DEFAULT_WEIGHTS["w1"])),
        "w2": float(raw_weights.get("w2", DEFAULT_WEIGHTS["w2"])),
        "w3": float(raw_weights.get("w3", DEFAULT_WEIGHTS["w3"])),
    }
    total = sum(weights.values())
    if total <= 0:
        return DEFAULT_WEIGHTS.copy()
    return {key: value / total for key, value in weights.items()}


def load_weights(path: str | Path) -> dict[str, float]:
    """Load weights file and create it with defaults when missing."""
    weights_path = Path(path)
    weights_path.parent.mkdir(parents=True, exist_ok=True)
    if not weights_path.exists():
        weights_path.write_text(
            json.dumps(DEFAULT_WEIGHTS, indent=2) + "\n",
            encoding="utf-8",
        )
        return DEFAULT_WEIGHTS.copy()

    with weights_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return normalize_weights(data)
