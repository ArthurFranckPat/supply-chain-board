"""Sequencement journalier minimal pour AUTORESEARCH."""

from __future__ import annotations

from datetime import date, timedelta

from .bom_graph import TRACKED_BDH, BomGraph
from .buffer_manager import BufferManager
from .capacity import MAX_DAY_HOURS, build_working_day_horizon
from .models import CandidateOF, ScheduledTask


def _next_workday(current_day: date, horizon_days: list[date]) -> date:
    try:
        index = horizon_days.index(current_day)
    except ValueError:
        return current_day
    return horizon_days[index + 1] if index + 1 < len(horizon_days) else current_day


def _schedule_feasibility(loader, of, launch_day: date):
    """Classe un OF en confortable / tendu / bloque pour un jour donne.

    Compromis bootstrap: on reutilise le checker recursif existant avec une date de besoin
    forcee pour distinguer J-1 (confortable) et J (tendu).
    """
    from ..checkers.recursive import RecursiveChecker

    checker = RecursiveChecker(loader, use_receptions=True, check_date=launch_day)

    kwargs = {
        "article": of.article,
        "qte_besoin": of.qte_restante,
        "depth": 0,
        "of_parent_est_ferme": of.is_ferme(),
        "num_of_parent": of.num_of,
    }
    comfortable_result = checker._check_article_recursive(  # noqa: SLF001
        date_besoin=launch_day - timedelta(days=1),
        **kwargs,
    )
    if comfortable_result.feasible:
        return True, comfortable_result

    tense_result = checker._check_article_recursive(  # noqa: SLF001
        date_besoin=launch_day,
        **kwargs,
    )
    if tense_result.feasible:
        return False, tense_result

    return None, tense_result


def _choose_fitting_candidate(day_candidates: list[tuple[CandidateOF, bool]], remaining_hours: float):
    fitting = [item for item in day_candidates if item[0].charge_hours <= remaining_hours]
    if fitting:
        return fitting[0]
    return None


def build_schedule(loader, candidates: list[CandidateOF], bom_graph: BomGraph, horizon_days: int = 15):
    """Construit le planning journalier de PP_830 et PP_153."""
    days = build_working_day_horizon(date.today(), horizon_days)
    buffer_manager = BufferManager(loader)
    of_by_num = {of.num_of: of for of in loader.ofs}

    pp830_candidates = [candidate for candidate in candidates if candidate.line == "PP_830"]
    pp153_candidates = [candidate for candidate in candidates if candidate.line == "PP_153"]
    unscheduled = {candidate.num_of for candidate in candidates}

    planning_pp830: list[ScheduledTask] = []
    planning_pp153: list[ScheduledTask] = []
    alerts: list[str] = []
    deviations = 0

    for day in days:
        buffer_manager.roll_to_day(day)

        # PP_153 en premier pour reconstituer le stock du jour suivant.
        pp153_hours = 0.0
        while pp153_hours < MAX_DAY_HOURS:
            below_threshold = buffer_manager.below_threshold()
            pool = [candidate for candidate in pp153_candidates if candidate.num_of in unscheduled]
            if below_threshold:
                pool = [candidate for candidate in pool if candidate.article in below_threshold]
            else:
                pool = [candidate for candidate in pool if candidate.kind != "buffer"] or pool

            if not pool:
                break

            evaluated: list[tuple[CandidateOF, bool]] = []
            for candidate in pool:
                comfort, result = _schedule_feasibility(loader, of_by_num[candidate.num_of], day)
                if comfort is None:
                    if day >= candidate.due_date:
                        alerts.append(
                            f"{candidate.num_of} non planifiable sur {candidate.line} le {day.isoformat()} : composants insuffisants"
                        )
                    continue
                evaluated.append((candidate, bool(comfort)))

            evaluated.sort(key=lambda item: (item[0].due_date, not item[1], item[0].charge_hours, item[0].num_of))
            selected = _choose_fitting_candidate(evaluated, MAX_DAY_HOURS - pp153_hours)
            if selected is None:
                break

            candidate, comfortable = selected
            start_hour = pp153_hours
            end_hour = start_hour + candidate.charge_hours
            planning_pp153.append(
                ScheduledTask(
                    num_of=candidate.num_of,
                    article=candidate.article,
                    line=candidate.line,
                    scheduled_day=day,
                    start_hour=round(start_hour, 2),
                    end_hour=round(end_hour, 2),
                    charge_hours=candidate.charge_hours,
                    due_date=candidate.due_date,
                    quantity=candidate.quantity,
                    comfortable=comfortable,
                    kind=candidate.kind,
                )
            )
            if candidate.article in TRACKED_BDH:
                buffer_manager.schedule_addition(_next_workday(day, days), candidate.article, candidate.quantity)
            pp153_hours = end_hour
            unscheduled.remove(candidate.num_of)

        # PP_830 ensuite, avec verification du stock tampon.
        pp830_hours = 0.0
        while pp830_hours < MAX_DAY_HOURS:
            pool = [candidate for candidate in pp830_candidates if candidate.num_of in unscheduled]
            if not pool:
                break

            evaluated: list[tuple[CandidateOF, bool]] = []
            for candidate in pool:
                comfort, result = _schedule_feasibility(loader, of_by_num[candidate.num_of], day)
                if comfort is None:
                    if day >= candidate.due_date:
                        alerts.append(
                            f"{candidate.num_of} non planifiable sur {candidate.line} le {day.isoformat()} : composants insuffisants"
                        )
                    continue
                if not buffer_manager.can_cover(candidate.tracked_bdh_qty):
                    continue
                evaluated.append((candidate, bool(comfort)))

            evaluated.sort(key=lambda item: (item[0].due_date, not item[1], item[0].charge_hours, item[0].num_of))
            selected = _choose_fitting_candidate(evaluated, MAX_DAY_HOURS - pp830_hours)
            if selected is None:
                break

            candidate, comfortable = selected
            start_hour = pp830_hours
            end_hour = start_hour + candidate.charge_hours
            if candidate.tracked_bdh_qty:
                buffer_manager.consume(candidate.tracked_bdh_qty)
            planning_pp830.append(
                ScheduledTask(
                    num_of=candidate.num_of,
                    article=candidate.article,
                    line=candidate.line,
                    scheduled_day=day,
                    start_hour=round(start_hour, 2),
                    end_hour=round(end_hour, 2),
                    charge_hours=candidate.charge_hours,
                    due_date=candidate.due_date,
                    quantity=candidate.quantity,
                    comfortable=comfortable,
                    kind=candidate.kind,
                )
            )
            pp830_hours = end_hour
            unscheduled.remove(candidate.num_of)

        buffer_manager.record_snapshot(day)

    for candidate in candidates:
        if candidate.num_of in unscheduled:
            alerts.append(
                f"{candidate.num_of} non planifie dans l'horizon 15 jours ({candidate.line}, echeance {candidate.due_date.isoformat()})"
            )

    return planning_pp830, planning_pp153, buffer_manager.snapshots, alerts, deviations, days
