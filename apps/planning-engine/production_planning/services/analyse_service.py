"""Analysis services — rupture, EOL, lot-eco, stock projection, stock history."""

from __future__ import annotations

from datetime import date
from typing import Any, Optional

from ..loaders import DataLoader
from ..utils.serialization import serialize_value


class AnalyseService:
    """Facade for all analytical / diagnostic operations."""

    def __init__(self, loader: DataLoader):
        self.loader = loader
        self._analyse_rupture_service: Optional[Any] = None
        self._eol_residuals_service: Optional[Any] = None
        self._stock_history_analyzer: Optional[Any] = None
        self._lot_eco_service: Optional[Any] = None

    # ── Analyse de Rupture ──────────────────────────────────────────

    def analyser_rupture(
        self,
        component_code: str,
        include_previsions: bool = False,
        include_receptions: bool = False,
        use_pool: bool = True,
        merge_branches: bool = True,
        include_sf: bool = True,
        include_pf: bool = False,
    ) -> dict[str, Any]:
        from ..feasibility.analyse_rupture import AnalyseRuptureService

        if self._analyse_rupture_service is None:
            self._analyse_rupture_service = AnalyseRuptureService(self.loader)

        result = self._analyse_rupture_service.analyze(
            component_code,
            include_previsions=include_previsions,
            include_receptions=include_receptions,
            use_pool=use_pool,
            merge_branches=merge_branches,
            include_sf=include_sf,
            include_pf=include_pf,
        )
        return serialize_value(result)

    # ── Analyse Lot Eco ────────────────────────────────────────────

    def analyser_lot_eco(self, target_coverage_weeks: float = 4.0) -> dict[str, Any]:
        from ..feasibility.analyse_lot_eco import AnalyseLotEcoService

        service = AnalyseLotEcoService(self.loader, target_coverage_weeks=target_coverage_weeks)
        result = service.analyser()
        return serialize_value(result)

    # ── Stock Projection ────────────────────────────────────────────

    def project_stock(
        self,
        article: str,
        stock_initial: float,
        lot_eco: int,
        lot_optimal: int,
        delai_reappro_jours: int,
        demande_hebdo: float,
        horizon_weeks: int = 26,
    ) -> dict[str, Any]:
        from ..services.stock_projection_analyzer import StockProjectionService

        service = StockProjectionService(self.loader, horizon_weeks=horizon_weeks)
        result = service.project(
            article=article,
            stock_initial=stock_initial,
            lot_eco=lot_eco,
            lot_optimal=lot_optimal,
            delai_reappro_jours=delai_reappro_jours,
            demande_hebdo=demande_hebdo,
        )
        return serialize_value(result)

    # ── EOL Residual Stock Analysis ────────────────────────────────

    def eol_residuals_analyze(
        self,
        familles: list[str],
        prefixes: list[str],
        bom_depth_mode: str = "full",
        stock_mode: str = "physical",
        component_types: str = "achat_fabrication",
        projection_date: Optional[str] = None,
    ) -> dict[str, Any]:
        from ..feasibility.eol_residuals import EolResidualsService

        if self._eol_residuals_service is None:
            self._eol_residuals_service = EolResidualsService(self.loader)

        parsed_projection_date = None
        if projection_date and stock_mode == "projected":
            parsed_projection_date = date.fromisoformat(projection_date)

        result = self._eol_residuals_service.analyze(
            familles=familles,
            prefixes=prefixes,
            bom_depth_mode=bom_depth_mode,
            stock_mode=stock_mode,
            component_types=component_types,
            projection_date=parsed_projection_date,
        )
        return serialize_value(result)

    def eol_residuals_fab_check(
        self,
        familles: list[str],
        prefixes: list[str],
        desired_qty: int = 1,
        bom_depth_mode: str = "full",
        stock_mode: str = "physical",
        projection_date: Optional[str] = None,
    ) -> dict[str, Any]:
        from ..feasibility.eol_residuals import EolResidualsService
        from ..feasibility.residual_fabrication import ResidualFabricationService
        from ..feasibility.eol_residuals_models import EolComponent

        if self._eol_residuals_service is None:
            self._eol_residuals_service = EolResidualsService(self.loader)

        eol_result = self._eol_residuals_service.analyze(
            familles=familles,
            prefixes=prefixes,
            bom_depth_mode=bom_depth_mode,
            stock_mode=stock_mode,
            component_types="achat_fabrication",
            projection_date=date.fromisoformat(projection_date) if projection_date else None,
        )

        pool = [
            EolComponent(
                article=c.article,
                description=c.description,
                component_type=c.component_type,
                used_by_target_pf_count=c.used_by_target_pf_count,
                stock_qty=c.stock_qty,
                pmp=c.pmp,
                value=c.value,
            )
            for c in eol_result.components
        ]

        pf_codes: list[str] = []
        for article in self.loader.articles.values():
            if not article.is_fabrication():
                continue
            famille = getattr(article, "famille_produit", None) or ""
            code = article.code or ""
            matches_famille = famille in familles
            matches_prefix = any(code.startswith(p) for p in prefixes)
            if matches_famille or matches_prefix:
                pf_codes.append(article.code)

        service = ResidualFabricationService(self.loader, pool)
        results = service.check_all(pf_codes=pf_codes, desired_qty=desired_qty)
        return serialize_value(results)

    # ── Stock History Analysis ───────────────────────────────────────

    def analyser_evolution_stock(
        self,
        itmref: str,
        horizon_days: int = 45,
        include_internal: bool = False,
        include_stock_q: bool = False,
    ) -> dict[str, Any]:
        from ..services.stock_history_analyzer import StockHistoryAnalyzer

        if self._stock_history_analyzer is None:
            self._stock_history_analyzer = StockHistoryAnalyzer()

        stk = self.loader.stocks.get(itmref)
        if stk is None:
            raise RuntimeError(f"Article {itmref} introuvable dans les stocks.")
        stock_physique = float(stk.stock_physique)
        stock_sous_cq = float(stk.stock_sous_cq)

        stock_depart = stock_physique + (stock_sous_cq if include_stock_q else 0.0)

        mouvements = self._stock_history_analyzer.reconstituer_stock(
            itmref=itmref,
            horizon_days=horizon_days,
            include_internal=include_internal,
            stock_actuel=stock_depart,
            include_stock_q=include_stock_q,
        )
        stats = self._stock_history_analyzer.calculer_stats(mouvements)

        description = self._get_article_description(itmref)

        pmp = 0.0
        article = self.loader.articles.get(itmref)
        if article:
            pmp = float(getattr(article, "pmp", 0) or 0)

        return {
            "article": itmref,
            "description": description,
            "stock_physique": stock_physique,
            "stock_sous_cq": stock_sous_cq,
            "valeur_stock": (stock_physique + stock_sous_cq) * pmp,
            "pmp": pmp,
            **(serialize_value(stats)),
            "items": serialize_value(mouvements),
        }

    def _get_article_description(self, itmref: str) -> str:
        if self.loader is not None:
            article = self.loader.articles.get(itmref)
            if article:
                return getattr(article, "description", "")
        try:
            from ..services.x3_client import X3Client
            client = X3Client()
            detail = client.detail("ITMMASTER", itmref, "ZITMMASTER")
            return detail.get("ITMDES1", "") or detail.get("$resources", [{}])[0].get("ITMDES1", "")
        except Exception:
            return ""
