"""Orchestrateur principal du scheduler AUTORESEARCH."""

from __future__ import annotations

import csv
import json
from pathlib import Path

from .bom_graph import BomGraph
from .demand_solver import build_candidates
from .kpi import compute_kpis, load_weights
from .models import PlanningResult, ScheduledTask
from .sequencer import build_schedule


def _write_planning_csv(path: Path, tasks: list[ScheduledTask]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["of", "article", "jour", "heure_debut", "heure_fin", "charge_h", "comfortable", "type"])
        for task in tasks:
            writer.writerow([
                task.num_of,
                task.article,
                task.scheduled_day.isoformat(),
                f"{task.start_hour:.2f}",
                f"{task.end_hour:.2f}",
                f"{task.charge_hours:.2f}",
                "oui" if task.comfortable else "non",
                task.kind,
            ])


def _write_stock_projection_csv(path: Path, snapshots) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["article", "jour", "stock_projete"])
        for snapshot in snapshots:
            writer.writerow([snapshot.article, snapshot.day.isoformat(), snapshot.stock_projected])


def _write_alerts(path: Path, alerts: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for alert in alerts:
            handle.write(f"- {alert}\n")


def run_schedule(loader, output_dir: str = "outputs", weights_path: str = "config/weights.json") -> PlanningResult:
    """Execute le scheduler AUTORESEARCH et persiste ses sorties."""
    output_root = Path(output_dir)
    bom_graph = BomGraph(loader)
    horizon_end = None

    # Le sequencer reconstruit son horizon a partir d'aujourd'hui, on ne garde ici que la borne haute.
    from .capacity import build_working_day_horizon
    horizon_days = build_working_day_horizon(__import__("datetime").date.today(), 15)
    horizon_end = horizon_days[-1]

    candidates = build_candidates(loader, bom_graph, horizon_end=horizon_end)
    planning_pp830, planning_pp153, snapshots, alerts, deviations, days = build_schedule(
        loader,
        candidates,
        bom_graph,
        horizon_days=15,
    )
    weights = load_weights(weights_path)
    kpis = compute_kpis(candidates, planning_pp830 + planning_pp153, days, deviations, weights)

    _write_planning_csv(output_root / "planning_PP830.csv", planning_pp830)
    _write_planning_csv(output_root / "planning_PP153.csv", planning_pp153)
    _write_stock_projection_csv(output_root / "stock_BDH_projete.csv", snapshots)
    _write_alerts(output_root / "alertes.txt", alerts)

    with (output_root / "kpis.json").open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "taux_service": kpis.taux_service,
                "taux_ouverture": kpis.taux_ouverture,
                "nb_deviations": kpis.nb_deviations,
                "score": kpis.score,
                "weights": weights,
                "nb_candidates": len(candidates),
                "nb_tasks_pp830": len(planning_pp830),
                "nb_tasks_pp153": len(planning_pp153),
            },
            handle,
            indent=2,
        )

    return PlanningResult(
        planning_pp830=planning_pp830,
        planning_pp153=planning_pp153,
        stock_projection=snapshots,
        alerts=alerts,
        kpis=kpis,
    )
