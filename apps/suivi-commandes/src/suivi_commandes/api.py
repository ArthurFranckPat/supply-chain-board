from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from domain_contracts import ServiceHealth, SuiviAssignRequest, SuiviAssignResponse, SuiviLatestExportRequest
from suivi_commandes.data_loader import load_data, load_data_from_erp
from suivi_commandes.status_logic import assign_statuses, build_line_level_frame


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


def _compute_payload(df: pd.DataFrame, reference_date: date | None) -> SuiviAssignResponse:
    today = pd.Timestamp(reference_date) if reference_date else None
    with_status = assign_statuses(df, today=today)
    line_level = build_line_level_frame(df) if not df.empty else pd.DataFrame()

    status_counts = (
        with_status["Statut"].value_counts(dropna=False).to_dict()
        if "Statut" in with_status.columns
        else {}
    )

    return SuiviAssignResponse(
        total_rows=int(len(with_status)),
        status_counts={str(key): int(value) for key, value in status_counts.items()},
        rows=_jsonify_frame(with_status),
        line_level=_jsonify_frame(line_level),
    )


def create_app() -> FastAPI:
    api = FastAPI(
        title="Suivi Commandes API",
        version="0.1.0",
        description="API wrapper for order status assignment logic.",
    )

    api.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @api.get("/health", response_model=ServiceHealth, response_model_exclude_none=True)
    def health() -> ServiceHealth:
        return ServiceHealth(status="ok", service="suivi-commandes")

    @api.post("/api/v1/status/assign", response_model=SuiviAssignResponse)
    def assign_from_rows(payload: SuiviAssignRequest) -> SuiviAssignResponse:
        df = pd.DataFrame(payload.rows)
        df = _normalize_dates(df)
        return _compute_payload(df, payload.reference_date)

    @api.post("/api/v1/status/from-latest-export", response_model=SuiviAssignResponse)
    def assign_from_latest_export(payload: SuiviLatestExportRequest) -> SuiviAssignResponse:
        folder = Path(payload.folder) if payload.folder else None
        df = load_data(folder=folder)
        return _compute_payload(df, payload.reference_date)

    @api.post("/api/v1/status/from-erp-extractions", response_model=SuiviAssignResponse)
    def assign_from_erp_extractions(payload: SuiviLatestExportRequest) -> SuiviAssignResponse:
        folder = Path(payload.folder) if payload.folder else None
        df = load_data_from_erp(extractions_dir=folder)
        return _compute_payload(df, payload.reference_date)

    return api


app = create_app()
