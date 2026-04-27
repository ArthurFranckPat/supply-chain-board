"""Fixtures synthétiques pour les tests AG.

Instances de taille variable avec paramètres contrôlés :
- synthetic_S : 20 OF, 2 lignes, 3 jours
- synthetic_M : 50 OF, 3 lignes, 5 jours
- synthetic_L : 100 OF, 5 lignes, 8 jours
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from unittest.mock import MagicMock

from production_planning.scheduling.ga.config import GAConfig
from production_planning.scheduling.ga.decoder import GAContext
from production_planning.scheduling.ga.chromosome import make_individual
from production_planning.scheduling.ga.fitness import evaluate, FitnessMetrics
from production_planning.scheduling.models import CandidateOF


def build_synthetic_instance(
    n_of: int = 20,
    n_lines: int = 2,
    n_days: int = 3,
    seed_strategy: str = "uniform",
) -> tuple[GAContext, FitnessMetrics]:
    """Construit une instance synthétique.

    Args:
        n_of: Nombre d'OF candidats.
        n_lines: Nombre de lignes.
        n_days: Nombre de jours.
        seed_strategy: "uniform" (distribué) | "clustered" (tout jour 0)

    Returns:
        (GAContext, FitnessMetrics du seed glouton)
    """
    workdays = [date(2026, 4, 27) + timedelta(days=i) for i in range(n_days)]

    articles = ["ART_A", "ART_B", "ART_C", "ART_D", "ART_E"]
    line_names = [f"PP_{830 + i * 10}" for i in range(n_lines)]

    candidates = []
    by_line: dict[str, list[str]] = {}

    for i in range(n_of):
        line = line_names[i % n_lines]
        article = articles[i % len(articles)]
        due = workdays[i % n_days]
        charge = 2.0 + (i % 4) * 0.5

        cand = CandidateOF(
            num_of=f"OF_{i:04d}",
            article=article,
            description=f"Desc {article}",
            line=line,
            due_date=due,
            quantity=10.0,
            charge_hours=charge,
        )
        candidates.append(cand)
        by_line.setdefault(line, []).append(cand.num_of)

    line_capacities = {line: 14.0 for line in line_names}
    line_min_open = {line: 0.0 for line in line_names}

    loader = MagicMock()
    loader.stocks = {}

    pop_size = min(50, max(20, n_of))
    ga_config = GAConfig(
        population_size=pop_size,
        max_generations=20,
        seed_greedy_count=1,
        seed_greedy_variants=max(1, pop_size // 10),
        seed_random_count=pop_size - 1 - max(1, pop_size // 10),
    )

    ctx = GAContext(
        candidates=candidates,
        candidates_by_id={c.num_of: c for c in candidates},
        workdays=workdays,
        line_capacities=line_capacities,
        line_min_open=line_min_open,
        by_line=by_line,
        loader=loader,
        checker=MagicMock(),
        receptions_by_day={},
        initial_stock={},
        weights={"w1": 0.85, "w2": 0.10, "w3": 0.05, "w4": 0.15},
        ga_config=ga_config,
    )

    # Seed glouton
    if seed_strategy == "uniform":
        seed_genes = {c.num_of: i % n_days for i, c in enumerate(candidates)}
    else:
        seed_genes = {c.num_of: 0 for c in candidates}

    ctx.seed_genes = seed_genes  # type: ignore[attr-defined]

    seed = make_individual(seed_genes)
    greedy_metrics = evaluate(seed, ctx)

    return ctx, greedy_metrics


def synthetic_S() -> tuple[GAContext, FitnessMetrics]:
    """Instance petite : 20 OF, 2 lignes, 3 jours."""
    return build_synthetic_instance(n_of=20, n_lines=2, n_days=3)


def synthetic_M() -> tuple[GAContext, FitnessMetrics]:
    """Instance moyenne : 50 OF, 3 lignes, 5 jours."""
    return build_synthetic_instance(n_of=50, n_lines=3, n_days=5)


def synthetic_L() -> tuple[GAContext, FitnessMetrics]:
    """Instance grande : 100 OF, 5 lignes, 8 jours."""
    return build_synthetic_instance(n_of=100, n_lines=5, n_days=8)


def synthetic_clustered() -> tuple[GAContext, FitnessMetrics]:
    """Instance avec seed glouton "mauvais" (tout sur jour 0) — pour tester l'amélioration AG."""
    return build_synthetic_instance(n_of=30, n_lines=2, n_days=5, seed_strategy="clustered")
