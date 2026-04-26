"""API layer — routes HTTP minces, délégation aux Application Services.

Ce fichier ne contient QUE :
- Configuration FastAPI / middleware
- Routage HTTP → services applicatifs
- Conversion DTOs applicatifs → Pydantic (domain_contracts)

Toute la logique métier / orchestration vit dans `application/`.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from domain_contracts import (
    ServiceHealth,
    SuiviAssignRequest,
    SuiviAssignResponse,
    SuiviLatestExportRequest,
    StatusDetailResponse,
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

from suivi_commandes.application import (
    StatusService,
    RetardService,
    PaletteService,
)


def create_app() -> FastAPI:
    api = FastAPI(
        title="Suivi Commandes API",
        version="0.3.0",
        description="API wrapper for order status assignment logic.",
    )

    api.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Health ────────────────────────────────────────────────────────

    @api.get("/health", response_model=ServiceHealth, response_model_exclude_none=True)
    def health() -> ServiceHealth:
        return ServiceHealth(status="ok", service="suivi-commandes")

    # ── Status / Assign ──────────────────────────────────────────────

    @api.post("/api/v1/status/assign", response_model=SuiviAssignResponse)
    def assign_from_rows(payload: SuiviAssignRequest) -> SuiviAssignResponse:
        result = StatusService.assign_from_rows(
            rows=payload.rows,
            reference_date=payload.reference_date,
        )
        return SuiviAssignResponse(
            total_rows=result.total_rows,
            status_counts=result.status_counts,
            rows=result.rows,
            line_level=result.line_level,
        )

    @api.post("/api/v1/status/from-latest-export", response_model=SuiviAssignResponse)
    def assign_from_latest_export(payload: SuiviLatestExportRequest) -> SuiviAssignResponse:
        result = StatusService.assign_from_latest_export(
            folder=payload.folder,
            reference_date=payload.reference_date,
        )
        return SuiviAssignResponse(
            total_rows=result.total_rows,
            status_counts=result.status_counts,
            rows=result.rows,
            line_level=result.line_level,
        )

    # ── Status / Detail ──────────────────────────────────────────────

    @api.get(
        "/api/v1/status/detail/{no_commande}/{article}",
        response_model=StatusDetailResponse,
        response_model_exclude_none=True,
    )
    def status_detail(
        no_commande: str,
        article: str,
        folder: str | None = None,
    ) -> StatusDetailResponse:
        result = StatusService.get_detail(no_commande, article, folder)
        return StatusDetailResponse(
            no_commande=result.no_commande,
            article=result.article,
            of_info=result.of_info,
            composants=result.composants or [],
            stock_detail=result.stock_detail or {},
            stock_composants=result.stock_composants or {},
        )

    # ── Retard charge ────────────────────────────────────────────────

    @api.post("/api/v1/retard-charge", response_model=RetardChargeResponse)
    def retard_charge(payload: RetardChargeRequest) -> RetardChargeResponse:
        result = RetardService.compute(
            folder=payload.folder,
            reference_date=payload.reference_date,
        )
        return RetardChargeResponse(
            items=[
                RetardChargeItem(poste=i.poste, libelle=i.libelle, heures=i.heures)
                for i in result.items
            ],
            total_heures=result.total_heures,
        )

    # ── Palettes ─────────────────────────────────────────────────────

    @api.post("/api/v1/palettes", response_model=PaletteResponse)
    def palettes(payload: PaletteRequest) -> PaletteResponse:
        result = PaletteService.compute(
            folder=payload.folder,
            reference_date=payload.reference_date,
        )
        return PaletteResponse(
            lignes=[PaletteLigne(**{"num_commande": ligne.num_commande, "article": ligne.article, "nb_palettes": ligne.nb_palettes}) for ligne in result.lignes],
            by_day=[PaletteByDay(**{"jour": d.jour, "nb_palettes": d.nb_palettes, "nb_commandes": d.nb_commandes}) for d in result.by_day],
            moyenne=PaletteMoyenne(**{"palettes_par_jour": result.moyenne.palettes_par_jour, "palettes_par_commande": result.moyenne.palettes_par_commande}),
            totaux=PaletteTotaux(**{"total_palettes": result.totaux.total_palettes, "total_commandes": result.totaux.total_commandes}),
        )

    return api


app = create_app()
