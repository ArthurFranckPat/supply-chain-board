from __future__ import annotations

from typing import TYPE_CHECKING

from suivi_commandes.domain.stock_port import StockProvider, StockBreakdown, StockComposantInfo

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

    def get_stock_detail(
        self, article: str, num_commande: str | None = None
    ) -> StockComposantInfo:
        stock = self._reader.get_stock(article)
        article_obj = self._reader.get_article(article)
        designation = article_obj.description if article_obj else ""


        # Allocations depuis Allocations.csv pour cet article + commande
        alloue = 0.0
        if num_commande:
            allocs = self._reader.get_allocations_of(num_commande)
            for a in allocs:
                if a.article == article:
                    alloue += float(a.qte_allouee)

        if stock is None:
            receptions = self._reader.get_receptions(article)
            next_rec = receptions[0] if receptions else None
            return StockComposantInfo(
                article=article,
                designation=designation,
                stock_alloue=alloue,
                prochain_arrive=next_rec.date_reception_prevue.strftime("%d/%m/%Y") if next_rec else "",
                qte_arrive=float(next_rec.quantite_restante) if next_rec else 0.0,
            )

        receptions = self._reader.get_receptions(article)
        next_rec = receptions[0] if receptions else None

        return StockComposantInfo(
            article=article,
            designation=designation,
            stock_physique=float(stock.stock_physique),
            stock_sous_cq=float(stock.stock_sous_cq),
            stock_alloue=alloue,
            disponible_total=float(stock.disponible()),
            disponible_strict=float(stock.disponible_strict()),
            prochain_arrive=next_rec.date_reception_prevue.strftime("%d/%m/%Y") if next_rec else "",
            qte_arrive=float(next_rec.quantite_restante) if next_rec else 0.0,
        )
