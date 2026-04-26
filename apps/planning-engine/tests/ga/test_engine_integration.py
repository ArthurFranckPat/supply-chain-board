"""Tests d'intégration pour le moteur AG complet.

Vérifient que run_ga termine, converge, et bat ou égale le glouton
sur des instances synthétiques.
"""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

import pytest

from production_planning.scheduling.ga.chromosome import make_individual
from production_planning.scheduling.ga.config import GAConfig
from production_planning.scheduling.ga.decoder import GAContext
from production_planning.scheduling.ga.engine import run_ga
from production_planning.scheduling.ga.fitness import evaluate
from production_planning.scheduling.models import CandidateOF


def _make_ga_config(**kwargs) -> GAConfig:
    """Construit un GAConfig valide pour les tests.

    Ajuste automatiquement les seed counts si population_size est fourni.
    """
    if "population_size" in kwargs:
        pop = kwargs["population_size"]
        kwargs.setdefault("seed_greedy_count", 1)
        kwargs.setdefault("seed_greedy_variants", max(1, pop // 10))
        kwargs.setdefault("seed_random_count", pop - kwargs["seed_greedy_count"] - kwargs["seed_greedy_variants"])
    return GAConfig(**kwargs)


def _make_context(
    n_of: int = 10,
    n_days: int = 5,
    n_lines: int = 2,
    seed_genes: dict[str, int] | None = None,
    ga_config: GAConfig | None = None,
) -> GAContext:
    """Construit un contexte synthétique pour les tests."""
    workdays = [date(2026, 4, 27) + __import__("datetime").timedelta(days=i) for i in range(n_days)]

    candidates = []
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
            charge_hours=2.0 + (i % 3),  # 2-4 heures
        )
        candidates.append(cand)
        by_line.setdefault(line, []).append(cand.num_of)

    line_capacities = {line: 14.0 for line in by_line}
    line_min_open = {line: 0.0 for line in by_line}

    ctx = GAContext(
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

    if seed_genes is not None:
        ctx.seed_genes = seed_genes  # type: ignore[attr-defined]

    return ctx


class TestRunGATerminates:
    def test_terminates_on_synthetic_s(self):
        """L'AG termine en < 10s sur une petite instance."""
        import time

        ctx = _make_context(n_of=10, n_days=3, ga_config=_make_ga_config(max_generations=10))
        ctx.seed_genes = {f"OF_{i:03d}": i % 3 for i in range(10)}  # type: ignore[attr-defined]

        start = time.perf_counter()
        result = run_ga(ctx)
        elapsed = time.perf_counter() - start

        assert elapsed < 10.0
        assert result.n_generations_run <= 10
        assert result.best is not None
        assert result.best.fitness is not None

    def test_terminates_without_seed(self):
        """L'AG fonctionne même sans seed glouton."""
        ctx = _make_context(n_of=5, n_days=3, ga_config=_make_ga_config(max_generations=5))
        # Pas de seed_genes

        result = run_ga(ctx)
        assert result.best is not None
        assert result.best.fitness is not None
        assert result.n_generations_run > 0


class TestRunGABeatsGreedy:
    def test_beats_or_equals_greedy(self):
        """Sur une instance synthétique, fitness AG ≥ fitness glouton."""
        # Créer un seed glouton "mauvais" (tout sur jour 0)
        n_of = 15
        seed_genes = {f"OF_{i:03d}": 0 for i in range(n_of)}

        ctx = _make_context(
            n_of=n_of,
            n_days=5,
            seed_genes=seed_genes,
            ga_config=_make_ga_config(max_generations=20, population_size=30),
        )

        # Évaluer le seed seul
        seed = make_individual(seed_genes)
        evaluate(seed, ctx)
        seed_fitness = seed.fitness

        # Lancer l'AG
        result = run_ga(ctx)

        assert result.best.fitness is not None
        assert result.best.fitness >= seed_fitness

    def test_elitism_preserves_best(self):
        """L'élitisme garantit que le meilleur ne régresse jamais."""
        seed_genes = {"OF_000": 0, "OF_001": 1, "OF_002": 0}

        ctx = _make_context(
            n_of=3,
            n_days=3,
            seed_genes=seed_genes,
            ga_config=_make_ga_config(max_generations=10, population_size=10, elitism_rate=0.1),
        )

        result = run_ga(ctx)

        # Le meilleur de l'historique ne doit jamais diminuer
        best_so_far = float("-inf")
        for stats in result.history:
            assert stats.best_fitness >= best_so_far - 1e-9  # tolérance numérique
            best_so_far = max(best_so_far, stats.best_fitness)


class TestRunGADeterministic:
    def test_deterministic_with_seed(self):
        """Deux runs avec la même graine donnent le même résultat."""
        seed_genes = {f"OF_{i:03d}": i % 3 for i in range(8)}

        ctx1 = _make_context(
            n_of=8,
            n_days=3,
            seed_genes=seed_genes,
            ga_config=_make_ga_config(random_seed=42, max_generations=10, population_size=20),
        )
        ctx2 = _make_context(
            n_of=8,
            n_days=3,
            seed_genes=seed_genes,
            ga_config=_make_ga_config(random_seed=42, max_generations=10, population_size=20),
        )

        result1 = run_ga(ctx1)
        result2 = run_ga(ctx2)

        assert result1.best.fitness == pytest.approx(result2.best.fitness)
        assert result1.n_generations_run == result2.n_generations_run
        assert result1.converged_early == result2.converged_early


class TestProgressCallback:
    def test_progress_callback_invoked(self):
        """Le callback de progression est appelé pendant le run."""
        calls = []

        def callback(gen, stats):
            calls.append((gen, stats))

        ctx = _make_context(
            n_of=5,
            n_days=3,
            ga_config=_make_ga_config(max_generations=5, population_size=10),
        )
        ctx.seed_genes = {"OF_000": 0, "OF_001": 1, "OF_002": 0, "OF_003": 1, "OF_004": 0}  # type: ignore[attr-defined]

        run_ga(ctx, progress_callback=callback)

        assert len(calls) > 0
        for gen, stats in calls:
            assert isinstance(gen, int)
            assert stats.generation == gen
