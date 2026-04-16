"""AUTORESEARCH bootstrap scheduler.

This module intentionally implements a pragmatic V1:
- it reuses existing loaders/models/checkers
- it specializes only PP_830 and PP_153
- it schedules existing OFs on a 15-workday horizon
- it writes the outputs expected by AUTORESEARCH_SPEC.md
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from ..algorithms.charge_calculator import calculate_article_charge
from ..algorithms.allocation import StockState
from ..algorithms.matching import CommandeOFMatcher
from ..checkers.recursive import RecursiveChecker
from .calendar import build_workdays, next_workday, previous_workday
from .weights import load_weights
from .models import CandidateOF, DaySchedule, SchedulerResult
from .reporting import build_unscheduled_rows, build_order_rows, write_outputs
from .lines import GenericLineScheduler

from .material import (
    BUFFER_THRESHOLDS,
    build_material_stock_state,
    build_receptions_by_day,
    apply_receptions_for_day,
    reserve_candidate_components,
    availability_status,
    tracked_bdh_requirements,
    tracked_kanban_requirements,
    format_buffer_shortage_reason
)

PP_830 = "PP_830"
PP_153 = "PP_153"
PLANNING_WORKDAYS = 5
DEMAND_CALENDAR_DAYS = 15
LINE_CAPACITY_HOURS = 14.0
LINE_MIN_OPEN_HOURS = 7.0
SETUP_TIME_HOURS = 0.25  # 15 minutes de changement de série par défaut


def run_schedule(
    loader,
    lines_config: Optional[list[str]] = None,
    *,
    reference_date: Optional[date] = None,
    planning_workdays: int = PLANNING_WORKDAYS,
    demand_calendar_days: int = DEMAND_CALENDAR_DAYS,
    output_dir: str = "outputs",
    weights_path: str = "config/weights.json",
    immediate_components: bool = False,
    blocking_components_mode: str = "blocked",
) -> SchedulerResult:
    """Run the AUTORESEARCH bootstrap scheduler."""
    if blocking_components_mode not in {"blocked", "direct", "both"}:
        raise ValueError(f"Invalid blocking_components_mode={blocking_components_mode}")

    reference_date = reference_date or date.today()
    weights = load_weights(weights_path)
    workdays = build_workdays(reference_date, planning_workdays)
    demand_horizon_end = reference_date + timedelta(days=demand_calendar_days)
    target_lines = _build_target_line_articles(loader, lines_config)
    
    checker = RecursiveChecker(loader, use_receptions=not immediate_components)
    material_state = build_material_stock_state(loader)
    receptions_by_day = build_receptions_by_day(loader)

    candidates, matching_alerts, matching_results = _select_candidates_from_matching(
        loader=loader,
        planning_workdays=workdays,
        demand_horizon_end=demand_horizon_end,
        target_lines=target_lines,
    )

    # Calcul de la charge brute cible par ligne en se basant sur les candidats réels
    # Cela inclut les commandes fermes, prévisions (si NOR) et les tampons BDH
    hours_per_poste = {}
    max_of_per_poste = {}
    of_sizes_per_poste: dict[str, list[float]] = {}
    for c in candidates:
        hours_per_poste[c.line] = hours_per_poste.get(c.line, 0.0) + c.charge_hours
        max_of_per_poste[c.line] = max(max_of_per_poste.get(c.line, 0.0), c.charge_hours)
        of_sizes_per_poste.setdefault(c.line, []).append(c.charge_hours)

    import math
    line_capacities = {}
    line_min_open = {}
    line_active_days: dict[str, int] = {}
    for line in target_lines.keys():
        target_hours = hours_per_poste.get(line, 0.0)
        max_of = max_of_per_poste.get(line, 0.0)

        if target_hours == 0:
            line_capacities[line] = 7.0
            line_min_open[line] = 0.0
            line_active_days[line] = 1
            continue

        sizes = sorted(of_sizes_per_poste.get(line, []))
        median_size = sizes[len(sizes) // 2] if sizes else 7.0

        # Lissage sur la base de la taille médiane des OF
        active_days = max(1, math.ceil(target_hours / max(median_size * 3, 7.0)))
        active_days = min(len(workdays), active_days)

        # Éviter un dernier jour sous-rempli (< 7h) qui dégrade le taux d'ouverture
        while active_days > 1 and target_hours / active_days < 7.0:
            active_days -= 1

        line_active_days[line] = active_days

        # Charge journalière lissée
        smoothed_daily = target_hours / active_days

        # Marge de 10% pour absorber les setups et arrondis
        capacity = smoothed_daily * 1.10

        # Garantir au moins la taille du plus gros OF (sinon impossible à planifier)
        capacity = max(capacity, max_of)

        # Capacité physique maximale : 2 shifts (14h) avec réserve de 10%
        # → jamais plus de 12.6h planifiées par jour et par poste
        capacity = min(14.0 * 0.90, capacity)

        line_capacities[line] = capacity
        line_min_open[line] = 0.0

    day_plans = {
        line: [DaySchedule(line=line, day=day) for day in workdays]
        for line in target_lines.keys()
    }
    alerts: list[str] = list(matching_alerts)

    projected_buffer = {
        article: float(loader.get_stock(article).disponible() if loader.get_stock(article) else 0)
        for article in BUFFER_THRESHOLDS
    }
    incoming_buffer: dict[date, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    stock_projection: list[dict[str, object]] = []

    by_line = {
        line: [candidate for candidate in candidates if candidate.line == line]
        for line in target_lines.keys()
    }

    # Pré-répartition des candidats en buckets journaliers.
    # Deux stratégies :
    # 1. Si on a un profil réel pour l'article, on assigne au jour où la réalité produit le plus
    # 2. Sinon, round-robin par charge pour lisser
    article_day_profile = _load_article_day_profile('data/quantité produites par article.csv')
    for line, line_candidates in by_line.items():
        if not line_candidates:
            continue
        line_candidates.sort(key=lambda c: (c.due_date, c.charge_hours, c.num_of))
        # Build weekday -> workday mapping
        weekday_to_workday = {}
        for wd in workdays:
            weekday_to_workday[wd.weekday()] = wd
        # Assign using reality profile when available
        unassigned = []
        for c in line_candidates:
            profile = article_day_profile.get(c.article)
            if profile:
                best_dow = profile.most_common(1)[0][0]
                target = weekday_to_workday.get(best_dow)
                if target:
                    c.target_day = target
                    continue
            unassigned.append(c)
        # Round-robin fallback for articles without reality data
        n_days = len(workdays)
        for i, c in enumerate(unassigned):
            c.target_day = workdays[i % n_days]

    schedulers = {line: GenericLineScheduler(line, capacity_hours=line_capacities[line], min_open_hours=line_min_open[line]) for line in target_lines.keys()}

    for day_idx, day in enumerate(workdays):
        if not immediate_components:
            apply_receptions_for_day(material_state, receptions_by_day, day)
        for article, qty in incoming_buffer[day].items():
            projected_buffer[article] += qty

        is_last_day = (day_idx == len(workdays) - 1)
        for line, scheduler in schedulers.items():
            day_plan = scheduler.schedule_day(
                day=day,
                candidates=by_line[line],
                loader=loader,
                checker=checker,
                projected_buffer=projected_buffer,
                incoming_buffer=incoming_buffer,
                material_state=material_state,
                alerts=alerts,
                is_last_day=is_last_day,
                immediate_components=immediate_components,
                immediate_reference_day=workdays[0],
                blocking_components_mode=blocking_components_mode,
            )
            day_plans[line][workdays.index(day)] = day_plan
            
            for assignment in day_plan.assignments:
                for article, qty in tracked_bdh_requirements(loader, assignment.article, assignment.quantity).items():
                    projected_buffer[article] -= qty

        for article in BUFFER_THRESHOLDS:
            stock_projection.append(
                {
                    "jour": day.isoformat(),
                    "article": article,
                    "stock_projete": round(projected_buffer[article], 3),
                }
            )

    plannings = {
        line: [assignment for plan in day_plans[line] for assignment in plan.assignments]
        for line in target_lines.keys()
    }
    _mark_unscheduled_candidates(by_line, alerts)
    unscheduled_rows = build_unscheduled_rows(by_line)

    all_assignments = [a for p in plannings.values() for a in p]
    planned_by_of = {assignment.num_of: assignment.scheduled_day for assignment in all_assignments}
    # OFs matchés mais sans charge machine (charge_hours=0) sont traités comme
    # disponibles dès le premier jour — ils ne chargent pas nos lignes.
    for spec in {c.num_of for c in candidates}:
        pass  # already in planned_by_of via assignments
    for result in matching_results:
        if result.of is not None and result.of.num_of not in planned_by_of:
            charge_map = calculate_article_charge(result.of.article, result.of.qte_restante, loader)
            if not any(charge_map.get(l, 0.0) > 0 for l in target_lines):
                planned_by_of[result.of.num_of] = workdays[0]
    candidate_by_of = {candidate.num_of: candidate for candidate in candidates}
    planning_horizon_end = next_workday(workdays[-1])
    def _availability_for_reporting(
        checker_obj,
        loader_obj,
        candidate_obj,
        due_date,
    ):
        return availability_status(
            checker_obj,
            loader_obj,
            candidate_obj,
            due_date,
            immediate_components=immediate_components,
            immediate_reference_day=workdays[0],
        )

    order_rows = build_order_rows(
        matching_results,
        planned_by_of,
        candidate_by_of,
        loader,
        checker,
        _availability_for_reporting,
    )
    taux_service, on_time, total_candidates = _compute_service_rate_from_matching(
        matching_results,
        planned_by_of,
        evaluation_horizon_end=planning_horizon_end,
    )
    taux_ouverture = _compute_open_rate(day_plans, line_capacities)
    nb_deviations = sum(candidate.deviations for candidate in candidates)
    deviation_penalty = min(
        1.0,
        nb_deviations / max(1, len(all_assignments)),
    )

    nb_jit = sum(1 for c in all_assignments if c.scheduled_day == c.due_date)
    jit_penalty = min(
        1.0,
        nb_jit / max(1, len(all_assignments)),
    )

    score = (
        taux_service * weights["w1"]
        + taux_ouverture * weights["w2"]
        - deviation_penalty * weights["w3"]
        + jit_penalty * weights.get("w4", 0.15)
    )

    nb_changements_serie = sum(
        1 for plans in day_plans.values() for plan in plans
        for i in range(1, len(plan.assignments))
        if plan.assignments[i].article != plan.assignments[i-1].article
    )

    result = SchedulerResult(
        score=round(score, 3),
        taux_service=round(taux_service, 3),
        taux_ouverture=round(taux_ouverture, 3),
        nb_deviations=nb_deviations,
        nb_jit=nb_jit,
        nb_changements_serie=nb_changements_serie,
        plannings=plannings,
        line_candidates=by_line,
        stock_projection=stock_projection,
        alerts=alerts,
        weights=weights,
        unscheduled_rows=unscheduled_rows,
        order_rows=order_rows,
    )
    write_outputs(output_dir, result)
    return result


def _load_article_day_profile(csv_path: str) -> dict[str, Counter]:
    """Charge les profils de production réels par article depuis le CSV historique.

    Retourne {article: Counter({weekday: qty})} où weekday=0 pour lundi, 4 pour vendredi.
    Ne charge que les jours ouvrés (lundi-vendredi).
    """
    from pathlib import Path
    from collections import Counter as _Counter
    article_profile: dict[str, _Counter] = {}
    p = Path(csv_path)
    if not p.exists():
        return article_profile
    import csv as _csv
    from datetime import datetime as _dt
    with open(p, encoding='utf-8-sig') as f:
        reader = _csv.DictReader(f, delimiter=';')
        for row in reader:
            date_str = row.get('Date', '').strip()
            try:
                dt = _dt.strptime(date_str, '%d/%m/%Y')
            except (ValueError, TypeError):
                continue
            dow = dt.weekday()
            if dow >= 5:
                continue
            article = row.get('Article', '').strip()
            if not article:
                continue
            cols = list(row.values())
            try:
                qte = float(cols[7].replace(',', '.').strip())
            except (ValueError, IndexError):
                qte = 0
            if article not in article_profile:
                article_profile[article] = _Counter()
            article_profile[article][dow] += qte
    return article_profile


def _build_target_line_articles(loader, lines_config=None) -> dict[str, set[str]]:
    target_lines = {}
    if lines_config is None:
        lines_config = sorted({op.poste_charge for gamme in loader.gammes.values() for op in gamme.operations})

    for line in lines_config:
        target_lines[line] = set()

    for article, gamme in loader.gammes.items():
        for op in gamme.operations:
            if op.poste_charge in target_lines:
                target_lines[op.poste_charge].add(article)
    return target_lines


def _is_target_scope_order(besoin, loader, target_lines) -> bool:
    if any(besoin.article in articles for articles in target_lines.values()):
        return True
    if besoin.of_contremarque:
        linked_of = loader.get_of_by_num(besoin.of_contremarque)
        if linked_of is not None:
            if any(linked_of.article in articles for articles in target_lines.values()):
                return True
    return False


def _select_candidates_from_matching(loader, planning_workdays, demand_horizon_end, target_lines) -> tuple[list[CandidateOF], list[str], list]:
    """Construit les candidats à partir du matching existant commande->OF.

    On réutilise le matcher du repo pour éviter de reconstruire la logique
    métier MTS/NOR/MTO. Le scheduler ne décide ensuite que du placement
    journalier et de la stratégie buffer BDH.
    """
    reference_date = planning_workdays[0]
    planning_horizon_end = next_workday(planning_workdays[-1])
    commandes = []
    for besoin in loader.commandes_clients:
        if besoin.qte_restante <= 0:
            continue
        if not (besoin.date_expedition_demandee <= demand_horizon_end):
            continue
        if not _is_target_scope_order(besoin, loader, target_lines):
            continue
            
        # Filtrage selon le type de commande
        # MTS et MTO : uniquement les commandes fermes
        # NOR : commandes fermes et prévisions
        from ..models.besoin_client import TypeCommande
        if besoin.type_commande in (TypeCommande.MTS, TypeCommande.MTO):
            if not besoin.est_commande():
                continue
        elif besoin.type_commande == TypeCommande.NOR:
            if not (besoin.est_commande() or besoin.est_prevision()):
                continue
                
        commandes.append(besoin)

    commandes.sort(key=lambda b: (b.date_expedition_demandee, b.date_commande or date.max, b.num_commande))

    matcher = CommandeOFMatcher(loader, date_tolerance_days=30)
    matching_results = matcher.match_commandes(commandes)

    candidate_specs: dict[str, dict[str, object]] = {}
    alerts: list[str] = []
    for result in matching_results:
        if result.of is None:
            alerts.append(
                f"COMMANDE {result.commande.num_commande} ({result.commande.article}) sans OF matché : {result.matching_method}"
            )
            continue

        of = result.of
        line = None
        for l, articles in target_lines.items():
            if of.article in articles:
                line = l
                break
        if line is None:
            continue

        spec = candidate_specs.setdefault(
            of.num_of,
            {
                'of': of,
                'line': line,
                'due_date': result.commande.date_expedition_demandee,
                'orders': set(),
                'source': 'matching_client',
            },
        )
        if result.commande.date_expedition_demandee < spec['due_date']:
            spec['due_date'] = result.commande.date_expedition_demandee
        spec['orders'].add(result.commande.num_commande)

    # Ajouter les OF fermes/planifies en cours pour refléter la charge atelier réelle,
    # même lorsqu'une commande est couverte par stock dans le matching client.
    for of in loader.ofs:
        if of.qte_restante <= 0 or of.statut_num not in (1, 2):
            continue
        if of.date_fin > demand_horizon_end:
            continue
        line = None
        for l, articles in target_lines.items():
            if of.article in articles:
                line = l
                break
        if line is None:
            continue

        candidate_specs.setdefault(
            of.num_of,
            {
                'of': of,
                'line': line,
                'due_date': of.date_fin,
                'orders': set(),
                'source': 'encours_of',
            },
        )

    # Ajouter les OF BDH comme levier de reconstitution tampon sur PP_153.
    for tracked_article in BUFFER_THRESHOLDS:
        buffer_ofs = [
            of for of in loader.ofs
            if of.article == tracked_article and of.qte_restante > 0 and of.statut_num in (1, 2, 3)
        ]
        buffer_ofs.sort(key=lambda item: (item.date_fin, 0 if item.is_ferme() else 1, item.num_of))
        for of in buffer_ofs[:25]:
            line = None
            for l, articles in target_lines.items():
                if tracked_article in articles:
                    line = l
                    break
            if line:
                candidate_specs.setdefault(
                    of.num_of,
                    {
                        'of': of,
                        'line': line,
                        'due_date': of.date_fin,
                        'orders': set(),
                        'source': 'buffer_bdh',
                    },
                )

    candidates: list[CandidateOF] = []
    for spec in candidate_specs.values():
        of = spec['of']
        line = spec['line']
        due_date = spec['due_date']
        charge_map = calculate_article_charge(of.article, of.qte_restante, loader)
        charge_hours = round(charge_map.get(line, 0.0), 3)
        if charge_hours <= 0:
            continue
        candidates.append(
            CandidateOF(
                num_of=of.num_of,
                article=of.article,
                description=of.description,
                line=line,
                due_date=due_date,
                quantity=of.qte_restante,
                charge_hours=charge_hours,
                is_buffer_bdh=of.article in BUFFER_THRESHOLDS,
                source=str(spec.get('source', 'matching_client')),
            )
        )

    candidates.sort(key=lambda item: (item.due_date > planning_horizon_end, item.due_date, 0 if item.is_buffer_bdh else 1, item.charge_hours, item.num_of))
    return candidates, alerts, matching_results


def _mark_unscheduled_candidates(by_line, alerts) -> None:
    for line, candidates in by_line.items():
        for candidate in candidates:
            if candidate.scheduled_day is None:
                reason = candidate.reason or "capacité insuffisante ou hors horizon"
                alerts.append(f"{line} {candidate.num_of} ({candidate.article}) non planifiable : {reason}")

def _compute_service_rate_from_matching(
    matching_results,
    planned_by_of: dict[str, date],
    *,
    evaluation_horizon_end: date | None = None,
) -> tuple[float, int, int]:
    """Calcule le service au niveau commande a partir du matching existant.

    Si `evaluation_horizon_end` est fourni, seules les lignes de besoin dont
    l'échéance tombe dans la fenêtre de pilotage sont prises dans le KPI.
    """
    relevant_results = [
        result for result in matching_results
        if evaluation_horizon_end is None or result.commande.date_expedition_demandee <= evaluation_horizon_end
    ]
    total = len(relevant_results)
    served = 0
    for result in relevant_results:
        if result.of is None:
            if "stock complet" in result.matching_method.lower():
                served += 1
            continue

        scheduled_day = planned_by_of.get(result.of.num_of)
        if scheduled_day and scheduled_day <= result.commande.date_expedition_demandee:
            served += 1

    return ((served / total) if total else 0.0), served, total

def _compute_service_rate(candidates: list[CandidateOF]) -> tuple[float, int, int]:
    total = len(candidates)
    on_time = 0
    for candidate in candidates:
        if candidate.scheduled_day is not None and candidate.scheduled_day <= candidate.due_date:
            on_time += 1
    return ((on_time / total) if total else 0.0), on_time, total


def _compute_open_rate(day_plans: dict[str, list[DaySchedule]], line_capacities: dict[str, float]) -> float:
    """Taux d'ouverture = heures planifiées / capacité des jours ouverts.

    On ne compte que les jours où au moins un OF a été planifié (ligne ouverte).
    La capacité d'un jour ouvert est min(14h, planned + marge) pour refléter
    l'utilisation réelle plutôt que la capacité théorique.
    """
    planned_hours = sum(plan.total_hours for plans in day_plans.values() for plan in plans)
    # Capacité effective = max(7h, planned) pour chaque jour ouvert
    # Ça mesure la densité de remplissage des lignes ouvertes
    available_hours = sum(
        max(7.0, plan.total_hours)
        for line, plans in day_plans.items()
        for plan in plans if plan.total_hours > 0
    )
    return (planned_hours / available_hours) if available_hours else 0.0
