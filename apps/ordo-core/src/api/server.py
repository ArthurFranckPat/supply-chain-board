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


class RunS1Request(BaseModel):
    horizon: int = Field(default=7, ge=1, le=60)
    include_previsions: bool = False
    feasibility_mode: str = Field(default="projected")


class RunScheduleRequest(BaseModel):
    immediate_components: bool = False
    blocking_components_mode: str = Field(default="blocked", pattern="^(blocked|direct|both)$")
    demand_horizon_days: int = Field(default=15, ge=7, le=60)


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

    @app.post("/runs/s1")
    def run_s1(payload: RunS1Request) -> dict:
        try:
            return app.state.gui_service.run_s1(
                horizon=payload.horizon,
                include_previsions=payload.include_previsions,
                feasibility_mode=payload.feasibility_mode,
            )
        except RuntimeError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

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

    @app.get("/reports/s1/latest")
    def latest_s1_report() -> dict:
        return app.state.gui_service.get_latest_report("s1")

    @app.get("/reports/files")
    def list_reports() -> list[dict]:
        return app.state.gui_service.list_reports()

    return app


app = create_app()
