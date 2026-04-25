"""Shared availability computations for stock/receptions across modules."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass(slots=True)
class AvailabilitySnapshot:
    """Availability view for one article at one target date."""

    article: str
    available_without_receptions: float
    receptions_until_date: float
    available_at_date: float
    earliest_reception: Optional[date]


@dataclass(slots=True)
class SupplyCoverage:
    """First date where cumulative supply reaches the required quantity."""

    date: date
    available_before: float
    available_after: float


class AvailabilityKernel:
    """Common stock/reception availability logic."""

    def __init__(self, loader) -> None:
        self.loader = loader

    def has_stock_record(self, article: str) -> bool:
        """True when stock data exists for article."""
        return self._get_stock_record(article) is not None

    def available_without_receptions(self, article: str, *, stock_state=None) -> float:
        """Return base available qty from stock or virtual stock_state."""
        if stock_state is not None:
            return float(stock_state.get_available(article))

        stock = self._get_stock_record(article)
        if stock is None:
            return 0.0

        if hasattr(stock, "disponible"):
            return float(stock.disponible())

        stock_physique = float(getattr(stock, "stock_physique", 0.0) or 0.0)
        stock_alloue = float(getattr(stock, "stock_alloue", 0.0) or 0.0)
        return stock_physique - stock_alloue

    def reception_qty_until(self, article: str, target_date: date, *, inclusive: bool = True) -> float:
        """Return positive receptions cumulative qty up to target_date."""
        total = 0.0
        for reception in self.sorted_positive_receptions(article):
            if self._is_reception_before(reception, target_date, inclusive=inclusive):
                total += float(reception.quantite_restante)
            else:
                break
        return total

    def total_receptions(self, article: str) -> float:
        """Return total positive receptions regardless of date."""
        return sum(float(reception.quantite_restante) for reception in self.sorted_positive_receptions(article))

    def earliest_reception_date(self, article: str) -> Optional[date]:
        """Return first positive reception date if any."""
        receptions = self.sorted_positive_receptions(article)
        if not receptions:
            return None
        return receptions[0].date_reception_prevue

    def available_at_date(
        self,
        article: str,
        target_date: date,
        *,
        use_receptions: bool = True,
        stock_state=None,
        inclusive: bool = True,
    ) -> float:
        """Return available qty at target_date with optional receptions."""
        base = self.available_without_receptions(article, stock_state=stock_state)
        if not use_receptions:
            return base
        return base + self.reception_qty_until(article, target_date, inclusive=inclusive)

    def snapshot(
        self,
        article: str,
        target_date: date,
        *,
        use_receptions: bool = True,
        stock_state=None,
        inclusive: bool = True,
    ) -> AvailabilitySnapshot:
        """Return unified availability details for one article/date."""
        base = self.available_without_receptions(article, stock_state=stock_state)
        recv_qty = (
            self.reception_qty_until(article, target_date, inclusive=inclusive)
            if use_receptions
            else 0.0
        )
        return AvailabilitySnapshot(
            article=article,
            available_without_receptions=base,
            receptions_until_date=recv_qty,
            available_at_date=base + recv_qty,
            earliest_reception=self.earliest_reception_date(article),
        )

    @staticmethod
    def net_shortage(
        quantity_needed: float,
        quantity_available: float,
        *,
        reserved_quantity: float = 0.0,
    ) -> float:
        """Return missing quantity after considering reserved allocations."""
        need_after_reserved = float(quantity_needed) - float(reserved_quantity)
        return max(0.0, need_after_reserved - float(quantity_available))

    def shortage_at_date(
        self,
        article: str,
        quantity_needed: float,
        target_date: date,
        *,
        use_receptions: bool = True,
        stock_state=None,
        reserved_quantity: float = 0.0,
        inclusive: bool = True,
    ) -> float:
        """Return net shortage for article at target_date."""
        available = self.available_at_date(
            article,
            target_date,
            use_receptions=use_receptions,
            stock_state=stock_state,
            inclusive=inclusive,
        )
        return self.net_shortage(
            quantity_needed,
            available,
            reserved_quantity=reserved_quantity,
        )

    def earliest_supply_coverage(
        self,
        article: str,
        quantity_needed: float,
        *,
        stock_state=None,
        reserved_quantity: float = 0.0,
    ) -> Optional[SupplyCoverage]:
        """Return first coverage event date where cumulative supply reaches need."""
        available = self.available_without_receptions(article, stock_state=stock_state)
        if self.net_shortage(
            quantity_needed,
            available,
            reserved_quantity=reserved_quantity,
        ) <= 0:
            return None

        cumulative = available
        for reception in self.sorted_positive_receptions(article):
            before = cumulative
            cumulative += float(reception.quantite_restante)
            if self.net_shortage(
                quantity_needed,
                cumulative,
                reserved_quantity=reserved_quantity,
            ) <= 0:
                return SupplyCoverage(
                    date=reception.date_reception_prevue,
                    available_before=before,
                    available_after=cumulative,
                )
        return None

    def earliest_supply_date(
        self,
        article: str,
        quantity_needed: float,
        *,
        stock_state=None,
        reserved_quantity: float = 0.0,
    ) -> Optional[date]:
        """Return first date where stock+receptions cover required qty."""
        coverage = self.earliest_supply_coverage(
            article,
            quantity_needed,
            stock_state=stock_state,
            reserved_quantity=reserved_quantity,
        )
        return coverage.date if coverage is not None else None

    def sorted_positive_receptions(self, article: str) -> list:
        """Return receptions sorted by date with strictly positive quantity."""
        get_receptions = getattr(self.loader, "get_receptions", None)
        if not callable(get_receptions):
            return []

        receptions = get_receptions(article) or []
        positive = [
            reception
            for reception in receptions
            if float(getattr(reception, "quantite_restante", 0.0) or 0.0) > 0.0
        ]
        return sorted(positive, key=lambda reception: reception.date_reception_prevue)

    def _get_stock_record(self, article: str):
        get_stock = getattr(self.loader, "get_stock", None)
        if callable(get_stock):
            return get_stock(article)

        stocks = getattr(self.loader, "stocks", None)
        if isinstance(stocks, dict):
            return stocks.get(article)
        return None

    @staticmethod
    def _is_reception_before(reception, target_date: date, *, inclusive: bool) -> bool:
        if inclusive:
            return reception.date_reception_prevue <= target_date
        return reception.date_reception_prevue < target_date
