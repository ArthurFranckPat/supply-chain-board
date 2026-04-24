from __future__ import annotations

import sys
from pathlib import Path

# Ensure the src/ directory is on sys.path so the package is importable.
sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))

from datetime import date
from typing import Any

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from suivi_commandes.data_loader import load_data, load_data_from_erp
from suivi_commandes.db_comments import init_db, load_all_comments, batch_upsert, delete_comment
from suivi_commandes.status_logic import assign_statuses, build_line_level_frame


class StatusAssignRequest(BaseModel):
    rows: list[dict[str, Any]] = Field(default_factory=list)
    reference_date: date | None = None


class LatestExportRequest(BaseModel):
    folder: str | None = None
    reference_date: date | None = None


class CommentBatchRequest(BaseModel):
    rows: list[dict[str, str]] = Field(default_factory=list)


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "suivi-commandes"}


@app.post("/api/v1/status/assign")
def assign_from_rows(payload: StatusAssignRequest) -> dict[str, Any]:
    df = pd.DataFrame(payload.rows)
    df = _normalize_dates(df)
    return _compute_payload(df, payload.reference_date)


@app.post("/api/v1/status/from-latest-export")
def assign_from_latest_export(payload: LatestExportRequest) -> dict[str, Any]:
    folder = Path(payload.folder) if payload.folder else None
    df = load_data(folder=folder)
    return _compute_payload(df, payload.reference_date)


@app.post("/api/v1/status/from-erp-extractions")
def assign_from_erp_extractions(payload: LatestExportRequest) -> dict[str, Any]:
    folder = Path(payload.folder) if payload.folder else None
    df = load_data_from_erp(extractions_dir=folder)
    return _compute_payload(df, payload.reference_date)


# ── Comments ─────────────────────────────────────────────────────────────


@app.get("/api/v1/comments")
def get_comments() -> list[dict[str, Any]]:
    data = load_all_comments()
    return [
        {"no_commande": key[0], "article": key[1], **value}
        for key, value in data.items()
    ]


@app.put("/api/v1/comments/batch")
def save_comments_batch(payload: CommentBatchRequest) -> dict[str, str]:
    batch_upsert(payload.rows)
    return {"status": "ok"}


@app.delete("/api/v1/comments/{no_commande}/{article}")
def remove_comment(no_commande: str, article: str) -> dict[str, str]:
    delete_comment(no_commande, article)
    return {"status": "ok"}
