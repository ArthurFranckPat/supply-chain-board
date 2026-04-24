"""FastAPI server for the local GUI."""

from __future__ import annotations

from pathlib import Path
from typing import Optional
import os

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ..app import GuiAppService
from .x3_routes import router as x3_router


class DataLoadRequest(BaseModel):
    source: str = Field(default="extractions")
    extractions_dir: Optional[str] = None


class RunScheduleRequest(BaseModel):
    immediate_components: bool = False
    blocking_components_mode: str = Field(default="blocked", pattern="^(blocked|direct|both)$")
    demand_horizon_days: int = Field(default=15, ge=7, le=60)


class CalendarManualOffRequest(BaseModel):
    year: int
    additions: list[dict] = Field(default_factory=list)   # [{date, reason}]
    removals: list[str] = Field(default_factory=list)      # ["2025-04-25"]


class HolidaysRefreshRequest(BaseModel):
    year: int


class PosteCapacityUpdate(BaseModel):
    poste: str
    default_hours: float
    shift_pattern: str = Field(default="1x8", pattern="^(1x8|2x8|3x8)$")
    label: str = ""


class CapacityOverrideRequest(BaseModel):
    poste: str
    key: str          # ISO date "2025-04-21" or ISO week "2025-W17"
    hours: float = 0.0
    reason: str = ""
    pattern: Optional[dict[str, float]] = None  # {"1": 14, "2": 14, ...} for weekly


class AnalyseRuptureRequest(BaseModel):
    component_code: str
    include_previsions: bool = False
    include_receptions: bool = False
    use_pool: bool = True
    merge_branches: bool = True
    include_sf: bool = True
    include_pf: bool = False


class EolResidualsRequest(BaseModel):
    familles: list[str] = Field(default_factory=list)
    prefixes: list[str] = Field(default_factory=list)
    bom_depth_mode: str = Field(default="full", pattern="^(level1|full)$")
    stock_mode: str = Field(default="physical", pattern="^(physical|net_releaseable|projected)$")
    component_types: str = Field(default="achat_fabrication")
    projection_date: Optional[str] = None


class ResidualFabRequest(BaseModel):
    familles: list[str] = Field(default_factory=list)
    prefixes: list[str] = Field(default_factory=list)
    desired_qty: int = Field(default=1, ge=1)
    bom_depth_mode: str = Field(default="full", pattern="^(level1|full)$")
    stock_mode: str = Field(default="physical", pattern="^(physical|net_releaseable|projected)$")
    projection_date: Optional[str] = None


class FeasibilityCheckRequest(BaseModel):
    article: str
    quantity: int = Field(gt=0)
    desired_date: str  # ISO date
    use_receptions: bool = True
    check_capacity: bool = True
    depth_mode: str = Field(default="full", pattern="^(level1|full)$")


class PromiseDateRequest(BaseModel):
    article: str
    quantity: int = Field(gt=0)
    max_horizon_days: int = Field(default=60, ge=7, le=120)


class RescheduleRequest(BaseModel):
    num_commande: str
    article: str
    new_date: str  # ISO date
    new_quantity: Optional[int] = None
    depth_mode: str = Field(default="full", pattern="^(level1|full)$")
    use_receptions: bool = True


class StockEvolutionRequest(BaseModel):
    itmref: str
    horizon_days: int = Field(default=45, ge=1, le=365)
    include_internal: bool = Field(default=False)
    include_stock_q: bool = Field(default=False)


