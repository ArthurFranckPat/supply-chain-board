"""FastAPI server for the local GUI."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ..app import GuiAppService


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

    return app


app = create_app()
