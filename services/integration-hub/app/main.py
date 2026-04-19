from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from domain_contracts import PipelineSupplyBoardRequest, PipelineSupplyBoardResponse
from integration_sdk import OrdoCoreClient, SuiviCommandesClient


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _make_clients() -> tuple[OrdoCoreClient, SuiviCommandesClient]:
    ordo_url = os.getenv("ORDO_CORE_API_URL", "http://127.0.0.1:8000")
    suivi_url = os.getenv("SUIVI_API_URL", "http://127.0.0.1:8001")
    return OrdoCoreClient(ordo_url), SuiviCommandesClient(suivi_url)


app = FastAPI(
    title="Supply Chain Integration Hub",
    version="0.1.0",
    description="Bridge service orchestrating independent monorepo apps.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    ordo_client, suivi_client = _make_clients()
    try:
        ordo_health = await ordo_client.health()
    except Exception as exc:  # noqa: BLE001
        ordo_health = {"status": "error", "error": str(exc)}

    try:
        suivi_health = await suivi_client.health()
    except Exception as exc:  # noqa: BLE001
        suivi_health = {"status": "error", "error": str(exc)}

    return {
        "status": "ok",
        "service": "integration-hub",
        "timestamp": _utc_now().isoformat(),
        "downstream": {
            "ordo-core": ordo_health,
            "suivi-commandes": suivi_health,
        },
    }


@app.post("/v1/pipeline/suivi-status")
async def run_suivi_status(request: PipelineSupplyBoardRequest) -> dict[str, Any]:
    _, suivi_client = _make_clients()
    try:
        return await suivi_client.status_from_latest_export(folder=request.suivi_folder)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"suivi-commandes call failed: {exc}") from exc


@app.post("/v1/pipeline/supply-board")
async def run_supply_board_pipeline(
    request: PipelineSupplyBoardRequest,
) -> PipelineSupplyBoardResponse:
    ordo_client, suivi_client = _make_clients()

    try:
        await ordo_client.load_data(source=request.source)
        ordo_run = await ordo_client.run_schedule(
            immediate_components=request.immediate_components,
            blocking_components_mode=request.blocking_components_mode,
            demand_horizon_days=request.demand_horizon_days,
        )
        run_id = ordo_run["run_id"]
        ordo_result = await ordo_client.wait_for_run(
            run_id=run_id,
            poll_interval_seconds=request.poll_interval_seconds,
            timeout_seconds=request.timeout_seconds,
        )
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"ordo-core call failed: {exc}") from exc

    try:
        suivi_result = await suivi_client.status_from_latest_export(folder=request.suivi_folder)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"suivi-commandes call failed: {exc}") from exc

    summary = {
        "ordo_taux_service": (
            ordo_result.get("result", {}).get("taux_service", 0)
        ),
        "ordo_unscheduled": len(
            ordo_result.get("result", {}).get("unscheduled_rows", [])
        ),
        "suivi_retard_prod": suivi_result.get("status_counts", {}).get("Retard Prod", 0),
        "suivi_allocation_a_faire": suivi_result.get("status_counts", {}).get("Allocation à faire", 0),
        "suivi_total_rows": suivi_result.get("total_rows", 0),
    }

    return PipelineSupplyBoardResponse(
        timestamp=_utc_now(),
        ordo=ordo_result,
        suivi=suivi_result,
        board_summary=summary,
    )
