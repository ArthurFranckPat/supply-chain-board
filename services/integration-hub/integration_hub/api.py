from __future__ import annotations

import os
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any, TypeVar

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from domain_contracts import (
    BoardSummary,
    IntegrationHealthResponse,
    OrdoRunResponse,
    OrdoScheduleResponse,
    PipelineSupplyBoardRequest,
    PipelineSupplyBoardResponse,
    ServiceHealth,
    SuiviAssignResponse,
)
from integration_sdk import OrdoCoreClient, SuiviCommandesClient


ClientsFactory = Callable[[], tuple[OrdoCoreClient, SuiviCommandesClient]]
ModelT = TypeVar("ModelT", bound=BaseModel)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _make_clients() -> tuple[OrdoCoreClient, SuiviCommandesClient]:
    planning_url = os.getenv("PRODUCTION_PLANNING_API_URL", "http://127.0.0.1:8000")
    suivi_url = os.getenv("SUIVI_API_URL", "http://127.0.0.1:8001")
    return OrdoCoreClient(planning_url), SuiviCommandesClient(suivi_url)


def _coerce_model(model: type[ModelT], value: Any) -> ModelT:
    if isinstance(value, model):
        return value
    return model.model_validate(value)


async def _downstream_model(
    service: str,
    model: type[ModelT],
    call: Awaitable[Any],
) -> ModelT:
    try:
        return _coerce_model(model, await call)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"{service} call failed: {exc}") from exc


def _board_summary(
    ordo_result: OrdoRunResponse,
    suivi_result: SuiviAssignResponse,
) -> BoardSummary:
    return BoardSummary(
        ordo_taux_service=float(ordo_result.result.get("taux_service", 0)),
        ordo_unscheduled=len(ordo_result.result.get("unscheduled_rows", [])),
        suivi_retard_prod=suivi_result.status_counts.get("Retard Prod", 0),
        suivi_allocation_a_faire=suivi_result.status_counts.get("Allocation à faire", 0),
        suivi_total_rows=suivi_result.total_rows,
    )


def create_app(clients_factory: ClientsFactory = _make_clients) -> FastAPI:
    api = FastAPI(
        title="Supply Chain Integration Hub",
        version="0.1.0",
        description="Bridge service orchestrating independent monorepo apps.",
    )
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.get(
        "/health",
        response_model=IntegrationHealthResponse,
        response_model_exclude_none=True,
    )
    async def health() -> IntegrationHealthResponse:
        ordo_client, suivi_client = clients_factory()

        try:
            ordo_health = _coerce_model(ServiceHealth, await ordo_client.health())
        except Exception as exc:  # noqa: BLE001
            ordo_health = ServiceHealth(status="error", error=str(exc))

        try:
            suivi_health = _coerce_model(ServiceHealth, await suivi_client.health())
        except Exception as exc:  # noqa: BLE001
            suivi_health = ServiceHealth(status="error", error=str(exc))

        return IntegrationHealthResponse(
            timestamp=_utc_now(),
            downstream={
                "production-planning": ordo_health,
                "suivi-commandes": suivi_health,
            },
        )

    @api.post("/api/v1/pipeline/suivi-status", response_model=SuiviAssignResponse)
    async def run_suivi_status(request: PipelineSupplyBoardRequest) -> SuiviAssignResponse:
        _, suivi_client = clients_factory()
        return await _downstream_model(
            "suivi-commandes",
            SuiviAssignResponse,
            suivi_client.status_from_latest_export(folder=request.suivi_folder),
        )

    @api.post("/api/v1/pipeline/supply-board", response_model=PipelineSupplyBoardResponse)
    async def run_supply_board_pipeline(
        request: PipelineSupplyBoardRequest,
    ) -> PipelineSupplyBoardResponse:
        ordo_client, suivi_client = clients_factory()

        try:
            await ordo_client.load_data(source=request.source)
            ordo_run = _coerce_model(
                OrdoScheduleResponse,
                await ordo_client.run_schedule(
                    immediate_components=request.immediate_components,
                    blocking_components_mode=request.blocking_components_mode,
                    demand_horizon_days=request.demand_horizon_days,
                ),
            )
            ordo_result = _coerce_model(
                OrdoRunResponse,
                await ordo_client.wait_for_run(
                    run_id=ordo_run.run_id,
                    poll_interval_seconds=request.poll_interval_seconds,
                    timeout_seconds=request.timeout_seconds,
                ),
            )
        except TimeoutError as exc:
            raise HTTPException(status_code=504, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"production-planning call failed: {exc}") from exc

        suivi_result = await _downstream_model(
            "suivi-commandes",
            SuiviAssignResponse,
            suivi_client.status_from_latest_export(folder=request.suivi_folder),
        )

        return PipelineSupplyBoardResponse(
            timestamp=_utc_now(),
            ordo=ordo_result,
            suivi=suivi_result,
            board_summary=_board_summary(ordo_result, suivi_result),
        )

    return api


app = create_app()
