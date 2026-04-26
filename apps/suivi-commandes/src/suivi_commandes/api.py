from __future__ import annotations

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

from suivi_commandes.data_loader import (
    load_order_lines,
    rows_to_order_lines,
)
from suivi_commandes.domain.status_assigner import assign_statuses, StatusAssignment
from suivi_commandes.domain.models import Status
from suivi_commandes.infrastructure.adapters.in_memory_stock import InMemoryStockProvider
from suivi_commandes.infrastructure.adapters import (
    DataReaderStockProvider,
    DataReaderBomNavigator,
    DataReaderOfMatcher,
    ProductionPlanningChargeAdapter,
    DataReaderPaletteInfoProvider,
)

from suivi_commandes.domain.retard_charge_calculator import compute_retard_charge
from suivi_commandes.domain.palette_calculator import compute_palette_summary


def _status_to_counts(assignments: list[StatusAssignment]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for a in assignments:
        counts[a.status.value] = counts.get(a.status.value, 0) + 1
    return counts


def _assignment_to_dict(a: StatusAssignment) -> dict[str, Any]:
    d = a.line.to_dict()
    d["Statut"] = a.status.value
    d["Besoin ligne"] = a.besoin_net
    d["Qté allouée virtuelle"] = a.qte_allouee_virtuelle
    d["_qte_allouee_virtuelle_stricte"] = a.qte_allouee_virtuelle_stricte
    d["_qte_allouee_virtuelle_cq"] = a.qte_allouee_virtuelle_cq
    d["_allocation_virtuelle_avec_cq"] = a.utilise_stock_sous_cq
    d["_alerte_cq_statut"] = a.alerte_cq_statut
    d["Marqueur CQ"] = "*" if a.alerte_cq_statut else ""
    d["Cause retard"] = a.cause.to_display_string() if a.cause else ""
    return d


def _compute_line_level(assignments: list[StatusAssignment]) -> list[dict[str, Any]]:
    """Vue line-level compatible avec l'ancien format."""
    result: list[dict[str, Any]] = []
    for a in assignments:
        result.append({
            "Article": a.line.article,
            "No commande": a.line.num_commande,
            "Date expedition": a.line.date_expedition.isoformat() if a.line.date_expedition else None,
            "Date liv prévue": a.line.date_liv_prevue.isoformat() if a.line.date_liv_prevue else None,
            "Besoin ligne": a.besoin_net,
            "Stock libre article": None,  # Calculé côté client ou via stock_provider si besoin
            "Qté allouée virtuelle": a.qte_allouee_virtuelle,
            "_qte_allouee_virtuelle_stricte": a.qte_allouee_virtuelle_stricte,
            "_qte_allouee_virtuelle_cq": a.qte_allouee_virtuelle_cq,
            "_allocation_virtuelle_avec_cq": a.utilise_stock_sous_cq,
            "_alerte_cq_statut": a.alerte_cq_statut,
            "_qte_allouee": a.line.qte_allouee,
            "_reliquat": a.line.qte_restante,
        })
    return result


def _compute_payload_from_assignments(assignments: list[StatusAssignment]) -> SuiviAssignResponse:
    rows = [_assignment_to_dict(a) for a in assignments]
    return SuiviAssignResponse(
        total_rows=len(assignments),
        status_counts=_status_to_counts(assignments),
        rows=rows,
        line_level=_compute_line_level(assignments),
    )


def create_app() -> FastAPI:
    api = FastAPI(
        title="Suivi Commandes API",
        version="0.2.0",
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
        lines = rows_to_order_lines(payload.rows)
        stock_provider = InMemoryStockProvider(payload.rows)
        ref_date = pd.Timestamp(payload.reference_date).date() if payload.reference_date else None
        assignments = assign_statuses(lines, stock_provider, reference_date=ref_date)
        return _compute_payload_from_assignments(assignments)

    @api.post("/api/v1/status/from-latest-export", response_model=SuiviAssignResponse)
    def assign_from_latest_export(payload: SuiviLatestExportRequest) -> SuiviAssignResponse:
        folder = Path(payload.folder) if payload.folder else None
        lines, loader = load_order_lines(extractions_dir=folder)
        stock_provider = DataReaderStockProvider(loader)
        ref_date = pd.Timestamp(payload.reference_date).date() if payload.reference_date else None
        assignments = assign_statuses(lines, stock_provider, reference_date=ref_date)

        # Enrichir les causes de retard via le domaine pur
        from suivi_commandes.domain.cause_analyzer import analyze_retard_cause

        of_matcher = DataReaderOfMatcher(loader)
        bom_navigator = DataReaderBomNavigator(loader)

        enriched: list[StatusAssignment] = []
        for assignment in assignments:
            if assignment.status == Status.RETARD_PROD:
                cause = analyze_retard_cause(
                    assignment.line, stock_provider, of_matcher, bom_navigator
                )
                enriched.append(
                    StatusAssignment(
                        line=assignment.line,
                        status=assignment.status,
                        besoin_net=assignment.besoin_net,
                        qte_allouee_virtuelle=assignment.qte_allouee_virtuelle,
                        qte_allouee_virtuelle_stricte=assignment.qte_allouee_virtuelle_stricte,
                        qte_allouee_virtuelle_cq=assignment.qte_allouee_virtuelle_cq,
                        utilise_stock_sous_cq=assignment.utilise_stock_sous_cq,
                        alerte_cq_statut=assignment.alerte_cq_statut,
                        cause=cause,
                    )
                )
            else:
                enriched.append(assignment)
        assignments = enriched

        return _compute_payload_from_assignments(assignments)

    # --- Legacy endpoints (still on DataFrame) ---

    @api.post("/api/v1/retard-charge", response_model=RetardChargeResponse)
    def retard_charge(payload: RetardChargeRequest) -> RetardChargeResponse:
        folder = Path(payload.folder) if payload.folder else None
        lines, loader = load_order_lines(extractions_dir=folder)
        stock_provider = DataReaderStockProvider(loader)
        ref_date = pd.Timestamp(payload.reference_date).date() if payload.reference_date else None
        assignments = assign_statuses(lines, stock_provider, reference_date=ref_date)

        bom_navigator = DataReaderBomNavigator(loader)
        charge_calculator = ProductionPlanningChargeAdapter(loader)
        charge_map = compute_retard_charge(assignments, bom_navigator, charge_calculator)

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
        lines, loader = load_order_lines(extractions_dir=folder)
        stock_provider = DataReaderStockProvider(loader)
        ref_date = payload.reference_date if payload.reference_date else None
        assignments = assign_statuses(lines, stock_provider, reference_date=ref_date)

        palette_provider = DataReaderPaletteInfoProvider(loader)
        result = compute_palette_summary(assignments, palette_provider, reference_date=ref_date)
        lignes = [PaletteLigne(**row) for row in result["lignes"]]
        by_day = [PaletteByDay(**d) for d in result["by_day"]]
        moyenne = PaletteMoyenne(**result["moyenne"])
        totaux = PaletteTotaux(**result["totaux"])
        return PaletteResponse(
            lignes=lignes,
            by_day=by_day,
            moyenne=moyenne,
            totaux=totaux,
        )

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
        lines, loader = load_order_lines(extractions_dir=Path(folder) if folder else None)
        stock_provider = DataReaderStockProvider(loader)
        of_matcher = DataReaderOfMatcher(loader)
        bom_navigator = DataReaderBomNavigator(loader)

        # Trouver la ligne correspondante
        line = next(
            (
                row for row in lines
                if row.num_commande == no_commande and row.article == article
            ),
            None,
        )
        if line is None:
            return StatusDetailResponse(no_commande=no_commande, article=article)

        # OF info — ne pas afficher si exécuté ou incompatible avec la date client
        of_info: dict[str, Any] | None = None
        of = of_matcher.find_matching_of(
            line.num_commande, line.article, line.type_commande
        )
        client_date = line.date_expedition
        # OF exécuté (manufacturing done) ou OF dont la date fin dépasse la date client
        of_incompatible = (
            of is not None
            and client_date is not None
            and of.date_fin is not None
            and of.date_fin > client_date
        )
        if of is not None and not of_incompatible:
            poste_charge = ""
            gamme = loader.get_gamme(of.article)
            if gamme and gamme.operations:
                poste_charge = gamme.operations[0].poste_charge
            of_info = {
                "num_of": of.num_of,
                "article": of.article,
                "qte_restante": of.qte_restante,
                "statut_num": of.statut_num,
                "statut_texte": _of_statut_texte(of.statut_num),
                "date_debut": of.date_debut.isoformat() if of.date_debut else None,
                "date_fin": of.date_fin.isoformat() if of.date_fin else None,
                "poste_charge": poste_charge,
            }

        # Composants bloquants
        qty_needed = max(float(line.qte_restante), 0.0)
        own_allocs = of_matcher.get_allocations(of.num_of) if of else {}
        shortages = bom_navigator.get_component_shortages(
            line.article, qty_needed, own_allocs
        )

        composants: list[dict[str, Any]] = []
        stock_composants: dict[str, dict[str, Any]] = {}

        for comp_article, manque in sorted(shortages.items()):
            comp_detail = stock_provider.get_stock_detail(comp_article)
            composants.append({
                "article": comp_article,
                "designation": comp_detail.designation,
                "qte_manquante": round(manque, 3),
            })
            stock_composants[comp_article] = {
                "stock_physique": comp_detail.stock_physique,
                "stock_sous_cq": comp_detail.stock_sous_cq,
                "disponible_total": comp_detail.disponible_total,
                "prochain_arrive": comp_detail.prochain_arrive,
                "qte_arrive": comp_detail.qte_arrive,
            }

        # Stock article — avec allocation depuis Allocations.csv pour cette commande
        stock_detail = stock_provider.get_stock_detail(article, no_commande)

        return StatusDetailResponse(
            no_commande=no_commande,
            article=article,
            of_info=of_info,
            composants=composants,
            stock_detail={
                "stock_physique": stock_detail.stock_physique,
                "stock_sous_cq": stock_detail.stock_sous_cq,
                "stock_alloue": stock_detail.stock_alloue,
                "disponible_total": stock_detail.disponible_total,
                "disponible_strict": stock_detail.disponible_strict,
                "prochain_arrive": stock_detail.prochain_arrive,
                "qte_arrive": stock_detail.qte_arrive,
            },
            stock_composants=stock_composants,
        )

    return api


def _of_statut_texte(statut_num: int) -> str:
    mapping = {1: "ferme", 2: "planifié", 3: "suggéré"}
    return mapping.get(statut_num, f"Statut {statut_num}")


app = create_app()
