from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass(frozen=True, slots=True)
class StockBreakdown:
    """Décomposition du stock virtuellement allouable pour un article.

    - ``available_strict`` : part utilisable hors stock sous CQ.
    - ``available_qc`` : part utilisable provenant du stock sous CQ.
    - ``available_total`` : total allocable (strict + CQ), borné à >= 0.
    """

    available_total: float
    available_strict: float
    available_qc: float


@runtime_checkable
class StockProvider(Protocol):
    """Port : fournit le stock disponible pour l'allocation virtuelle.

    Le domaine ne connaît pas l'implémentation (ERP, mock, etc.).
    """

    def get_available_stock(self, article: str) -> float:
        """Stock utilisable pour la planification (physique + sous CQ - alloué)."""
        ...

    def get_stock_breakdown(self, article: str) -> StockBreakdown:
        """Décomposition strict/CQ du stock allocable pour un article."""
        ...
