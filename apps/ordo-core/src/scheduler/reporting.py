import csv
import json
from datetime import date
from pathlib import Path
from typing import Optional

from .models import CandidateOF, SchedulerResult


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
                    'cause': candidate.reason or 'capacité insuffisante ou hors horizon',
                }
            )
    rows.sort(key=lambda row: (row['ligne'], row['date_echeance'], row['of']))
    return rows


def build_order_rows(matching_results, planned_by_of: dict[str, date], candidate_by_of: dict[str, CandidateOF], loader, checker, availability_status_fn) -> list[dict[str, object]]:
    """Construit un rapport métier des lignes de besoin avec cause."""
    rows: list[dict[str, object]] = []
    for result in matching_results:
        commande = result.commande
        of = result.of
        planned_day = planned_by_of.get(of.num_of) if of else None
        candidate = candidate_by_of.get(of.num_of) if of else None

        if of is None:
            if 'stock complet' in result.matching_method.lower():
                statut = 'Servie sur stock'
                cause = 'stock complet'
            else:
                statut = 'Non couverte'
                cause = ' | '.join(result.alertes) if result.alertes else result.matching_method
        elif planned_day is None:
            statut = 'Non planifiée'
            cause = candidate.reason if candidate and candidate.reason else 'OF matché mais non injecté au planning'
        elif planned_day <= commande.date_expedition_demandee:
            statut = 'Servie par OF planifié à temps'
            cause = 'OF planifié à temps'
        else:
            statut = 'Servie en retard'
            if candidate is not None:
                status_at_due, reason_at_due = availability_status_fn(checker, loader, candidate, commande.date_expedition_demandee)
                if status_at_due == 'blocked':
                    cause = reason_at_due
                else:
                    cause = (
                        f"planifié le {planned_day.isoformat()} après l'échéance du {commande.date_expedition_demandee.isoformat()} | "
                        "capacité ligne saturée avant son tour"
                    )
            else:
                cause = f"planifié le {planned_day.isoformat()} après l'échéance du {commande.date_expedition_demandee.isoformat()}"

        rows.append({
            'commande': commande.num_commande,
            'article_commande': commande.article,
            'date_demande': commande.date_expedition_demandee.isoformat(),
            'qte': commande.qte_restante,
            'of': of.num_of if of else '',
            'article_of': of.article if of else '',
            'jour_planifie': planned_day.isoformat() if planned_day else '',
            'statut': statut,
            'cause': cause,
            'matching': result.matching_method,
        })

    rows.sort(key=lambda row: (row['date_demande'], row['commande'], row['article_commande']))
    return rows


def write_outputs(output_dir: str, result: SchedulerResult) -> None:
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    for line, planning in result.plannings.items():
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
        writer.writerow(["ligne", "of", "article", "date_echeance", "charge_h", "source", "cause"])
        for row in rows:
            writer.writerow([
                row['ligne'],
                row['of'],
                row['article'],
                row['date_echeance'],
                row['charge_h'],
                row['source'],
                row['cause'],
            ])


def _write_planning_csv(path: Path, planning: list[CandidateOF]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["num_of", "article", "qte", "jour", "heure_debut", "heure_fin", "charge_h", "cumul_jour_h", "date_echeance", "source"])
        for item in planning:
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
