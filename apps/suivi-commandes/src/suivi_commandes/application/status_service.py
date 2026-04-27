"""Application service pour les opérations de statut / suivi commandes.

Orchestre les ports du domaine pour :
- assigner les statuts aux lignes de commande
- enrichir les retards avec les causes racines
- fournir le détail OF / composants / stock d'une ligne
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from suivi_commandes.data_loader import load_order_lines, rows_to_order_lines
from suivi_commandes.domain.cause_analyzer import analyze_retard_cause
from suivi_commandes.domain.models import Status
from suivi_commandes.domain.status_assigner import StatusAssignment, assign_statuses
from suivi_commandes.infrastructure.adapters.in_memory_stock import InMemoryStockProvider

from .composition import ErpContext


# ── DTOs de réponse ──────────────────────────────────────────────────


@dataclass(frozen=True)
class SuiviCounts:
    status_counts: dict[str, int]


@dataclass(frozen=True)
class SuiviAssignResult:
    total_rows: int
    status_counts: dict[str, int]
    rows: list[dict[str, Any]]
    line_level: list[dict[str, Any]]


@dataclass(frozen=True)
class StatusDetailResult:
    no_commande: str
    article: str
    of_info: dict[str, Any] | None = None
    composants: list[dict[str, Any]] | None = None
    stock_detail: dict[str, Any] | None = None
    stock_composants: dict[str, dict[str, Any]] | None = None


# ── Helpers de sérialisation ─────────────────────────────────────────


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
    result: list[dict[str, Any]] = []
    for a in assignments:
        result.append({
            "Article": a.line.article,
            "No commande": a.line.num_commande,
            "Date expedition": a.line.date_expedition.isoformat() if a.line.date_expedition else None,
            "Date liv prévue": a.line.date_liv_prevue.isoformat() if a.line.date_liv_prevue else None,
            "Besoin ligne": a.besoin_net,
            "Stock libre article": None,
            "Qté allouée virtuelle": a.qte_allouee_virtuelle,
            "_qte_allouee_virtuelle_stricte": a.qte_allouee_virtuelle_stricte,
            "_qte_allouee_virtuelle_cq": a.qte_allouee_virtuelle_cq,
            "_allocation_virtuelle_avec_cq": a.utilise_stock_sous_cq,
            "_alerte_cq_statut": a.alerte_cq_statut,
            "_qte_allouee": a.line.qte_allouee,
            "_reliquat": a.line.qte_restante,
        })
    return result


def _to_payload(assignments: list[StatusAssignment]) -> SuiviAssignResult:
    return SuiviAssignResult(
        total_rows=len(assignments),
        status_counts=_status_to_counts(assignments),
        rows=[_assignment_to_dict(a) for a in assignments],
        line_level=_compute_line_level(assignments),
    )


# ── StatusService ────────────────────────────────────────────────────


class StatusService:
    """Cas d'usage métier autour des statuts de commande."""

    @staticmethod
    def assign_from_rows(rows: list[dict], reference_date: str | None = None) -> SuiviAssignResult:
        """Endpoint /status/assign — sans ERP, InMemory stock."""
        lines = rows_to_order_lines(rows)
        stock_provider = InMemoryStockProvider(rows)
        ref_date = pd.Timestamp(reference_date).date() if reference_date else None
        assignments = assign_statuses(lines, stock_provider, reference_date=ref_date)
        return _to_payload(assignments)

    @staticmethod
    def get_enriched_assignments(
        folder: str | None = None,
        reference_date: str | None = None,
    ) -> list[StatusAssignment]:
        """Retourne les assignments enrichis avec causes (usage interne applicatif)."""
        from suivi_commandes.application.composition import ErpContext

        lines, loader = load_order_lines(extractions_dir=folder)
        ctx = ErpContext.from_loader(loader)
        stock_provider = ctx.stock_provider
        ref_date = pd.Timestamp(reference_date).date() if reference_date else None
        assignments = assign_statuses(lines, stock_provider, reference_date=ref_date)

        enriched = []
        for assignment in assignments:
            if assignment.status == Status.RETARD_PROD:
                cause = analyze_retard_cause(
                    assignment.line,
                    stock_provider,
                    ctx.of_matcher,
                    ctx.bom_navigator,
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
        return enriched

    @staticmethod
    def assign_from_latest_export(
        folder: str | None = None,
        reference_date: str | None = None,
    ) -> SuiviAssignResult:
        """Endpoint /status/from-latest-export — avec ERP + enrichissement causes."""
        assignments = StatusService.get_enriched_assignments(folder, reference_date)
        return _to_payload(assignments)

    @staticmethod
    def get_detail(
        no_commande: str,
        article: str,
        folder: str | None = None,
    ) -> StatusDetailResult:
        """Endpoint GET /status/detail/{no_commande}/{article}."""
        lines, loader = load_order_lines(extractions_dir=folder)
        ctx = ErpContext.from_loader(loader)

        # Trouver la ligne correspondante
        line = next(
            (row for row in lines if row.num_commande == no_commande and row.article == article),
            None,
        )
        if line is None:
            return StatusDetailResult(no_commande=no_commande, article=article)

        # ── OF info ──
        of_info = _build_of_info(line, ctx)

        # ── Composants bloquants ──
        composants, stock_composants = _build_composants(line, ctx)

        # ── Stock article ──
        stock_detail = ctx.stock_provider.get_stock_detail(article, no_commande)

        return StatusDetailResult(
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


# ── Helpers internes ─────────────────────────────────────────────────


def _of_statut_texte(statut_num: int) -> str:
    mapping = {1: "ferme", 2: "planifié", 3: "suggéré"}
    return mapping.get(statut_num, f"Statut {statut_num}")


def _build_of_info(line, ctx: ErpContext) -> dict[str, Any] | None:
    """Construit le dictionnaire OFInfo ou None si inexistant/incompatible."""
    of = ctx.of_matcher.find_matching_of(line.num_commande, line.article, line.type_commande)
    if of is None:
        return None

    client_date = line.date_expedition
    of_incompatible = (
        client_date is not None
        and of.date_fin is not None
        and of.date_fin > client_date
    )
    if of_incompatible:
        return None

    # Poste de charge depuis la gamme
    poste_charge = ""
    poste_libelle = ""
    gamme = ctx._loader.get_gamme(of.article)
    if gamme and gamme.operations:
        poste_charge = gamme.operations[0].poste_charge
        poste_libelle = gamme.operations[0].libelle_poste or ""

    return {
        "num_of": of.num_of,
        "article": of.article,
        "qte_restante": of.qte_restante,
        "statut_num": of.statut_num,
        "statut_texte": _of_statut_texte(of.statut_num),
        "date_debut": of.date_debut.isoformat() if of.date_debut else None,
        "date_fin": of.date_fin.isoformat() if of.date_fin else None,
        "poste_charge": f"{poste_charge} — {poste_libelle}" if poste_libelle else poste_charge,
    }


def _build_composants(line, ctx: ErpContext) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    """Calcule les ruptures composants et le détail stock associé."""
    of = ctx.of_matcher.find_matching_of(line.num_commande, line.article, line.type_commande)
    qty_needed = max(float(line.qte_restante), 0.0)
    own_allocs = ctx.of_matcher.get_allocations(of.num_of) if of else {}
    shortages = ctx.bom_navigator.get_component_shortages(line.article, qty_needed, own_allocs)

    composants: list[dict[str, Any]] = []
    stock_composants: dict[str, dict[str, Any]] = {}

    for comp_article, manque in sorted(shortages.items()):
        comp_detail = ctx.stock_provider.get_stock_detail(comp_article)
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

    return composants, stock_composants
