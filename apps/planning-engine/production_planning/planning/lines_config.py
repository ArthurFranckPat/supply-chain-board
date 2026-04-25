from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path


DEFAULT_LINES = [
    {
        'code': 'PP_830',
        'label': 'Ligne assemblage 1',
        'default_capacity_hours': 14.0,
        'min_open_hours': 7.0,
    },
    {
        'code': 'PP_153',
        'label': 'Ligne assemblage 2',
        'default_capacity_hours': 14.0,
        'min_open_hours': 7.0,
    },
]


@dataclass(slots=True)
class LineConfig:
    code: str
    label: str
    default_capacity_hours: float
    min_open_hours: float


def load_lines_config(config_dir: str | Path) -> list[LineConfig]:
    config_path = Path(config_dir) / 'lines.json'
    if not config_path.exists():
        return [_line_from_dict(d) for d in DEFAULT_LINES]
    with config_path.open('r', encoding='utf-8') as f:
        data = json.load(f)
    lines_data = data.get('target_lines', [])
    if not lines_data:
        return [_line_from_dict(d) for d in DEFAULT_LINES]
    return [_line_from_dict(d) for d in lines_data]


def _line_from_dict(data: dict) -> LineConfig:
    return LineConfig(
        code=data['code'],
        label=data.get('label', data['code']),
        default_capacity_hours=float(data.get('default_capacity_hours', 14.0)),
        min_open_hours=float(data.get('min_open_hours', 7.0)),
    )


def get_target_lines(config_dir: str | Path) -> tuple[str, ...]:
    lines = load_lines_config(config_dir)
    return tuple(sorted(line.code for line in lines))
