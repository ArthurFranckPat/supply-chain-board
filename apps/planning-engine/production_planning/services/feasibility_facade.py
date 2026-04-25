"""Feasibility facade — thin wrapper around FeasibilityService with config caching."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any, Optional

from ..loaders import DataLoader
from ..utils.serialization import serialize_value


class FeasibilityFacade:
    """Lazy-initialises FeasibilityService with calendar + capacity configs."""

    def __init__(self, loader: DataLoader, config_dir: Path):
        self.loader = loader
        self.config_dir = str(config_dir)
        self._service: Optional[Any] = None

    def _get_calendar_config(self):
        from ..planning.calendar_config import load_calendar_config
        from ..planning.holidays import ensure_holidays_in_calendar
        year = date.today().year
        config = load_calendar_config(self.config_dir, year)
        config = ensure_holidays_in_calendar(self.config_dir, config)
        return config

    def _get_service(self) -> Any:
        if self._service is None:
            from ..feasibility.feasibility_service import FeasibilityService
            from ..planning.capacity_config import load_capacity_config

            calendar_cfg = self._get_calendar_config()
            capacity_cfg = load_capacity_config(self.config_dir)
            self._service = FeasibilityService(self.loader, calendar_cfg, capacity_cfg)
        return self._service

    def check(
        self,
        article: str,
        quantity: int,
        desired_date: str,
        use_receptions: bool = True,
        check_capacity: bool = True,
        depth_mode: str = "full",
    ) -> dict[str, Any]:
        result = self._get_service().check(
            article, quantity, date.fromisoformat(desired_date),
            use_receptions=use_receptions,
            check_capacity=check_capacity,
            depth_mode=depth_mode,
        )
        return serialize_value(result)

    def promise_date(
        self,
        article: str,
        quantity: int,
        max_horizon_days: int = 60,
    ) -> dict[str, Any]:
        result = self._get_service().promise_date(
            article, quantity, max_horizon_days=max_horizon_days
        )
        return serialize_value(result)

    def reschedule(
        self,
        num_commande: str,
        article: str,
        new_date: str,
        new_quantity: Optional[int] = None,
        depth_mode: str = "full",
        use_receptions: bool = True,
    ) -> dict[str, Any]:
        result = self._get_service().reschedule(
            num_commande, article, date.fromisoformat(new_date),
            new_quantity=new_quantity,
            depth_mode=depth_mode,
            use_receptions=use_receptions,
        )
        return serialize_value(result)

    def search_articles(self, query: str, limit: int = 20) -> list[dict]:
        return self._get_service().search_articles(query, limit)

    def search_orders(self, query: str, limit: int = 30) -> list[dict]:
        return self._get_service().search_orders(query, limit)
