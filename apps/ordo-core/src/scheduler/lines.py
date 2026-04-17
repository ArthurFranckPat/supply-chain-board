from abc import ABC, abstractmethod
from datetime import date, timedelta
from typing import Optional

from .models import CandidateOF, DaySchedule
from .calendar import next_workday
from .material import (
    BUFFER_THRESHOLDS,
    availability_status,
    tracked_bdh_requirements,
    tracked_kanban_requirements,
    format_buffer_shortage_reason,
    reserve_candidate_components,
    extract_blocking_components,
    compute_direct_component_shortages,
)
from .heuristics import generic_sort_key

LINE_CAPACITY_HOURS = 14.0
LINE_MIN_OPEN_HOURS = 3.0  # Seuil minimum pour ouvrir une ligne
SETUP_TIME_HOURS = 0.25


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
    ) -> DaySchedule:
        plan = DaySchedule(line=self.line_name, day=day)
        used_hours = 0.0
        earliest_blocked_due: Optional[date] = None
        deviation_marked = False

        unscheduled = [c for c in candidates if c.scheduled_day is None and c.charge_hours > 0]

        # JIT deferral : sur les jours non-derniers, exclure les OF dont le due_date
        # est trop loin (> J+1). Ils seront planifiés plus tard. Le dernier jour,
        # on prend tout pour ne pas laisser d'OF non planifiés.
        # Cependant, si les OF "actifs" ne suffisent pas à remplir la ligne,
        # on complète avec les différés les plus urgents.
        if not is_last_day:
            deferred = []
            active = []
            for c in unscheduled:
                days_until_due = (c.due_date - day).days
                if days_until_due > 1:
                    deferred.append(c)
                else:
                    active.append(c)
            # Si rien d'actif, prendre les plus urgents parmi les différés
            if not active and deferred:
                deferred.sort(key=lambda c: c.due_date)
                active.append(deferred.pop(0))
            # Compléter avec les différés si les actifs ne suffisent pas à
            # atteindre un seuil raisonnable d'ouverture (50% de la capacité)
            active_hours = sum(c.charge_hours for c in active)
            fill_threshold = max(7.0, self.capacity_hours * 0.5)
            if active_hours < fill_threshold and deferred:
                deferred.sort(key=lambda c: c.due_date)
                while deferred and active_hours < fill_threshold:
                    c = deferred.pop(0)
                    active.append(c)
                    active_hours += c.charge_hours
            unscheduled = active
        last_article = None
        
        family_counts = {}
        kanban_articles = {"11028877", "11033880", "11033919"}
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
            
            candidate_idx = -1
            for i, c in enumerate(unscheduled):
                setup_time = SETUP_TIME_HOURS if last_article and c.article != last_article else 0.0
                if used_hours + c.charge_hours + setup_time <= self.capacity_hours:
                    status, reason = availability_status(
                        checker,
                        loader,
                        c,
                        day,
                        material_state,
                        immediate_components=immediate_components,
                        immediate_reference_day=immediate_reference_day,
                    )
                    direct_components = (
                        compute_direct_component_shortages(loader, c, material_state)
                        if blocking_components_mode in {"direct", "both"}
                        else ""
                    )
                    if status != "blocked":
                        requirements = tracked_bdh_requirements(loader, c.article, c.quantity)
                        buffer_shortage = any(projected_buffer.get(article, 0.0) < qty for article, qty in requirements.items())
                        if not buffer_shortage:
                            candidate_idx = i
                            break
                        else:
                            # Buffer BDH insuffisant mais composants OK -> planifiable avec alerte
                            # On accepte le candidat pour maximiser le taux d'ouverture
                            candidate_idx = i
                            break
                    else:
                        c.reason = reason
                        blocked_components = extract_blocking_components(reason)
                        if blocking_components_mode == "blocked":
                            c.blocking_components = blocked_components
                        elif blocking_components_mode == "direct":
                            c.blocking_components = direct_components
                        else:
                            components = []
                            for part in f"{blocked_components}, {direct_components}".split(","):
                                chunk = part.strip()
                                if chunk and chunk not in components:
                                    components.append(chunk)
                            c.blocking_components = ", ".join(components)
                        if earliest_blocked_due is None or c.due_date < earliest_blocked_due:
                            earliest_blocked_due = c.due_date

            if candidate_idx == -1:
                break
                
            candidate = unscheduled.pop(candidate_idx)

            status, reason = availability_status(
                checker,
                loader,
                candidate,
                day,
                material_state,
                immediate_components=immediate_components,
                immediate_reference_day=immediate_reference_day,
            )
            direct_components = (
                compute_direct_component_shortages(loader, candidate, material_state)
                if blocking_components_mode in {"direct", "both"}
                else ""
            )
            requirements = tracked_bdh_requirements(loader, candidate.article, candidate.quantity)
            
            candidate.reason = ""
            is_ferme = getattr(candidate, 'statut_num', 3) == 1
            candidate.blocking_components = "" if is_ferme else direct_components
            deviation_marked = self._mark_candidate_deviation(candidate, earliest_blocked_due, deviation_marked, current_day=day)
                
            used_hours = self._assign_candidate_time(candidate, last_article, used_hours, day)
            
            plan.assignments.append(candidate)
            last_article = candidate.article
            
            art_info = loader.get_article(candidate.article)
            if art_info:
                desc = art_info.description.upper()
                parts = desc.split()
                fam_cand = next((p for p in parts if len(p) >= 3 and p not in ["ESH", "ESHKIT", "ESHGPE", "CBL", "CPT", "BDH", "BIP", "GP", "PNEU", "BOIT"]), None)
                if fam_cand:
                    family_counts[fam_cand] = family_counts.get(fam_cand, 0) + 1
                    
            kanban_reqs = tracked_kanban_requirements(loader, candidate.article, candidate.quantity, kanban_articles)
            for k_art, qty_needed in kanban_reqs.items():
                kanban_conso[k_art] += qty_needed

            reserve_candidate_components(loader, checker, candidate, day, material_state)
            
            for article, qty in requirements.items():
                projected_buffer[article] -= qty

            if candidate.is_buffer_bdh:
                availability_day = next_workday(day)
                incoming_buffer[availability_day][candidate.article] += candidate.quantity
                
            if candidate.is_buffer_bdh and candidate.article in shortage_articles:
                projected_buffer[candidate.article] += candidate.quantity
                if projected_buffer[candidate.article] >= BUFFER_THRESHOLDS[candidate.article]:
                    shortage_articles.remove(candidate.article)

        # Place blocked candidates on the day without consuming capacity.
        # They appear in the planning (grayed) but their charge is not engaged.
        for c in unscheduled:
            if c.scheduled_day is None and c.blocking_components:
                c.scheduled_day = day
                plan.assignments.append(c)

        self._handle_under_capacity(plan, day, incoming_buffer, alerts)

        return plan
