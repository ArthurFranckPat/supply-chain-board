"""Simulation context for feasibility analysis.

Wraps a DataLoader and provides virtual copies of stock state and capacity
schedule without mutating the real data. Each API call creates a fresh
SimulationContext with zero side effects.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Optional

from ..planning.calendar_config import CalendarConfig, is_workday, previous_workday
from ..planning.capacity_config import CapacityConfig, get_capacity_for_day


class SimulationContext:
    """Immutable simulation environment for feasibility analysis.

    Creates virtual copies of stock state and reception indexes.
    Does NOT modify the underlying DataLoader.
    """

    def __init__(
        self,
        loader,
        reference_date: date,
        calendar_config: Optional[CalendarConfig] = None,
        capacity_config: Optional[CapacityConfig] = None,
    ):
        self.loader = loader
        self.reference_date = reference_date
        self.calendar_config = calendar_config
        self.capacity_config = capacity_config

        # Lazy imports to avoid circular dependency at module level
        from ..scheduling.material import build_material_stock_state, build_receptions_by_day

        # Virtual stock state (initialized from real data, safe to mutate)
        self.stock_state = build_material_stock_state(loader)

        # Reception index by day (read-only from real data)
        self.receptions_by_day: dict[date, list[tuple[str, float]]] = build_receptions_by_day(loader)

        # Virtual schedule: {date: {poste: hours_used}}
        self.schedule_state: dict[date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        self._load_existing_schedule()

        # Track which days have had receptions applied
        self._receptions_applied_through: Optional[date] = None

    def _load_existing_schedule(self) -> None:
        """Pre-fill schedule with existing OFs that have date_debut set."""
        from ..planning.charge_calculator import calculate_article_charge

        for of in self.loader.ofs:
            if of.qte_restante > 0 and of.date_debut:
                charge_map = calculate_article_charge(of.article, of.qte_restante, self.loader)
                for poste, hours in charge_map.items():
                    self.schedule_state[of.date_debut][poste] += hours

    def apply_receptions_until(self, target_date: date) -> None:
        """Add receptions to virtual stock up to target_date (inclusive)."""
        if self._receptions_applied_through is not None and target_date <= self._receptions_applied_through:
            return  # Already applied through a later date

        start = (self._receptions_applied_through or date.min) + timedelta(days=1)
        current = start
        while current <= target_date:
            for article, quantity in self.receptions_by_day.get(current, []):
                self.stock_state.add_supply(article, quantity)
            current += timedelta(days=1)

        self._receptions_applied_through = target_date

    def get_available_capacity(self, poste: str, day: date) -> float:
        """Get remaining capacity for a poste on a given day."""
        if self.capacity_config is None:
            return 7.0  # Default shift
        max_cap = get_capacity_for_day(poste, day, self.capacity_config)
        used = self.schedule_state.get(day, {}).get(poste, 0.0)
        return max(0.0, max_cap - used)

    def reserve_capacity(self, poste: str, day: date, hours: float) -> None:
        """Reserve capacity in virtual schedule."""
        self.schedule_state[day][poste] += hours

    def create_checker(self, check_date: date, *, use_receptions: bool = True):
        """Create a RecursiveChecker using virtual stock state."""
        from .recursive import RecursiveChecker

        return RecursiveChecker(
            self.loader,
            use_receptions=use_receptions,
            check_date=check_date,
            stock_state=self.stock_state,
        )

    def is_workday(self, day: date) -> bool:
        """Check if a day is a working day."""
        return is_workday(day, self.calendar_config)

    def previous_workday(self, day: date, offset: int = 1) -> date:
        """Get a previous working day."""
        return previous_workday(day, offset, self.calendar_config)
