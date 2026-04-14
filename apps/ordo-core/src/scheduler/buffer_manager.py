"""Gestion du stock tampon BDH projete."""

from __future__ import annotations

from collections import defaultdict
from datetime import date

from .bom_graph import TRACKED_BDH
from .models import BufferSnapshot

BUFFER_MINIMUM = {
    "BDH2216AL": 673,
    "BDH2231AL": 598,
    "BDH2251AL": 598,
}


class BufferManager:
    """Projette le stock BDH jour par jour."""

    def __init__(self, loader):
        self.current_stock = {
            article: self._net_stock(loader, article)
            for article in TRACKED_BDH
        }
        self.pending_additions: dict[date, dict[str, int]] = defaultdict(dict)
        self.snapshots: list[BufferSnapshot] = []

    @staticmethod
    def _net_stock(loader, article: str) -> int:
        stock = loader.get_stock(article)
        if stock is None:
            return 0
        return stock.stock_physique - stock.stock_alloue - stock.stock_bloque

    def roll_to_day(self, day: date) -> None:
        additions = self.pending_additions.pop(day, {})
        for article, quantity in additions.items():
            self.current_stock[article] = self.current_stock.get(article, 0) + quantity

    def below_threshold(self) -> list[str]:
        return [
            article
            for article, threshold in BUFFER_MINIMUM.items()
            if self.current_stock.get(article, 0) < threshold
        ]

    def can_cover(self, required: dict[str, int]) -> bool:
        return all(self.current_stock.get(article, 0) >= quantity for article, quantity in required.items())

    def consume(self, required: dict[str, int]) -> None:
        for article, quantity in required.items():
            self.current_stock[article] = self.current_stock.get(article, 0) - quantity

    def schedule_addition(self, day: date, article: str, quantity: int) -> None:
        additions = self.pending_additions[day]
        additions[article] = additions.get(article, 0) + quantity

    def record_snapshot(self, day: date) -> None:
        for article in TRACKED_BDH:
            self.snapshots.append(
                BufferSnapshot(day=day, article=article, stock_projected=self.current_stock.get(article, 0))
            )
