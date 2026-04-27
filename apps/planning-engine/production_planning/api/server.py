"""FastAPI server for the local GUI."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, APIRouter, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..app import GuiAppService
from .x3_routes import router as x3_router


# ── Request models ───────────────────────────────────────────────

class DataLoadRequest(BaseModel):
    source: str = Field(default="extractions")
    extractions_dir: Optional[str] = None


class RunScheduleRequest(BaseModel):
    immediate_components: bool = False
    blocking_components_mode: str = Field(default="blocked", pattern="^(blocked|direct|both)$")
    demand_horizon_days: int = Field(default=15, ge=7, le=60)
    algorithm: str = Field(default="greedy", pattern="^(greedy|ga)$")
    ga_random_seed: Optional[int] = None
    ga_config_overrides: Optional[dict] = None


class CalendarManualOffRequest(BaseModel):
    year: int
    additions: list[dict] = Field(default_factory=list)
    removals: list[str] = Field(default_factory=list)


class HolidaysRefreshRequest(BaseModel):
    year: int


class PosteCapacityUpdate(BaseModel):
    poste: str
    default_hours: float
    shift_pattern: str = Field(default="1x8", pattern="^(1x8|2x8|3x8)$")
    label: str = ""


class CapacityOverrideRequest(BaseModel):
    poste: str
    key: str
    hours: float = 0.0
    reason: str = ""
    pattern: Optional[dict[str, float]] = None


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
    desired_date: str
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
    new_date: str
    new_quantity: Optional[int] = None
    depth_mode: str = Field(default="full", pattern="^(level1|full)$")
    use_receptions: bool = True


class StockEvolutionRequest(BaseModel):
    itmref: str
    horizon_days: int = Field(default=45, ge=1, le=365)
    include_internal: bool = Field(default=False)
    include_stock_q: bool = Field(default=False)


class StockProjectionRequest(BaseModel):
    article: str
    stock_initial: float = Field(default=0.0)
    lot_eco: int = Field(default=0, ge=0)
    lot_optimal: int = Field(default=0, ge=0)
    delai_reappro_jours: int = Field(default=0, ge=0)
    demande_hebdo: float = Field(default=0.0)
    horizon_weeks: int = Field(default=26, ge=4, le=104)


# ── Helper ───────────────────────────────────────────────────────

def _svc(request: Request) -> GuiAppService:
    return request.app.state.gui_service


# ── V1 Router ────────────────────────────────────────────────────

v1 = APIRouter(prefix="/api/v1")


@v1.get("/config")
def get_config(request: Request) -> dict:
    return _svc(request).get_config()


@v1.post("/data/load")
def load_data(payload: DataLoadRequest, request: Request) -> dict:
    return _svc(request).load_data(
        source=payload.source,
        extractions_dir=payload.extractions_dir,
    )


@v1.post("/runs/schedule")
def run_schedule(payload: RunScheduleRequest, request: Request) -> dict:
    return _svc(request).run_schedule(
        immediate_components=payload.immediate_components,
        blocking_components_mode=payload.blocking_components_mode,
        demand_horizon_days=payload.demand_horizon_days,
        algorithm=payload.algorithm,
        ga_random_seed=payload.ga_random_seed,
        ga_config_overrides=payload.ga_config_overrides,
    )


@v1.post("/runs/compare")
def run_compare(payload: RunScheduleRequest, request: Request) -> dict:
    """Lance les deux algorithmes (glouton + AG) et retourne la comparaison.

    Le glouton est toujours lancé. L'AG est lancé en parallèle si demandé.
    """
    return _svc(request).run_compare(
        immediate_components=payload.immediate_components,
        blocking_components_mode=payload.blocking_components_mode,
        demand_horizon_days=payload.demand_horizon_days,
        ga_random_seed=payload.ga_random_seed,
        ga_config_overrides=payload.ga_config_overrides,
    )


@v1.get("/runs/{run_id}")
def get_run(run_id: str, request: Request) -> dict:
    run = _svc(request).get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run introuvable")
    return run


@v1.get("/reports/actions/latest")
def latest_action_report(request: Request) -> dict:
    return _svc(request).get_latest_report("actions")


@v1.get("/reports/files")
def list_reports(request: Request) -> list[dict]:
    return _svc(request).list_reports()


# ── Calendar ──────────────────────────────────────────────────────

@v1.get("/calendar/{year}/{month}")
def get_calendar(year: int, month: int, request: Request) -> dict:
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1-12")
    return _svc(request).get_calendar(year, month)


@v1.put("/calendar/manual-off")
def update_manual_off(payload: CalendarManualOffRequest, request: Request) -> dict:
    return _svc(request).update_manual_off_days(
        year=payload.year,
        additions=payload.additions,
        removals=payload.removals,
    )


@v1.post("/calendar/holidays/refresh")
def refresh_holidays(payload: HolidaysRefreshRequest, request: Request) -> dict:
    return _svc(request).refresh_holidays(payload.year)


# ── Capacity ──────────────────────────────────────────────────────

@v1.get("/capacity")
def get_capacity(request: Request) -> dict:
    return _svc(request).get_capacity_config()


@v1.put("/capacity/poste")
def update_poste_capacity(payload: PosteCapacityUpdate, request: Request) -> dict:
    return _svc(request).update_poste_capacity(
        poste=payload.poste,
        default_hours=payload.default_hours,
        shift_pattern=payload.shift_pattern,
        label=payload.label,
    )


@v1.put("/capacity/override")
def set_capacity_override(payload: CapacityOverrideRequest, request: Request) -> dict:
    return _svc(request).set_capacity_override(
        poste=payload.poste,
        key=payload.key,
        hours=payload.hours,
        reason=payload.reason,
        pattern=payload.pattern,
    )


@v1.delete("/capacity/override")
def remove_capacity_override(payload: CapacityOverrideRequest, request: Request) -> dict:
    return _svc(request).remove_capacity_override(
        poste=payload.poste,
        key=payload.key,
    )


# ── Analyse de Rupture ────────────────────────────────────────────

@v1.post("/analyse-rupture")
def analyser_rupture(payload: AnalyseRuptureRequest, request: Request) -> dict:
    if not payload.component_code:
        raise HTTPException(status_code=400, detail="component_code requis")
    return _svc(request).analyser_rupture(
        payload.component_code,
        include_previsions=payload.include_previsions,
        include_receptions=payload.include_receptions,
        use_pool=payload.use_pool,
        merge_branches=payload.merge_branches,
        include_sf=payload.include_sf,
        include_pf=payload.include_pf,
    )


# ── EOL Residual Stock Analysis ──────────────────────────────────

@v1.post("/eol-residuals")
def eol_residuals(payload: EolResidualsRequest, request: Request) -> dict:
    return _svc(request).eol_residuals_analyze(
        familles=payload.familles,
        prefixes=payload.prefixes,
        bom_depth_mode=payload.bom_depth_mode,
        stock_mode=payload.stock_mode,
        component_types=payload.component_types,
        projection_date=payload.projection_date,
    )


@v1.post("/eol-residuals/fabricable")
def eol_residuals_fabricable(payload: ResidualFabRequest, request: Request) -> list[dict]:
    return _svc(request).eol_residuals_fab_check(
        familles=payload.familles,
        prefixes=payload.prefixes,
        desired_qty=payload.desired_qty,
        bom_depth_mode=payload.bom_depth_mode,
        stock_mode=payload.stock_mode,
        projection_date=payload.projection_date,
    )


# ── Feasibility ───────────────────────────────────────────────────

@v1.post("/feasibility/check")
def feasibility_check(payload: FeasibilityCheckRequest, request: Request) -> dict:
    return _svc(request).feasibility_check(
        article=payload.article,
        quantity=payload.quantity,
        desired_date=payload.desired_date,
        use_receptions=payload.use_receptions,
        check_capacity=payload.check_capacity,
        depth_mode=payload.depth_mode,
    )


@v1.post("/feasibility/promise-date")
def feasibility_promise_date(payload: PromiseDateRequest, request: Request) -> dict:
    return _svc(request).feasibility_promise_date(
        article=payload.article,
        quantity=payload.quantity,
        max_horizon_days=payload.max_horizon_days,
    )


@v1.post("/feasibility/reschedule")
def feasibility_reschedule(payload: RescheduleRequest, request: Request) -> dict:
    return _svc(request).feasibility_reschedule(
        num_commande=payload.num_commande,
        article=payload.article,
        new_date=payload.new_date,
        new_quantity=payload.new_quantity,
        depth_mode=payload.depth_mode,
        use_receptions=payload.use_receptions,
    )


@v1.get("/feasibility/articles")
def feasibility_search_articles(q: str = "", limit: int = 20, request: Request = None) -> dict:
    results = _svc(request).feasibility_search_articles(q, limit)
    return {"articles": results}


@v1.get("/feasibility/orders")
def feasibility_search_orders(q: str = "", limit: int = 30, request: Request = None) -> dict:
    results = _svc(request).feasibility_search_orders(q, limit)
    return {"orders": results}


# ── Stock Evolution ───────────────────────────────────────────────

@v1.get("/stock-evolution/{itmref}")
def stock_evolution(itmref: str, horizon_days: int = 45, include_internal: bool = False, include_stock_q: bool = False, request: Request = None) -> dict:
    return _svc(request).analyser_evolution_stock(
        itmref=itmref,
        horizon_days=horizon_days,
        include_internal=include_internal,
        include_stock_q=include_stock_q,
    )


@v1.get("/stock-evolution/{itmref}/chart")
def stock_evolution_chart(itmref: str, horizon_days: int = 45, include_internal: bool = False, include_stock_q: bool = False, request: Request = None) -> dict:
    result = _svc(request).analyser_evolution_stock(
        itmref=itmref,
        horizon_days=horizon_days,
        include_internal=include_internal,
        include_stock_q=include_stock_q,
    )
    items = result.get("items", [])
    return {
        "article": itmref,
        "dates": [m["iptdat"] for m in items],
        "stocks": [m["stock_apres"] for m in items],
        "qtystu": [m["qtystu"] for m in items],
        "trstyp": [m["trstyp"] for m in items],
        "vcrnum": [m["vcrnum"] for m in items],
        "stats": {k: v for k, v in result.items() if k not in ("items", "article")},
    }


@v1.post("/stock-evolution/analytics")
def stock_evolution_analytics(payload: StockEvolutionRequest, request: Request) -> dict:
    return _svc(request).analyser_evolution_stock(
        itmref=payload.itmref,
        horizon_days=payload.horizon_days,
        include_internal=payload.include_internal,
        include_stock_q=payload.include_stock_q,
    )


# ── Analyse Lot Eco ─────────────────────────────────────────────

@v1.post("/analyse-lot-eco")
def analyse_lot_eco(
    target_coverage_weeks: float = Query(default=4.0, ge=0.5, le=52.0),
    demand_horizon_weeks: float = Query(default=52.0, ge=4.0, le=104.0),
    request: Request = None,
) -> dict:
    return _svc(request).analyser_lot_eco(
        target_coverage_weeks=target_coverage_weeks,
        demand_horizon_weeks=demand_horizon_weeks,
    )


# ── Stock Projection ────────────────────────────────────────────

@v1.post("/stock-projection")
def stock_projection(payload: StockProjectionRequest, request: Request) -> dict:
    return _svc(request).project_stock(
        article=payload.article,
        stock_initial=payload.stock_initial,
        lot_eco=payload.lot_eco,
        lot_optimal=payload.lot_optimal,
        delai_reappro_jours=payload.delai_reappro_jours,
        demande_hebdo=payload.demande_hebdo,
        horizon_weeks=payload.horizon_weeks,
    )


# ── Tarifs achat ────────────────────────────────────────────────

@v1.get("/tarifs/{article}")
def get_tarifs(article: str, request: Request) -> list[dict]:
    loader = _svc(request).loader
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


# ── App factory ───────────────────────────────────────────────────

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

    @app.exception_handler(ValueError)
    async def value_error_handler(_request: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(RuntimeError)
    async def runtime_error_handler(_request: Request, exc: RuntimeError) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": str(exc)})

    @app.exception_handler(FileNotFoundError)
    async def file_not_found_handler(_request: Request, exc: FileNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    app.include_router(v1)
    app.include_router(x3_router)

    return app


app = create_app()
