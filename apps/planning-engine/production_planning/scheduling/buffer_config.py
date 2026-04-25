"""Buffer stock thresholds — loaded from config/buffer_thresholds.json at import time."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict


def _load_buffer_thresholds() -> Dict[str, float]:
    config_path = Path(__file__).resolve().parents[2] / "config" / "buffer_thresholds.json"
    if config_path.exists():
        with open(config_path, encoding="utf-8") as f:
            data = json.load(f)
        return {str(k): float(v) for k, v in data.items()}
    # Fallback — should not happen in production
    return {
        "BDH2216AL": 673.0,
        "BDH2231AL": 598.0,
        "BDH2251AL": 598.0,
    }


BUFFER_THRESHOLDS: dict[str, float] = _load_buffer_thresholds()
