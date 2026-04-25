import csv
import json
from datetime import date
from pathlib import Path
from typing import Optional

from .models import CandidateOF, SchedulerResult
from .order_diagnostics import build_order_diagnostic


def build_unscheduled_rows(by_line: dict[str, list[CandidateOF]]) -> list[dict[str, object]]:
    """Construit un export structuré des OF non planifiés avec leur cause."""
    rows: list[dict[str, object]] = []
    for line, candidates in by_line.items():
        for candidate in candidates:
            if candidate.scheduled_day is not None:
                continue
            rows.append(
                {
                    'ligne': line,
                    'of': candidate.num_of,
                    'article': candidate.article,
                    'date_echeance': candidate.due_date.isoformat(),
                    'charge_h': round(candidate.charge_hours, 3),
                    'source': candidate.source,
                    'composants_bloquants': candidate.blocking_components,
                    'cause': candidate.reason or 'capacité insuffisante ou hors horizon',
                }
            )
    rows.sort(key=lambda row: (row['ligne'], row['date_echeance'], row['of']))
    return rows


def build_order_rows(matching_results, planned_by_of: dict[str, date], candidate_by_of: dict[str, CandidateOF], loader, checker, availability_status_fn, *, planning_horizon_end: date | None = None) -> list[dict[str, object]]:
    """Construit un rapport métier des lignes de besoin avec cause."""
    rows: list[dict[str, object]] = []
    for result in matching_results:
        commande = result.commande
        allocations = result.of_allocations
        primary_of = allocations[0].of if allocations else result.of
        planned_days = [planned_by_of.get(allocation.of.num_of) for allocation in allocations]
        latest_planned_day = max((day for day in planned_days if day is not None), default=None)
        candidate = candidate_by_of.get(primary_of.num_of) if primary_of else None

        diagnostic = build_order_diagnostic(
            result,
            latest_planned_day=latest_planned_day,
            candidate=candidate,
            planning_horizon_end=planning_horizon_end,
            availability_status_fn=availability_status_fn,
            checker=checker,
            loader=loader,
        )
        statut = diagnostic.status
        cause = diagnostic.reason

        of_codes = ",".join(allocation.of.num_of for allocation in allocations) if allocations else (primary_of.num_of if primary_of else "")
        of_article = primary_of.article if primary_of else ""

        rows.append({
            'commande': commande.num_commande,
            'article_commande': commande.article,
            'date_demande': commande.date_expedition_demandee.isoformat(),
            'qte': commande.qte_restante,
            'of': of_codes,
            'article_of': of_article,
            'jour_planifie': latest_planned_day.isoformat() if latest_planned_day else '',
            'statut': statut,
            'cause': cause,
            'matching': result.matching_method,
        })

    rows.sort(key=lambda row: (row['date_demande'], row['commande'], row['article_commande']))
    return rows


def write_outputs(output_dir: str, result: SchedulerResult) -> None:
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    for line, planning in result.line_candidates.items():
        _write_planning_csv(output_path / f"planning_{line}.csv", planning)
    _write_stock_projection_csv(output_path / "stock_BDH_projete.csv", result.stock_projection)

    _write_unscheduled_csv(output_path / "ofs_non_faisables.csv", result.unscheduled_rows)
    _write_order_rows_csv(output_path / "lignes_commande_statut.csv", result.order_rows)

    with (output_path / "kpis.json").open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "taux_service": result.taux_service,
                "taux_ouverture": result.taux_ouverture,
                "nb_deviations": result.nb_deviations,
                "nb_jit": result.nb_jit,
                "weights": result.weights,
                "score": result.score,
            },
            handle,
            indent=2,
        )
        handle.write("\n")

    with (output_path / "alertes.txt").open("w", encoding="utf-8") as handle:
        for alert in result.alerts:
            handle.write(alert + "\n")


def _write_unscheduled_csv(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["ligne", "of", "article", "date_echeance", "charge_h", "source", "composants_bloquants", "cause"])
        for row in rows:
            writer.writerow([
                row['ligne'],
                row['of'],
                row['article'],
                row['date_echeance'],
                row['charge_h'],
                row['source'],
                row['composants_bloquants'],
                row['cause'],
            ])


def _write_planning_csv(path: Path, planning: list[CandidateOF]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "num_of",
            "article",
            "qte",
            "jour",
            "heure_debut",
            "heure_fin",
            "charge_h",
            "cumul_jour_h",
            "date_echeance",
            "source",
            "composants_bloquants",
            "realisable",
            "cause_non_realisable",
        ])
        sorted_rows = sorted(
            planning,
            key=lambda item: (
                item.due_date,
                item.scheduled_day is None,
                item.num_of,
            ),
        )
        for item in sorted_rows:
            realisable = "oui" if item.scheduled_day is not None else "non"
            cause_non_realisable = "" if realisable == "oui" else (item.reason or "capacité insuffisante ou hors horizon")
            writer.writerow(
                [
                    item.num_of,
                    item.article,
                    item.quantity,
                    item.scheduled_day.isoformat() if item.scheduled_day else "",
                    _format_hour(item.start_hour),
                    _format_hour(item.end_hour),
                    round(item.charge_hours, 3),
                    round(item.end_hour, 3) if item.end_hour is not None else "",
                    item.due_date.isoformat(),
                    item.source,
                    item.blocking_components,
                    realisable,
                    cause_non_realisable,
                ]
            )


def _write_stock_projection_csv(path: Path, projection: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["jour", "article", "stock_projete"])
        for row in projection:
            writer.writerow([row["jour"], row["article"], row["stock_projete"]])


def _write_order_rows_csv(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "commande", "article_commande", "date_demande", "qte", "of", "article_of", "jour_planifie", "statut", "cause", "matching"
        ])
        for row in rows:
            writer.writerow([
                row['commande'], row['article_commande'], row['date_demande'], row['qte'], row['of'], row['article_of'], row['jour_planifie'], row['statut'], row['cause'], row['matching']
            ])


def _format_hour(value: Optional[float]) -> str:
    if value is None:
        return ""
    total_minutes = int(round(value * 60))
    hours = (7 + (total_minutes // 60)) % 24
    minutes = total_minutes % 60
    return f"{hours:02d}:{minutes:02d}"
