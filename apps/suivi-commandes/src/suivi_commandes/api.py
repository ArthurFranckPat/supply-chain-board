"""API layer — routes HTTP minces, délégation aux Application Services.

Ce fichier ne contient QUE :
- Configuration FastAPI / middleware
- Routage HTTP → services applicatifs
- Conversion DTOs applicatifs → Pydantic (domain_contracts)

Toute la logique métier / orchestration vit dans `application/`.
"""

from __future__ import annotations

import io

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

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
    ReportRequest,
    ReportPayloadResponse,
)

from suivi_commandes.application import (
    StatusService,
    RetardService,
    PaletteService,
    ReportService,
)
from suivi_commandes.infrastructure.adapters.reportlab_renderer import ReportlabRenderer


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

    @api.post("/api/v1/status/from-latest-export")
    def assign_from_latest_export(payload: SuiviLatestExportRequest):
        try:
            result = StatusService.assign_from_latest_export(
                folder=payload.folder,
                reference_date=payload.reference_date,
            )
        except FileNotFoundError as e:
            return JSONResponse(status_code=422, content={"detail": str(e)})
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

    @api.post("/api/v1/retard-charge")
    def retard_charge(payload: RetardChargeRequest):
        try:
            result = RetardService.compute(
                folder=payload.folder,
                reference_date=payload.reference_date,
            )
        except FileNotFoundError as e:
            return JSONResponse(status_code=422, content={"detail": str(e)})
        return RetardChargeResponse(
            items=[
                RetardChargeItem(poste=i.poste, libelle=i.libelle, heures=i.heures)
                for i in result.items
            ],
            total_heures=result.total_heures,
        )

    # ── Palettes ─────────────────────────────────────────────────────

    @api.post("/api/v1/palettes")
    def palettes(payload: PaletteRequest):
        try:
            result = PaletteService.compute(
                folder=payload.folder,
                reference_date=payload.reference_date,
            )
        except FileNotFoundError as e:
            return JSONResponse(status_code=422, content={"detail": str(e)})
        return PaletteResponse(
            lignes=[PaletteLigne(**{"num_commande": ligne.num_commande, "article": ligne.article, "nb_palettes": ligne.nb_palettes}) for ligne in result.lignes],
            by_day=[PaletteByDay(**{"jour": d.jour, "nb_palettes": d.nb_palettes, "nb_commandes": d.nb_commandes}) for d in result.by_day],
            moyenne=PaletteMoyenne(**{"palettes_par_jour": result.moyenne.palettes_par_jour, "palettes_par_commande": result.moyenne.palettes_par_commande}),
            totaux=PaletteTotaux(**{"total_palettes": result.totaux.total_palettes, "total_commandes": result.totaux.total_commandes}),
        )

    # ── Rapport suivi-commandes ──────────────────────────────────────

    def _serialize_payload(payload):
        from suivi_commandes.application.report_service import ReportPayload

        def row_to_dict(r):
            return {
                "num_commande": r.num_commande,
                "article": r.article,
                "designation": r.designation,
                "nom_client": r.nom_client,
                "type_commande": r.type_commande,
                "date_expedition": r.date_expedition,
                "date_liv_prevue": r.date_liv_prevue,
                "qte_commandee": r.qte_commandee,
                "qte_allouee": r.qte_allouee,
                "qte_restante": r.qte_restante,
                "besoin_net": r.besoin_net,
                "qte_allouee_virtuelle": r.qte_allouee_virtuelle,
                "emplacement": r.emplacement,
                "hum": r.hum,
                "zone_expedition": r.zone_expedition,
                "alerte_cq_statut": r.alerte_cq_statut,
                "jours_retard": r.jours_retard,
                "actions": [{"label": a.label, "severity": a.severity} for a in r.actions],
                "cause_type": r.cause_type,
                "cause_message": r.cause_message,
                "composants_manquants": r.composants_manquants,
            }

        return {
            "generated_at": payload.generated_at,
            "reference_date": payload.reference_date,
            "folder": payload.folder,
            "totals": payload.totals,
            "sections": {
                "a_expedier": [row_to_dict(r) for r in payload.sections.a_expedier],
                "allocation_a_faire": [row_to_dict(r) for r in payload.sections.allocation_a_faire],
                "retard_prod_groups": {
                    k: [row_to_dict(r) for r in v]
                    for k, v in payload.sections.retard_prod_groups.items()
                },
            },
            "charge_retard": [
                {"poste": c.poste, "libelle": c.libelle, "heures": c.heures}
                for c in payload.charge_retard
            ],
        }

    @api.post("/api/v1/reports/suivi-commandes")
    def report_suivi_commandes(payload: ReportRequest):
        ref_date_str = payload.reference_date.isoformat() if payload.reference_date else None
        try:
            report_payload = ReportService.build_payload(
                folder=payload.folder,
                reference_date=ref_date_str,
            )
        except FileNotFoundError as e:
            return JSONResponse(status_code=422, content={"detail": str(e)})

        if payload.format == "pdf":
            renderer = ReportlabRenderer()
            pdf_bytes = renderer.render(report_payload)
            filename = f"suivi-commandes-{report_payload.reference_date.isoformat()}.pdf"
            return StreamingResponse(
                io.BytesIO(pdf_bytes),
                media_type="application/pdf",
                headers={"Content-Disposition": f"attachment; filename={filename}"},
            )

        data = _serialize_payload(report_payload)
        return ReportPayloadResponse(**data)

    return api


app = create_app()
