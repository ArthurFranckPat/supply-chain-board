"""cProfile-based AG performance profiler.

Runs the GA on synthetic data and produces a .pstats file for downstream analysis.
No external dependencies — uses only stdlib cProfile + pstats.
"""

from __future__ import annotations

import cProfile
import pstats
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import MagicMock

from ..config import GAConfig
from ..decoder import GAContext
from ..engine import run_ga
from ...models import CandidateOF

PROFILE_OUTPUT = Path(".planning/research/profiling/profile_ga.pstats")


def _make_context(
    n_of: int = 20,
    n_days: int = 5,
    n_lines: int = 2,
    ga_config: GAConfig | None = None,
) -> GAContext:
    """Construct a synthetic GA context for profiling — no ERP data needed."""
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


def main() -> None:
    """Run the GA under cProfile and write .pstats output."""
    PROFILE_OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    ctx = _make_context(n_of=20, n_days=5, n_lines=2, ga_config=_make_ga_config(max_generations=10))
    ctx.seed_genes = {f"OF_{i:03d}": i % 5 for i in range(20)}  # type: ignore[attr-defined]

    print(f"Profiling GA (20 OFs, 5 days, 10 generations)...")
    cProfile.runctx("run_ga(ctx)", globals(), locals(), str(PROFILE_OUTPUT))

    # Quick summary for sanity check
    stats = pstats.Stats(str(PROFILE_OUTPUT))
    stats.sort_stats("cumulative")
    print(f"\nProfile written to: {PROFILE_OUTPUT}")
    print(f"Total calls: {stats.total_calls}")
    print(f"Total time: {stats.total_tt:.3f}s")
    print("\nTop 5 by cumulative time:")
    stats.print_stats(5)


if __name__ == "__main__":
    main()
