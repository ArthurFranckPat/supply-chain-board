from __future__ import annotations

from suivi_commandes.domain.stock_port import StockProvider, StockBreakdown, StockComposantInfo


class InMemoryStockProvider(StockProvider):
    """StockProvider initialisé depuis les données présentes dans les rows dict.

    Utilisé par le endpoint /status/assign qui n'a pas accès au DataLoader ERP.
    """

    def __init__(self, rows: list[dict]) -> None:
        self._stock: dict[str, StockBreakdown] = {}
        for row in rows:
            article = str(row.get("Article", ""))
            if not article:
                continue

            physique = float(row.get("Stock interne 'A'", 0) or 0)
            sous_cq = float(row.get("Stock sous CQ", 0) or 0)
            alloue = float(row.get("Alloué interne 'A'", 0) or 0)

            total_allocable = max(0.0, physique + sous_cq - alloue)
            strict_allocable = max(0.0, physique - alloue)
            strict_allocable = min(strict_allocable, total_allocable)
            cq_allocable = max(0.0, total_allocable - strict_allocable)

            candidate = StockBreakdown(
                available_total=total_allocable,
                available_strict=strict_allocable,
                available_qc=cq_allocable,
            )

            # Garde la vue la plus "favorable" par article (cas rows multi-emplacements).
            current = self._stock.get(article)
            if current is None or candidate.available_total > current.available_total:
                self._stock[article] = candidate

    def get_available_stock(self, article: str) -> float:
        breakdown = self._stock.get(article)
        if breakdown is None:
            return 0.0
        return breakdown.available_total

    def get_stock_breakdown(self, article: str) -> StockBreakdown:
        return self._stock.get(
            article,
            StockBreakdown(available_total=0.0, available_strict=0.0, available_qc=0.0),
        )

    def get_stock_detail(
        self, article: str, num_commande: str | None = None
    ) -> StockComposantInfo:
        breakdown = self._stock.get(article)
        physique = 0.0
        sous_cq = 0.0
        alloue = 0.0
        if breakdown is not None:
            physique = breakdown.available_strict
            sous_cq = breakdown.available_qc
        return StockComposantInfo(
            article=article,
            stock_physique=physique,
            stock_sous_cq=sous_cq,
            stock_alloue=alloue,
            disponible_total=breakdown.available_total if breakdown else 0.0,
            disponible_strict=breakdown.available_strict if breakdown else 0.0,
        )
