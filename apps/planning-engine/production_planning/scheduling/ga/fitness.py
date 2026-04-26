"""Fonction de fitness pour l'algorithme génétique.

Calcule le score d'un individu à partir de son planning décodé.
Phase 1 : implémentation mono-objectif pondérée.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .chromosome import Individual
    from .decoder import GAContext


@dataclass
class FitnessMetrics:
    """Métriques détaillées d'un individu."""

    taux_service: float = 0.0
    taux_ouverture: float = 0.0
    nb_jit: int = 0
    nb_changements_serie: int = 0
    nb_late: int = 0
    nb_unscheduled: int = 0
    nb_blocked_components: int = 0
    setup_penalty: float = 0.0
    late_penalty: float = 0.0
    component_violation_penalty: float = 0.0
    score: float = 0.0


def _compute_taux_service(plannings: dict, candidates: list) -> float:
    """Taux de service = proportion d'OF planifiés à temps."""
    if not candidates:
        return 0.0
    served = sum(
        1
        for c in candidates
        if c.scheduled_day is not None and c.scheduled_day <= c.due_date
    )
    return served / len(candidates)


def _compute_taux_ouverture(
    plannings: dict,
    line_capacities: dict,
    workdays: list,
) -> float:
    """Taux d'ouverture = heures engagées / capacité totale."""
    total_engaged = 0.0
    total_capacity = 0.0
    for line, ofs in plannings.items():
        engaged = sum(c.charge_hours for c in ofs if not c.blocking_components)
        total_engaged += engaged
        total_capacity += line_capacities.get(line, 14.0) * len(workdays)
    if total_capacity == 0:
        return 0.0
    return total_engaged / total_capacity


def _count_setups(plannings: dict) -> int:
    """Compte les changements de série (transition article) par ligne/jour."""
    setups = 0
    for line, ofs in plannings.items():
        # Grouper par jour
        by_day: dict = {}
        for c in ofs:
            d = c.scheduled_day
            if d is not None:
                by_day.setdefault(d, []).append(c)
        for day, day_ofs in by_day.items():
            day_ofs.sort(key=lambda c: (c.start_hour or 0.0, c.num_of))
            for i in range(1, len(day_ofs)):
                if day_ofs[i].article != day_ofs[i - 1].article:
                    setups += 1
    return setups


def _count_jit(plannings: dict) -> int:
    """Compte les OF planifiés exactement le jour de leur échéance."""
    return sum(
        1
        for ofs in plannings.values()
        for c in ofs
        if c.scheduled_day == c.due_date
    )


def _count_late(plannings: dict) -> int:
    """Compte les OF planifiés après leur échéance."""
    return sum(
        1
        for ofs in plannings.values()
        for c in ofs
        if c.scheduled_day is not None and c.scheduled_day > c.due_date
    )


def evaluate(individual: "Individual", ctx: "GAContext") -> FitnessMetrics:
    """Évalue la fitness d'un individu.

    Args:
        individual: Individu à évaluer.
        ctx: Contexte d'évaluation.

    Returns:
        FitnessMetrics avec score agrégé.
    """
    from .decoder import decode

    # Décoder si nécessaire (avec cache)
    if individual.decoded is None or individual.cache_key is None:
        individual.decoded = decode(individual, ctx)
        from .chromosome import hash_genes
        individual.cache_key = hash_genes(individual.genes)

    decoded = individual.decoded
    plannings = decoded.plannings

    taux_service = _compute_taux_service(plannings, ctx.candidates)
    taux_ouverture = _compute_taux_ouverture(plannings, ctx.line_capacities, ctx.workdays)
    nb_setups = _count_setups(plannings)
    nb_jit = _count_jit(plannings)
    nb_late = _count_late(plannings)
    nb_unscheduled = len(decoded.unscheduled)
    nb_blocked = sum(
        1
        for ofs in plannings.values()
        for c in ofs
        if c.blocking_components
    )

    # Pénalités
    setup_penalty = nb_setups * ctx.ga_config.setup_cost
    late_penalty = nb_late * ctx.ga_config.late_weight
    component_violation_penalty = nb_blocked * ctx.ga_config.component_violation_weight

    # Score agrégé (mêmes poids que le V1, enrichis)
    w = ctx.weights
    total_assignments = sum(len(ofs) for ofs in plannings.values())
    jit_rate = nb_jit / max(1, total_assignments)

    score = (
        taux_service * w.get("w1", 0.7)
        + taux_ouverture * w.get("w2", 0.2)
        - (nb_unscheduled / max(1, len(ctx.candidates))) * w.get("w3", 0.1)
        + jit_rate * w.get("w4", 0.15)
        - setup_penalty * 0.01
        - late_penalty * 0.01
        - component_violation_penalty * 0.01
    )

    metrics = FitnessMetrics(
        taux_service=taux_service,
        taux_ouverture=taux_ouverture,
        nb_jit=nb_jit,
        nb_changements_serie=nb_setups,
        nb_late=nb_late,
        nb_unscheduled=nb_unscheduled,
        nb_blocked_components=nb_blocked,
        setup_penalty=setup_penalty,
        late_penalty=late_penalty,
        component_violation_penalty=component_violation_penalty,
        score=round(score, 6),
    )

    individual.fitness = metrics.score
    individual.metrics = metrics
    return metrics
