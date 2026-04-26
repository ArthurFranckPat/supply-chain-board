from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from domain_contracts import (
    ServiceHealth,
    SuiviAssignRequest,
    SuiviAssignResponse,
    SuiviLatestExportRequest,
    RetardChargeItem,
    RetardChargeRequest,
    RetardChargeResponse,
    PaletteByDay,
    PaletteMoyenne,
    PaletteLigne,
    PaletteTotaux,
    PaletteRequest,
    PaletteResponse,
)
from suivi_commandes.data_loader import load_data, load_data_with_loader
from suivi_commandes.palette_calculator import compute_palette_summary
from suivi_commandes.retard_cause import enrich_retard_causes
from suivi_commandes.retard_charge import compute_retard_charge_by_poste
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


def _compute_payload(df: pd.DataFrame, reference_date: date | None, loader=None) -> SuiviAssignResponse:
    today = pd.Timestamp(reference_date) if reference_date else None
    with_status = assign_statuses(df, today=today)

    # Enrichir les lignes "Retard Prod" avec la cause
    if loader is not None and not with_status.empty:
        causes = enrich_retard_causes(with_status, loader)
        with_status["Cause retard"] = ""
        for idx, cause in causes.items():
            with_status.at[idx, "Cause retard"] = cause

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
        return _compute_payload(df, payload.reference_date, loader=None)

    @api.post("/api/v1/status/from-latest-export", response_model=SuiviAssignResponse)
    def assign_from_latest_export(payload: SuiviLatestExportRequest) -> SuiviAssignResponse:
        folder = Path(payload.folder) if payload.folder else None
        df, loader = load_data_with_loader(extractions_dir=folder)
        return _compute_payload(df, payload.reference_date, loader=loader)

    @api.post("/api/v1/retard-charge", response_model=RetardChargeResponse)
    def retard_charge(payload: RetardChargeRequest) -> RetardChargeResponse:
        folder = Path(payload.folder) if payload.folder else None
        df, loader = load_data_with_loader(extractions_dir=folder)
        today = pd.Timestamp(payload.reference_date) if payload.reference_date else None
        with_status = assign_statuses(df, today=today)
        charge_map = compute_retard_charge_by_poste(with_status, loader)
        items = [
            RetardChargeItem(
                poste=poste,
                libelle=str(info.get("libelle", "")),
                heures=round(float(info.get("heures", 0)), 2),
            )
            for poste, info in charge_map.items()
        ]
        total = sum(item.heures for item in items)
        return RetardChargeResponse(
            items=items,
            total_heures=round(total, 2),
        )

    @api.post("/api/v1/palettes", response_model=PaletteResponse)
    def palettes(payload: PaletteRequest) -> PaletteResponse:
        folder = Path(payload.folder) if payload.folder else None
        df, loader = load_data_with_loader(extractions_dir=folder)
        ref_date = payload.reference_date if payload.reference_date else None
        with_status = assign_statuses(df, today=pd.Timestamp(ref_date) if ref_date else None)
        result = compute_palette_summary(with_status, loader, reference_date=ref_date)
        lignes = [
            PaletteLigne(**l)
            for l in result["lignes"]
        ]
        by_day = [
            PaletteByDay(**d)
            for d in result["by_day"]
        ]
        moyenne = PaletteMoyenne(**result["moyenne"])
        totaux = PaletteTotaux(**result["totaux"])
        return PaletteResponse(
            lignes=lignes,
            by_day=by_day,
            moyenne=moyenne,
            totaux=totaux,
        )

    return api


app = create_app()
