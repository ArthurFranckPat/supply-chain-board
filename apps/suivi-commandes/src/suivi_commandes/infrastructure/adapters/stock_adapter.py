from __future__ import annotations

from typing import TYPE_CHECKING

from suivi_commandes.domain.stock_port import StockProvider, StockBreakdown

if TYPE_CHECKING:
    from erp_data_access.protocols import DataReader


class DataReaderStockProvider(StockProvider):
    """Implémentation du port StockProvider via le DataReader ERP.

    Délègue au modèle Stock.disponible() — une seule source de vérité.
    """

    def __init__(self, data_reader: "DataReader") -> None:
        self._reader = data_reader

    def get_available_stock(self, article: str) -> float:
        return self.get_stock_breakdown(article).available_total

    def get_stock_breakdown(self, article: str) -> StockBreakdown:
        stock = self._reader.get_stock(article)
        if stock is None:
            return StockBreakdown(available_total=0.0, available_strict=0.0, available_qc=0.0)

        total_allocable = max(0.0, float(stock.disponible()))
        strict_allocable = max(0.0, float(stock.disponible_strict()))
        strict_allocable = min(strict_allocable, total_allocable)
        cq_allocable = max(0.0, total_allocable - strict_allocable)

        return StockBreakdown(
            available_total=total_allocable,
            available_strict=strict_allocable,
            available_qc=cq_allocable,
        )
