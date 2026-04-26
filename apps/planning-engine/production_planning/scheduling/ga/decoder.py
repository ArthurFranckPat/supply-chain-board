"""Décodage d'un chromosome (Individual) en planning concret.

Transforme un encodage abstrait {num_of → day_index} en une structure
DecodedPlanning où chaque CandidateOF a scheduled_day, start_hour, end_hour.

Le décodage est déterministe et inclut un mécanisme de soft-repair pour
les débordements de capacité et les violations de composants.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

from ..models import CandidateOF
from production_planning.orders.allocation import StockState
from production_planning.scheduling.material import build_material_stock_state, apply_receptions_for_day


@dataclass
class GAContext:
    """Contexte d'évaluation partagé pendant un run AG.

    Tout ce dont l'AG a besoin, calculé une seule fois.
    """

    candidates: list[CandidateOF]
    candidates_by_id: dict[str, CandidateOF]
    workdays: list[date]
    line_capacities: dict[str, float]
    line_min_open: dict[str, float]
    by_line: dict[str, list[str]]  # line → liste de num_of
    loader: Any
    checker: Any
    receptions_by_day: dict[date, list[tuple[str, float]]]
    initial_stock: dict[str, float]
    weights: dict[str, float]
    ga_config: Any  # GAConfig — évite l'import circulaire
    component_checker: Any = None  # GAComponentChecker


@dataclass
class DecodedPlanning:
    """Résultat du décodage d'un individu."""

    plannings: dict[str, list[CandidateOF]]
    unscheduled: list[CandidateOF]
    capacity_violations: list[tuple[str, date, float]] = field(default_factory=list)
    component_violations: list[tuple[str, str, date]] = field(default_factory=list)


SETUP_TIME_HOURS = 0.25


def _intra_day_sort_key(candidate: CandidateOF) -> tuple:
    """Clé de tri déterministe pour l'ordre des OF dans une journée.

    Priorité :
        1. due_date croissante
        2. regroupement par article (même article = adjacence)
        3. num_of (tie-break final)
    """
    return (candidate.due_date, candidate.article, candidate.num_of)


def decode(individual: "Individual", ctx: GAContext) -> DecodedPlanning:
    """Transforme un chromosome en planning concret.

    Algorithme :
        1. Grouper les OF par ligne.
        2. Pour chaque jour, récupérer les OF assignés à ce jour.
        3. Trier intra-jour par due_date, article, num_of.
        4. Vérifier les composants pour chaque OF.
        5. Assigner les heures séquentiellement (avec setup time).
        6. En cas de débordement capacitaire, décaler vers le jour suivant.

    Args:
        individual: Chromosome à décoder.
        ctx: Contexte d'évaluation (capacités, candidats, etc.).

    Returns:
        DecodedPlanning avec plannings, unscheduled et éventuelles violations.
    """
    # Réinitialiser l'état de stock virtuel
    material_state = build_material_stock_state(ctx.loader)

    plannings: dict[str, list[CandidateOF]] = {line: [] for line in ctx.by_line}
    unscheduled: list[CandidateOF] = []
    capacity_violations: list[tuple[str, date, float]] = []
    component_violations: list[tuple[str, str, date]] = []

    # Index jour → date pour accès rapide
    day_index_to_date = {idx: d for idx, d in enumerate(ctx.workdays)}

    for line, num_ofs in ctx.by_line.items():
        capacity = ctx.line_capacities.get(line, 14.0)

        # Regrouper les OF de cette ligne par jour
        ofs_by_day: dict[int, list[CandidateOF]] = {idx: [] for idx in range(len(ctx.workdays))}
        for num_of in num_ofs:
            candidate = ctx.candidates_by_id.get(num_of)
            if candidate is None:
                continue
            day_idx = individual.genes.get(num_of, -1)
            if day_idx is not None and 0 <= day_idx < len(ctx.workdays):
                ofs_by_day[day_idx].append(candidate)
            else:
                # Jour invalide → non planifié
                unscheduled.append(candidate)

        # Traiter chaque jour dans l'ordre chronologique
        for day_idx in range(len(ctx.workdays)):
            day = day_index_to_date[day_idx]
            apply_receptions_for_day(material_state, ctx.receptions_by_day, day)

            ofs_jour = ofs_by_day[day_idx]
            ofs_jour.sort(key=_intra_day_sort_key)

            h_courant = 0.0
            last_article: Optional[str] = None

            for candidate in ofs_jour:
                setup = SETUP_TIME_HOURS if last_article and candidate.article != last_article else 0.0
                needed = h_courant + setup + candidate.charge_hours

                if needed > capacity:
                    # Overflow : essayer les jours suivants
                    placed = False
                    for next_idx in range(day_idx + 1, len(ctx.workdays)):
                        next_day = day_index_to_date[next_idx]
                        candidate.scheduled_day = next_day
                        candidate.start_hour = 0.0
                        candidate.end_hour = candidate.charge_hours
                        ofs_by_day[next_idx].append(candidate)
                        placed = True
                        break

                    if not placed:
                        candidate.scheduled_day = None
                        candidate.start_hour = None
                        candidate.end_hour = None
                        unscheduled.append(candidate)
                        capacity_violations.append(
                            (line, day, needed - capacity)
                        )
                    continue

                # Vérification des composants (Phase 3)
                if ctx.component_checker is not None:
                    feasible, reason, blocking = ctx.component_checker.evaluate(
                        candidate, day, material_state
                    )
                    if not feasible:
                        candidate.blocking_components = blocking
                        candidate.reason = reason
                        # Placé "bloqué" sans consommer la capacité
                        candidate.scheduled_day = day
                        candidate.start_hour = round(h_courant + setup, 3)
                        candidate.end_hour = round(needed, 3)
                        h_courant = needed
                        last_article = candidate.article
                        plannings[line].append(candidate)
                        component_violations.append(
                            (candidate.num_of, blocking, day)
                        )
                        continue

                # Assignation normale
                candidate.scheduled_day = day
                candidate.start_hour = round(h_courant + setup, 3)
                candidate.end_hour = round(needed, 3)
                h_courant = needed
                last_article = candidate.article
                plannings[line].append(candidate)

                # Réserver les composants
                if ctx.component_checker is not None:
                    ctx.component_checker.reserve(candidate, day, material_state)

    # Recalculer les unscheduled (ceux sans scheduled_day)
    final_unscheduled = [
        c for c in ctx.candidates
        if c.scheduled_day is None
    ]

    return DecodedPlanning(
        plannings=plannings,
        unscheduled=final_unscheduled,
        capacity_violations=capacity_violations,
        component_violations=component_violations,
    )
