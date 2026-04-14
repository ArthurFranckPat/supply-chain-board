from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field


class ServiceHealth(BaseModel):
    status: str = "ok"
    service: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class SuiviAssignRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)
    reference_date: date | None = None


class SuiviAssignResponse(BaseModel):
    total_rows: int
    status_counts: dict[str, int]
    rows: list[dict[str, Any]]
    line_level: list[dict[str, Any]]


class OrdoRunS1Request(BaseModel):
    source: str = "data"
    horizon: int = Field(default=7, ge=1, le=60)
    include_previsions: bool = False
    feasibility_mode: str = "projected"


class OrdoRunS1Response(BaseModel):
    run_id: str
    status: str
    summary: dict[str, Any] = Field(default_factory=dict)
    result: dict[str, Any] | None = None


class PipelineSupplyBoardRequest(BaseModel):
    source: str = "data"
    horizon: int = Field(default=7, ge=1, le=60)
    include_previsions: bool = False
    feasibility_mode: str = "projected"
    suivi_folder: str | None = None
    poll_interval_seconds: float = Field(default=1.0, ge=0.2, le=10.0)
    timeout_seconds: int = Field(default=120, ge=10, le=1800)


class PipelineSupplyBoardResponse(BaseModel):
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    ordo: dict[str, Any]
    suivi: dict[str, Any]
    board_summary: dict[str, Any]
