from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import date


@dataclass(slots=True)
class DecisionTrace:
    num_of: str
    scheduled_day: date
    priority: int
    due_urgency: int
    jit_bonus: float
    prematurity_days: int
    target_day_delta: int
    serie_bonus: float
    mix_penalty: int
    kanban_penalty: float
    composite_score: float
    reason_human: str

    def to_dict(self) -> dict:
        return asdict(self)

    def to_human_string(self) -> str:
        return (
            f'{self.num_of} -> {self.scheduled_day} '
            f'(priority={self.priority}, urgency={self.due_urgency}, '
            f'jit={self.jit_bonus}, prematurity={self.prematurity_days}, '
            f'serie={self.serie_bonus}, mix={self.mix_penalty}, '
            f'kanban={self.kanban_penalty}) score={self.composite_score:.3f}'
        )
