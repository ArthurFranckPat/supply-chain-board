from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional


@dataclass
class CandidateOF:
    """Scheduling candidate on one target line."""

    num_of: str
    article: str
    description: str
    line: str
    due_date: date
    quantity: int
    charge_hours: float
    is_buffer_bdh: bool = False
    source: str = "matching_client"
    statut_num: int = 3
    blocking_components: str = ""
    linked_orders: str = ""
    scheduled_day: Optional[date] = None
    start_hour: Optional[float] = None
    end_hour: Optional[float] = None
    reason: str = ""
    deviations: int = 0
    target_day: Optional[date] = None  # Jour cible idéal pour le lissage


@dataclass
class DaySchedule:
    """Daily schedule for one line."""

    line: str
    day: date
    assignments: list[CandidateOF] = field(default_factory=list)
    consumed_hours: float = 0.0

    @property
    def total_hours(self) -> float:
        return round(
            sum(item.charge_hours for item in self.assignments) + self.consumed_hours,
            3,
        )

    @property
    def engaged_hours(self) -> float:
        """Charge reelle engagee (sans les OF bloques rupture)."""
        return round(sum(item.charge_hours for item in self.assignments if not item.blocking_components), 3)


@dataclass
class SchedulerResult:
    """Final scheduling outputs."""

    score: float
    taux_service: float
    taux_ouverture: float
    nb_deviations: int
    nb_jit: int
    nb_changements_serie: int
    plannings: dict[str, list[CandidateOF]]
    line_candidates: dict[str, list[CandidateOF]]
    stock_projection: list[dict[str, object]]
    alerts: list[str]
    weights: dict[str, float]
    unscheduled_rows: list[dict[str, object]]
    order_rows: list[dict[str, object]]
    line_labels: dict[str, str] = field(default_factory=dict)
    reception_rows: list[dict[str, object]] = field(default_factory=list)
