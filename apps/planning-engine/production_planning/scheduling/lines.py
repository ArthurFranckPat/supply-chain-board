from datetime import date, timedelta
from typing import Optional

from .models import CandidateOF, DaySchedule
from ..planning.calendar import next_workday
from .buffer_config import BUFFER_THRESHOLDS
from .material import (
    availability_status,
    tracked_bdh_requirements,
    tracked_kanban_requirements,
    reserve_candidate_components,
    extract_blocking_components,
    compute_direct_component_shortages,
)
from .heuristics import generic_sort_key, generic_decision_trace

LINE_CAPACITY_HOURS = 14.0
LINE_MIN_OPEN_HOURS = 3.0  # Seuil minimum pour ouvrir une ligne
SETUP_TIME_HOURS = 0.25

# Articles suivis en Kanban (pourrait être externalisé en config)
DEFAULT_KANBAN_ARTICLES: set[str] = {"11028877", "11033880", "11033919"}

# Mots-clés exclus lors du parsing de la description pour déterminer la famille
DEFAULT_FAMILY_EXCLUSIONS: set[str] = {
    "ESH", "ESHKIT", "ESHGPE", "CBL", "CPT", "BDH", "BIP", "GP", "PNEU", "BOIT"
}


class GenericLineScheduler:
    """Planificateur générique pour n'importe quelle ligne."""
    
    def __init__(self, line_name: str, capacity_hours: float = 14.0, min_open_hours: float = 7.0):
        self.line_name = line_name
        self.capacity_hours = capacity_hours
        self.min_open_hours = min_open_hours

    def _mark_candidate_deviation(self, candidate: CandidateOF, earliest_blocked_due: Optional[date], deviation_marked: bool, current_day: Optional[date] = None) -> bool:
        candidate.deviations = 0
        if (
            not deviation_marked
            and earliest_blocked_due is not None
            and not candidate.is_buffer_bdh
            and candidate.due_date > earliest_blocked_due
            and (current_day is None or earliest_blocked_due < current_day - timedelta(days=1))
        ):
            candidate.deviations = 1
            return True
        return deviation_marked

    def _assign_candidate_time(self, candidate: CandidateOF, last_article: Optional[str], used_hours: float, day: date) -> float:
        setup_time = SETUP_TIME_HOURS if last_article and candidate.article != last_article else 0.0
        used_hours += setup_time
        candidate.scheduled_day = day
        candidate.start_hour = round(used_hours, 3)
        used_hours += candidate.charge_hours
        candidate.end_hour = round(used_hours, 3)
        return used_hours

    def _handle_under_capacity(self, plan: DaySchedule, day: date, incoming_buffer: dict[date, dict[str, int]], alerts: list[str]) -> None:
        if plan.engaged_hours < self.min_open_hours:
            for assignment in plan.assignments:
                if assignment.is_buffer_bdh:
                    availability_day = next_workday(day)
                    incoming_buffer[availability_day][assignment.article] -= assignment.quantity
                assignment.scheduled_day = None
                assignment.start_hour = None
                assignment.end_hour = None
                assignment.reason = f"ligne non ouverte (<{self.min_open_hours}h)"
                assignment.blocking_components = ""
            if plan.assignments:
                alerts.append(f"{self.line_name} {day.isoformat()} : ligne fermée car charge < {self.min_open_hours}h")
            plan.assignments = []

    def _select_active_candidates_for_day(
        self,
        unscheduled: list[CandidateOF],
        day: date,
        *,
        is_last_day: bool,
    ) -> list[CandidateOF]:
        """Keep the active candidate set for the day with JIT deferral policy."""
        if is_last_day:
            return unscheduled

        deferred: list[CandidateOF] = []
        active: list[CandidateOF] = []
        for candidate in unscheduled:
            days_until_due = (candidate.due_date - day).days
            if days_until_due > 1:
                deferred.append(candidate)
            else:
                active.append(candidate)

        if not active and deferred:
            deferred.sort(key=lambda candidate: candidate.due_date)
            active.append(deferred.pop(0))

        active_hours = sum(candidate.charge_hours for candidate in active)
        fill_threshold = max(7.0, self.capacity_hours * 0.5)
        if active_hours < fill_threshold and deferred:
            deferred.sort(key=lambda candidate: candidate.due_date)
            while deferred and active_hours < fill_threshold:
                candidate = deferred.pop(0)
                active.append(candidate)
                active_hours += candidate.charge_hours
        return active

    def _compute_direct_shortages(
        self,
        loader,
        candidate: CandidateOF,
        material_state,
        *,
        blocking_components_mode: str,
    ) -> str:
        if blocking_components_mode in {"direct", "both"}:
            return compute_direct_component_shortages(loader, candidate, material_state)
        return ""

    def _merge_blocking_components(
        self,
        blocked_components: str,
        direct_components: str,
        *,
        blocking_components_mode: str,
    ) -> str:
        if blocking_components_mode == "blocked":
            return blocked_components
        if blocking_components_mode == "direct":
            return direct_components
        components: list[str] = []
        for part in f"{blocked_components}, {direct_components}".split(","):
            chunk = part.strip()
            if chunk and chunk not in components:
                components.append(chunk)
        return ", ".join(components)

    def _evaluate_candidate_material_status(
        self,
        loader,
        checker,
        candidate: CandidateOF,
        day: date,
        material_state,
        projected_buffer: dict[str, float],
        *,
        immediate_components: bool,
        immediate_reference_day: Optional[date],
        blocking_components_mode: str,
    ) -> tuple[str, str, str, dict[str, float], bool]:
        status, reason = availability_status(
            checker,
            loader,
            candidate,
            day,
            material_state,
            immediate_components=immediate_components,
            immediate_reference_day=immediate_reference_day,
        )
        direct_components = self._compute_direct_shortages(
            loader,
            candidate,
            material_state,
            blocking_components_mode=blocking_components_mode,
        )
        requirements = tracked_bdh_requirements(loader, candidate.article, candidate.quantity)
        buffer_shortage = any(
            projected_buffer.get(article, 0.0) < qty
            for article, qty in requirements.items()
        )
        return status, reason, direct_components, requirements, buffer_shortage

    def _pick_next_schedulable_candidate_index(
        self,
        unscheduled: list[CandidateOF],
        *,
        day: date,
        used_hours: float,
        last_article: Optional[str],
        loader,
        checker,
        material_state,
        projected_buffer: dict[str, float],
        immediate_components: bool,
        immediate_reference_day: Optional[date],
        blocking_components_mode: str,
        earliest_blocked_due: Optional[date],
    ) -> tuple[int, Optional[date]]:
        for idx, candidate in enumerate(unscheduled):
            setup_time = SETUP_TIME_HOURS if last_article and candidate.article != last_article else 0.0
            if used_hours + candidate.charge_hours + setup_time > self.capacity_hours:
                continue

            status, reason, direct_components, _reqs, _buffer_shortage = self._evaluate_candidate_material_status(
                loader,
                checker,
                candidate,
                day,
                material_state,
                projected_buffer,
                immediate_components=immediate_components,
                immediate_reference_day=immediate_reference_day,
                blocking_components_mode=blocking_components_mode,
            )
            if status != "blocked":
                return idx, earliest_blocked_due

            candidate.reason = reason
            blocked_components = extract_blocking_components(reason)
            candidate.blocking_components = self._merge_blocking_components(
                blocked_components,
                direct_components,
                blocking_components_mode=blocking_components_mode,
            )
            if earliest_blocked_due is None or candidate.due_date < earliest_blocked_due:
                earliest_blocked_due = candidate.due_date
        return -1, earliest_blocked_due

    def _update_family_and_kanban_counters(
        self,
        loader,
        candidate: CandidateOF,
        family_counts: dict[str, int],
        kanban_conso: dict[str, float],
        kanban_articles: set[str],
    ) -> None:
        art_info = loader.get_article(candidate.article)
        if art_info:
            desc = art_info.description.upper()
            parts = desc.split()
            fam_cand = next(
                (
                    part
                    for part in parts
                    if len(part) >= 3 and part not in DEFAULT_FAMILY_EXCLUSIONS
                ),
                None,
            )
            if fam_cand:
                family_counts[fam_cand] = family_counts.get(fam_cand, 0) + 1

        kanban_reqs = tracked_kanban_requirements(
            loader,
            candidate.article,
            candidate.quantity,
            kanban_articles,
        )
        for article, qty_needed in kanban_reqs.items():
            kanban_conso[article] += qty_needed

    def _commit_selected_candidate(
        self,
        *,
        candidate: CandidateOF,
        day: date,
        loader,
        checker,
        material_state,
        projected_buffer: dict[str, float],
        incoming_buffer: dict[date, dict[str, int]],
        family_counts: dict[str, int],
        kanban_conso: dict[str, float],
        kanban_articles: set[str],
        shortage_articles: set[str],
        used_hours: float,
        last_article: Optional[str],
        earliest_blocked_due: Optional[date],
        deviation_marked: bool,
        immediate_components: bool,
        immediate_reference_day: Optional[date],
        blocking_components_mode: str,
    ) -> tuple[float, Optional[str], bool]:
        _status, _reason, direct_components, requirements, _buffer_shortage = self._evaluate_candidate_material_status(
            loader,
            checker,
            candidate,
            day,
            material_state,
            projected_buffer,
            immediate_components=immediate_components,
            immediate_reference_day=immediate_reference_day,
            blocking_components_mode=blocking_components_mode,
        )

        candidate.reason = ""
        is_ferme = getattr(candidate, "statut_num", 3) == 1
        candidate.blocking_components = "" if is_ferme else direct_components
        deviation_marked = self._mark_candidate_deviation(
            candidate,
            earliest_blocked_due,
            deviation_marked,
            current_day=day,
        )

        used_hours = self._assign_candidate_time(candidate, last_article, used_hours, day)
        last_article = candidate.article

        self._update_family_and_kanban_counters(
            loader,
            candidate,
            family_counts,
            kanban_conso,
            kanban_articles,
        )

        reserve_candidate_components(loader, checker, candidate, day, material_state)
        for article, qty in requirements.items():
            projected_buffer[article] -= qty

        if candidate.is_buffer_bdh:
            availability_day = next_workday(day)
            incoming_buffer[availability_day][candidate.article] += candidate.quantity
            if candidate.article in shortage_articles:
                projected_buffer[candidate.article] += candidate.quantity
                if projected_buffer[candidate.article] >= BUFFER_THRESHOLDS[candidate.article]:
                    shortage_articles.remove(candidate.article)

        return used_hours, last_article, deviation_marked

    def _place_blocked_candidates_on_day(self, unscheduled: list[CandidateOF], day: date, plan: DaySchedule) -> None:
        for candidate in unscheduled:
            if candidate.scheduled_day is None and candidate.blocking_components:
                candidate.scheduled_day = day
                plan.assignments.append(candidate)

    def schedule_day(
        self,
        day: date,
        candidates: list[CandidateOF],
        loader,
        checker,
        projected_buffer: dict[str, float],
        incoming_buffer: dict[date, dict[str, int]],
        material_state,
        alerts: list[str],
        is_last_day: bool = False,
        immediate_components: bool = False,
        immediate_reference_day: Optional[date] = None,
        blocking_components_mode: str = "blocked",
        consumed_hours: float = 0.0,
        trace_enabled: bool = False,
    ) -> DaySchedule:
        plan = DaySchedule(line=self.line_name, day=day)
        used_hours = consumed_hours
        earliest_blocked_due: Optional[date] = None
        deviation_marked = False

        unscheduled = [c for c in candidates if c.scheduled_day is None and c.charge_hours > 0]
        unscheduled = self._select_active_candidates_for_day(
            unscheduled,
            day,
            is_last_day=is_last_day,
        )
        last_article = None
        
        family_counts = {}
        kanban_articles = DEFAULT_KANBAN_ARTICLES
        kanban_conso = {a: 0.0 for a in kanban_articles}

        shortage_articles = {
            article
            for article, threshold in BUFFER_THRESHOLDS.items()
            if projected_buffer.get(article, 0.0) < threshold
        }

        while unscheduled and used_hours < self.capacity_hours:
            def sort_key(candidate: CandidateOF) -> tuple:
                return generic_sort_key(
                    candidate,
                    last_article,
                    loader,
                    family_counts,
                    kanban_conso,
                    kanban_articles,
                    tracked_kanban_requirements,
                    shortage_articles,
                    current_day=day,
                )

            unscheduled.sort(key=sort_key)

            candidate_idx, earliest_blocked_due = self._pick_next_schedulable_candidate_index(
                unscheduled,
                day=day,
                used_hours=used_hours,
                last_article=last_article,
                loader=loader,
                checker=checker,
                material_state=material_state,
                projected_buffer=projected_buffer,
                immediate_components=immediate_components,
                immediate_reference_day=immediate_reference_day,
                blocking_components_mode=blocking_components_mode,
                earliest_blocked_due=earliest_blocked_due,
            )

            if candidate_idx == -1:
                break
                
            candidate = unscheduled.pop(candidate_idx)
            plan.assignments.append(candidate)

            # Compute and store decision trace if enabled
            if trace_enabled:
                candidate.decision_trace = generic_decision_trace(
                    candidate,
                    last_article,
                    loader,
                    family_counts,
                    kanban_conso,
                    kanban_articles,
                    tracked_kanban_requirements,
                    shortage_articles,
                    current_day=day,
                )

            used_hours, last_article, deviation_marked = self._commit_selected_candidate(
                candidate=candidate,
                day=day,
                loader=loader,
                checker=checker,
                material_state=material_state,
                projected_buffer=projected_buffer,
                incoming_buffer=incoming_buffer,
                family_counts=family_counts,
                kanban_conso=kanban_conso,
                kanban_articles=kanban_articles,
                shortage_articles=shortage_articles,
                used_hours=used_hours,
                last_article=last_article,
                earliest_blocked_due=earliest_blocked_due,
                deviation_marked=deviation_marked,
                immediate_components=immediate_components,
                immediate_reference_day=immediate_reference_day,
                blocking_components_mode=blocking_components_mode,
            )

        # Place blocked candidates on the day without consuming capacity.
        # They appear in the planning (grayed) but their charge is not engaged.
        self._place_blocked_candidates_on_day(unscheduled, day, plan)

        self._handle_under_capacity(plan, day, incoming_buffer, alerts)

        return plan
