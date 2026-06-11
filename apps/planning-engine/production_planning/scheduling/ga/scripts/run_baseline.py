"""Lightweight baseline benchmark runner.

Runs greedy and GA on synthetic data, outputs JSON metrics for BASELINE.md.
Reuses the existing benchmark.py infrastructure.
"""

from __future__ import annotations

import json
import time
from datetime import date, timedelta
from unittest.mock import MagicMock

from ..benchmark import BenchmarkRun
from ..chromosome import make_individual
from ..config import GAConfig
from ..decoder import GAContext
from ..engine import run_ga
from ..fitness import evaluate, FitnessMetrics
from ...models import CandidateOF


def _make_context(
    n_of: int = 20,
    n_days: int = 5,
    n_lines: int = 2,
    ga_config: GAConfig | None = None,
) -> GAContext:
    """Construct a synthetic GA context matching profile_ga.py dimensions."""
    workdays = [date(2026, 4, 27) + timedelta(days=i) for i in range(n_days)]

    candidates: list[CandidateOF] = []
    by_line: dict[str, list[str]] = {}
    articles = ["ART_A", "ART_B", "ART_C"]

    for i in range(n_of):
        line = f"PP_{830 if i % n_lines == 0 else 153}"
        article = articles[i % len(articles)]
        due = workdays[i % n_days]
        cand = CandidateOF(
            num_of=f"OF_{i:03d}",
            article=article,
            description=f"Desc {article}",
            line=line,
            due_date=due,
            quantity=10.0,
            charge_hours=2.0 + (i % 3),
        )
        candidates.append(cand)
        by_line.setdefault(line, []).append(cand.num_of)

    line_capacities = {line: 14.0 for line in by_line}
    line_min_open = {line: 0.0 for line in by_line}

    return GAContext(
        candidates=candidates,
        candidates_by_id={c.num_of: c for c in candidates},
        workdays=workdays,
        line_capacities=line_capacities,
        line_min_open=line_min_open,
        by_line=by_line,
        loader=MagicMock(),
        checker=MagicMock(),
        receptions_by_day={},
        initial_stock={},
        weights={"w1": 0.85, "w2": 0.10, "w3": 0.05, "w4": 0.15},
        ga_config=ga_config or GAConfig(),
    )


def _make_ga_config(**kwargs) -> GAConfig:
    """Build a valid GAConfig with auto-adjusted seed counts."""
    if "population_size" in kwargs:
        pop = kwargs["population_size"]
        kwargs.setdefault("seed_greedy_count", 1)
        kwargs.setdefault("seed_greedy_variants", max(1, pop // 10))
        kwargs.setdefault(
            "seed_random_count",
            pop - kwargs["seed_greedy_count"] - kwargs["seed_greedy_variants"],
        )
    return GAConfig(**kwargs)


def _run_to_dict(run: BenchmarkRun, algorithm: str) -> dict:
    return {
        "algorithm": algorithm,
        "run_id": run.run_id,
        "elapsed_seconds": round(run.elapsed_seconds, 3),
        "score": round(run.score, 6),
        "taux_service": round(run.taux_service, 4),
        "taux_ouverture": round(run.taux_ouverture, 4),
        "nb_late": run.nb_late,
        "nb_unscheduled": run.nb_unscheduled,
        "nb_blocked_components": run.nb_blocked_components,
        "nb_jit": run.nb_jit,
        "nb_changements_serie": run.nb_changements_serie,
    }


def main() -> None:
    ga_config = _make_ga_config(population_size=100, max_generations=20)
    ctx = _make_context(n_of=20, n_days=5, n_lines=2, ga_config=ga_config)
    ctx.seed_genes = {f"OF_{i:03d}": i % 5 for i in range(20)}  # type: ignore[attr-defined]

    # --- Greedy baseline ---
    seed = make_individual(ctx.seed_genes)  # type: ignore[attr-defined]
    greedy_result: FitnessMetrics = evaluate(seed, ctx)

    greedy_run = BenchmarkRun(
        algorithm="greedy",
        run_id=0,
        score=greedy_result.score,
        taux_service=greedy_result.taux_service,
        taux_ouverture=greedy_result.taux_ouverture,
        nb_jit=greedy_result.nb_jit,
        nb_changements_serie=greedy_result.nb_changements_serie,
        nb_late=greedy_result.nb_late,
        nb_unscheduled=greedy_result.nb_unscheduled,
        nb_blocked_components=greedy_result.nb_blocked_components,
        elapsed_seconds=0.0,
    )

    # --- GA runs ---
    n_runs = 3
    ga_runs: list[dict] = []
    total_ga_time = 0.0
    best_ga_score = -float("inf")
    best_ga_run = None

    for run_id in range(n_runs):
        start = time.perf_counter()
        result = run_ga(ctx)
        elapsed = time.perf_counter() - start

        metrics = result.best.metrics or FitnessMetrics()
        run_dict = _run_to_dict(
            BenchmarkRun(
                algorithm="ga",
                run_id=run_id,
                score=metrics.score,
                taux_service=metrics.taux_service,
                taux_ouverture=metrics.taux_ouverture,
                nb_jit=metrics.nb_jit,
                nb_changements_serie=metrics.nb_changements_serie,
                nb_late=metrics.nb_late,
                nb_unscheduled=metrics.nb_unscheduled,
                nb_blocked_components=metrics.nb_blocked_components,
                elapsed_seconds=elapsed,
            ),
            "ga",
        )
        ga_runs.append(run_dict)
        total_ga_time += elapsed

        if metrics.score > best_ga_score:
            best_ga_score = metrics.score
            best_ga_run = run_dict

    # --- Aggregate output ---
    output = {
        "context": {
            "n_of": 20,
            "n_days": 5,
            "n_lines": 2,
            "population_size": 100,
            "max_generations": 20,
            "n_ga_runs": n_runs,
        },
        "greedy": _run_to_dict(greedy_run, "greedy"),
        "ga_runs": ga_runs,
        "ga_summary": {
            "mean_elapsed_seconds": round(total_ga_time / n_runs, 3),
            "total_elapsed_seconds": round(total_ga_time, 3),
            "best_run": best_ga_run,
        },
    }

    print(json.dumps(output, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
