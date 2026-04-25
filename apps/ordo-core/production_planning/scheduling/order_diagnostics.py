"""Business diagnostics for order-level scheduling outcomes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass(frozen=True)
class OrderPlanningDiagnostic:
    """Structured business diagnosis for one order line."""

    status: str
    reason: str


def build_order_diagnostic(
    result,
    *,
    latest_planned_day: Optional[date],
    candidate,
    planning_horizon_end: Optional[date],
    availability_status_fn,
    checker,
    loader,
) -> OrderPlanningDiagnostic:
    """Derive business status/reason from matching + scheduling facts."""
    commande = result.commande
    allocations = result.of_allocations

    if result.remaining_uncovered_qty > 0:
        reason = " | ".join(result.alertes) if result.alertes else (
            f"reliquat non couvert: {result.remaining_uncovered_qty}"
        )
        return OrderPlanningDiagnostic(status="Non couverte", reason=reason)

    primary_of = allocations[0].of if allocations else result.of
    if not allocations and primary_of is None:
        if "stock complet" in result.matching_method.lower():
            return OrderPlanningDiagnostic(status="Servie sur stock", reason="stock complet")
        reason = " | ".join(result.alertes) if result.alertes else result.matching_method
        return OrderPlanningDiagnostic(status="Non couverte", reason=reason)

    if planning_horizon_end and commande.date_expedition_demandee > planning_horizon_end:
        return OrderPlanningDiagnostic(
            status="Hors planification",
            reason=(
                f"échéance {commande.date_expedition_demandee.isoformat()} "
                "au-delà de l'horizon"
            ),
        )

    planned_days = [latest_planned_day] if latest_planned_day is not None else []
    if allocations and not planned_days:
        return OrderPlanningDiagnostic(
            status="Non planifiée",
            reason=(
                candidate.reason
                if candidate and candidate.reason
                else "OF matché mais non injecté au planning"
            ),
        )

    if latest_planned_day is not None and latest_planned_day <= commande.date_expedition_demandee:
        return OrderPlanningDiagnostic(
            status="Servie par OF planifiés à temps",
            reason="OF planifiés à temps",
        )

    if latest_planned_day is None:
        return OrderPlanningDiagnostic(
            status="Non planifiée",
            reason=(
                candidate.reason
                if candidate and candidate.reason
                else "OF matché mais non injecté au planning"
            ),
        )

    if candidate is not None:
        status_at_due, reason_at_due = availability_status_fn(
            checker,
            loader,
            candidate,
            commande.date_expedition_demandee,
        )
        if status_at_due == "blocked":
            return OrderPlanningDiagnostic(status="Servie en retard", reason=reason_at_due)
    else:
        return OrderPlanningDiagnostic(
            status="Servie en retard",
            reason=(
                f"dernier OF planifié le {latest_planned_day.isoformat()} "
                f"après l'échéance du {commande.date_expedition_demandee.isoformat()}"
            ),
        )

    return OrderPlanningDiagnostic(
        status="Servie en retard",
        reason=(
            f"dernier OF planifié le {latest_planned_day.isoformat()} "
            f"après l'échéance du {commande.date_expedition_demandee.isoformat()} | "
            "capacité ligne saturée avant son tour"
        ),
    )