def create_app(service: Optional[GuiAppService] = None) -> FastAPI:
    app = FastAPI(
        title="Ordo v2 Local API",
        version="0.1.0",
        description="Local API for the industrial command center GUI.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.gui_service = service or GuiAppService(Path(__file__).resolve().parents[2])

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/config")
    def get_config() -> dict:
        return app.state.gui_service.get_config()

    @app.post("/data/load")
    def load_data(payload: DataLoadRequest) -> dict:
        return app.state.gui_service.load_data(
            source=payload.source,
            extractions_dir=payload.extractions_dir,
        )

    @app.post("/runs/schedule")
    def run_schedule(payload: RunScheduleRequest) -> dict:
        try:
            return app.state.gui_service.run_schedule(
                immediate_components=payload.immediate_components,
                blocking_components_mode=payload.blocking_components_mode,
                demand_horizon_days=payload.demand_horizon_days,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/runs/{run_id}")
    def get_run(run_id: str) -> dict:
        run = app.state.gui_service.get_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run introuvable")
        return run

    @app.get("/reports/actions/latest")
    def latest_action_report() -> dict:
        return app.state.gui_service.get_latest_report("actions")

    @app.get("/reports/files")
    def list_reports() -> list[dict]:
        return app.state.gui_service.list_reports()

    # ── Calendar ─────────────────────────────────────────────────

    @app.get("/calendar/{year}/{month}")
    def get_calendar(year: int, month: int) -> dict:
        if month < 1 or month > 12:
            raise HTTPException(status_code=400, detail="Month must be 1-12")
        return app.state.gui_service.get_calendar(year, month)

    @app.put("/calendar/manual-off")
    def update_manual_off(payload: CalendarManualOffRequest) -> dict:
        return app.state.gui_service.update_manual_off_days(
            year=payload.year,
            additions=payload.additions,
            removals=payload.removals,
        )

    @app.post("/calendar/holidays/refresh")
    def refresh_holidays(payload: HolidaysRefreshRequest) -> dict:
        return app.state.gui_service.refresh_holidays(payload.year)

    # ── Capacity ─────────────────────────────────────────────────

    @app.get("/capacity")
    def get_capacity() -> dict:
        return app.state.gui_service.get_capacity_config()

    @app.put("/capacity/poste")
    def update_poste_capacity(payload: PosteCapacityUpdate) -> dict:
        return app.state.gui_service.update_poste_capacity(
            poste=payload.poste,
            default_hours=payload.default_hours,
            shift_pattern=payload.shift_pattern,
            label=payload.label,
        )

    @app.put("/capacity/override")
    def set_capacity_override(payload: CapacityOverrideRequest) -> dict:
        return app.state.gui_service.set_capacity_override(
            poste=payload.poste,
            key=payload.key,
            hours=payload.hours,
            reason=payload.reason,
            pattern=payload.pattern,
        )

    @app.delete("/capacity/override")
    def remove_capacity_override(payload: CapacityOverrideRequest) -> dict:
        return app.state.gui_service.remove_capacity_override(
            poste=payload.poste,
            key=payload.key,
        )

    # ── Analyse de Rupture ────────────────────────────────────────────

    @app.post("/api/v1/analyse-rupture")
    def analyser_rupture(payload: AnalyseRuptureRequest) -> dict:
        if not payload.component_code:
            raise HTTPException(status_code=400, detail="component_code requis")
        try:
            return app.state.gui_service.analyser_rupture(
                payload.component_code,
                include_previsions=payload.include_previsions,
                include_receptions=payload.include_receptions,
                use_pool=payload.use_pool,
                merge_branches=payload.merge_branches,
                include_sf=payload.include_sf,
                include_pf=payload.include_pf,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # ── EOL Residual Stock Analysis ─────────────────────────────────

    @app.post("/api/v1/eol-residuals")
    def eol_residuals(payload: EolResidualsRequest) -> dict:
        try:
            return app.state.gui_service.eol_residuals_analyze(
                familles=payload.familles,
                prefixes=payload.prefixes,
                bom_depth_mode=payload.bom_depth_mode,
                stock_mode=payload.stock_mode,
                component_types=payload.component_types,
                projection_date=payload.projection_date,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/v1/eol-residuals/fabricable")
    def eol_residuals_fabricable(payload: ResidualFabRequest) -> dict:
        try:
            return app.state.gui_service.eol_residuals_fab_check(
                familles=payload.familles,
                prefixes=payload.prefixes,
                desired_qty=payload.desired_qty,
                bom_depth_mode=payload.bom_depth_mode,
                stock_mode=payload.stock_mode,
                projection_date=payload.projection_date,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # ── Feasibility ─────────────────────────────────────────────────

    @app.post("/api/v1/feasibility/check")
    def feasibility_check(payload: FeasibilityCheckRequest) -> dict:
        try:
            return app.state.gui_service.feasibility_check(
                article=payload.article,
                quantity=payload.quantity,
                desired_date=payload.desired_date,
                use_receptions=payload.use_receptions,
                check_capacity=payload.check_capacity,
                depth_mode=payload.depth_mode,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/v1/feasibility/promise-date")
    def feasibility_promise_date(payload: PromiseDateRequest) -> dict:
        try:
            return app.state.gui_service.feasibility_promise_date(
                article=payload.article,
                quantity=payload.quantity,
                max_horizon_days=payload.max_horizon_days,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/v1/feasibility/reschedule")
    def feasibility_reschedule(payload: RescheduleRequest) -> dict:
        try:
            return app.state.gui_service.feasibility_reschedule(
                num_commande=payload.num_commande,
                article=payload.article,
                new_date=payload.new_date,
                new_quantity=payload.new_quantity,
                depth_mode=payload.depth_mode,
                use_receptions=payload.use_receptions,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/v1/feasibility/articles")
    def feasibility_search_articles(q: str = "", limit: int = 20) -> dict:
        try:
            results = app.state.gui_service.feasibility_search_articles(q, limit)
            return {"articles": results}
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/v1/feasibility/orders")
    def feasibility_search_orders(q: str = "", limit: int = 30) -> dict:
        try:
            results = app.state.gui_service.feasibility_search_orders(q, limit)
            return {"orders": results}
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # ── Stock Evolution ───────────────────────────────────────────────

    @app.get("/api/v1/stock-evolution/{itmref}")
    def stock_evolution(
        itmref: str,
        horizon_days: int = 45,
        include_internal: bool = False,
        include_stock_q: bool = False,
    ) -> dict:
        try:
            return app.state.gui_service.analyser_evolution_stock(
                itmref=itmref,
                horizon_days=horizon_days,
                include_internal=include_internal,
                include_stock_q=include_stock_q,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    @app.post("/api/v1/stock-evolution/analytics")
    def stock_evolution_analytics(payload: StockEvolutionRequest) -> dict:
        try:
            return app.state.gui_service.analyser_evolution_stock(
                itmref=payload.itmref,
                horizon_days=payload.horizon_days,
                include_internal=payload.include_internal,
                include_stock_q=payload.include_stock_q,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    # ── Analyse Lot Eco ─────────────────────────────────────────────

    @app.post("/api/v1/analyse-lot-eco")
    def analyse_lot_eco(target_coverage_weeks: float = 4.0) -> dict:
        try:
            return app.state.gui_service.analyser_lot_eco(target_coverage_weeks=target_coverage_weeks)
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # ── Stock Projection ────────────────────────────────────────────

    @app.post("/api/v1/stock-projection")
    def stock_projection(payload: dict) -> dict:
        """Project stock evolution for an article over a weekly horizon.

        Payload: { article, stock_initial, lot_eco, lot_optimal,
                   delai_reappro_jours, demande_hebdo, horizon_weeks? }
        """
        try:
            return app.state.gui_service.project_stock(
                article=payload["article"],
                stock_initial=float(payload.get("stock_initial", 0)),
                lot_eco=int(payload.get("lot_eco", 0)),
                lot_optimal=int(payload.get("lot_optimal", 0)),
                delai_reappro_jours=int(payload.get("delai_reappro_jours", 0)),
                demande_hebdo=float(payload.get("demande_hebdo", 0)),
                horizon_weeks=int(payload.get("horizon_weeks", 26)),
            )
        except KeyError as exc:
            raise HTTPException(status_code=400, detail=f"Missing field: {exc}") from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    # ── Tarifs achat ────────────────────────────────────────────────

    @app.get("/api/v1/tarifs/{article}")
    def get_tarifs(article: str) -> list[dict]:
        loader = app.state.gui_service.loader
        if loader is None:
            raise HTTPException(status_code=400, detail="Aucune donnee chargee")
        tarifs = loader.get_tarifs(article)
        return [
            {
                "code_fournisseur": t.code_fournisseur,
                "article": t.article,
                "quantite_mini": t.quantite_mini,
                "quantite_maxi": t.quantite_maxi,
                "prix_unitaire": t.prix_unitaire,
                "unite": t.unite,
                "devise": t.devise,
                "date_debut_validite": t.date_debut_validite.isoformat() if t.date_debut_validite else None,
                "date_fin_validite": t.date_fin_validite.isoformat() if t.date_fin_validite else None,
            }
            for t in tarifs
        ]

    app.include_router(x3_router)

    return app


app = create_app()
