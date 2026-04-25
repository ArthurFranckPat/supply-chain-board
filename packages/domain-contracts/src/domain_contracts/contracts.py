from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ExtensibleModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class ServiceHealth(ExtensibleModel):
    status: str = "ok"
    service: str | None = None
    timestamp: datetime | None = None


class IntegrationHealthResponse(BaseModel):
    status: str = "ok"
    service: str = "integration-hub"
    timestamp: datetime = Field(default_factory=_utc_now)
    downstream: dict[str, ServiceHealth]


class SuiviAssignRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)
    reference_date: date | None = None


class SuiviLatestExportRequest(BaseModel):
    folder: str | None = None
    reference_date: date | None = None


class SuiviAssignResponse(ExtensibleModel):
    total_rows: int
    status_counts: dict[str, int]
    rows: list[dict[str, Any]]
    line_level: list[dict[str, Any]]


class OrdoLoadDataRequest(BaseModel):
    source: str = "data"


class OrdoLoadDataResponse(ExtensibleModel):
    status: str | None = None


class OrdoScheduleRequest(BaseModel):
    immediate_components: bool = False
    blocking_components_mode: str = "blocked"
    demand_horizon_days: int = Field(default=15, ge=7, le=60)


class OrdoScheduleResponse(ExtensibleModel):
    run_id: str


class OrdoRunResponse(ExtensibleModel):
    status: str
    result: dict[str, Any] = Field(default_factory=dict)


class BoardSummary(BaseModel):
    ordo_taux_service: float
    ordo_unscheduled: int
    suivi_retard_prod: int
    suivi_allocation_a_faire: int
    suivi_total_rows: int


class PipelineSupplyBoardRequest(BaseModel):
    source: str = "data"
    demand_horizon_days: int = Field(default=15, ge=7, le=60)
    immediate_components: bool = False
    blocking_components_mode: str = "blocked"
    suivi_folder: str | None = None
    poll_interval_seconds: float = Field(default=1.0, ge=0.2, le=10.0)
    timeout_seconds: int = Field(default=120, ge=10, le=1800)


class PipelineSupplyBoardResponse(BaseModel):
    timestamp: datetime = Field(default_factory=_utc_now)
    ordo: OrdoRunResponse
    suivi: SuiviAssignResponse
    board_summary: BoardSummary
