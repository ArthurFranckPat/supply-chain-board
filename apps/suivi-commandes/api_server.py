from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel, Field

from data_loader import load_data
from status_logic import assign_statuses, build_line_level_frame


class StatusAssignRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)
    reference_date: date | None = None


class LatestExportRequest(BaseModel):
    folder: str | None = None
    reference_date: date | None = None


def _normalize_dates(frame: pd.DataFrame) -> pd.DataFrame:
    work = frame.copy()
    for column in ["Date expedition", "Date mise en stock", "Date liv prévue", "Date liv prÃ©vue"]:
        if column in work.columns:
            work[column] = pd.to_datetime(work[column], errors="coerce")
    return work


def _jsonify_frame(frame: pd.DataFrame) -> list[dict[str, Any]]:
    if frame.empty:
        return []
    clean = frame.copy()
    for column in clean.columns:
        if pd.api.types.is_datetime64_any_dtype(clean[column]):
            clean[column] = clean[column].dt.strftime("%Y-%m-%d")
    clean = clean.where(pd.notna(clean), None)
    return clean.to_dict(orient="records")


def _compute_payload(df: pd.DataFrame, reference_date: date | None) -> dict[str, Any]:
    today = pd.Timestamp(reference_date) if reference_date else None
    with_status = assign_statuses(df, today=today)
    line_level = build_line_level_frame(df)

    status_counts = (
        with_status["Statut"].value_counts(dropna=False).to_dict()
        if "Statut" in with_status.columns
        else {}
    )

    return {
        "total_rows": int(len(with_status)),
        "status_counts": {str(key): int(value) for key, value in status_counts.items()},
        "rows": _jsonify_frame(with_status),
        "line_level": _jsonify_frame(line_level),
    }


app = FastAPI(
    title="Suivi Commandes API",
    version="0.1.0",
    description="API wrapper for order status assignment logic.",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "suivi-commandes"}


@app.post("/v1/status/assign")
def assign_from_rows(payload: StatusAssignRequest) -> dict[str, Any]:
    df = pd.DataFrame(payload.rows)
    df = _normalize_dates(df)
    return _compute_payload(df, payload.reference_date)


@app.post("/v1/status/from-latest-export")
def assign_from_latest_export(payload: LatestExportRequest) -> dict[str, Any]:
    folder = Path(payload.folder) if payload.folder else None
    df = load_data(folder=folder)
    return _compute_payload(df, payload.reference_date)
