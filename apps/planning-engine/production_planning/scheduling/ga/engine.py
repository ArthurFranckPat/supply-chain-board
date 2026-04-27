"""Moteur principal de l'algorithme génétique — boucle évolutive complète.

Phase 2 : population, opérateurs, élitisme, convergence.
Phase 5+ : parallélisation de l'évaluation via ThreadPoolExecutor + cache global.
"""

from __future__ import annotations

import os
import random
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable

from .chromosome import Individual, clone
from .decoder import GAContext, DecodedPlanning
from .fitness import evaluate, FitnessMetrics
from .operators.crossover import crossover_dispatch
from .operators.mutation import mutate
from .operators.selection import tournament_select
from .repair import repair
from .seeding import build_initial_population


@dataclass
class GenerationStats:
    """Statistiques d'une génération."""

    generation: int
    best_fitness: float
    mean_fitness: float
    median_fitness: float
    diversity: float
    elapsed_seconds: float


@dataclass
class GAResult:
    """Résultat complet d'un run AG."""

    best: Individual
    best_planning: DecodedPlanning
    metrics: FitnessMetrics
    history: list[GenerationStats] = field(default_factory=list)
    n_generations_run: int = 0
    elapsed_seconds: float = 0.0
    converged_early: bool = False


def _compute_diversity(population: list[Individual], sample_size: int = 20) -> float:
    """Mesure la diversité comme 1 - chevauchement moyen des genes."""
    if len(population) < 2:
        return 0.0

    rng = random.Random(42)
    n_genes = len(population[0].genes)
    if n_genes == 0:
        return 0.0

    total_overlap = 0.0
    n_pairs = 0
    for _ in range(sample_size):
        i, j = rng.sample(range(len(population)), 2)
        p1, p2 = population[i], population[j]
        overlap = sum(1 for k in p1.genes if p1.genes[k] == p2.genes.get(k))
        total_overlap += overlap / n_genes
        n_pairs += 1

    return 1.0 - (total_overlap / n_pairs)


def _evaluate_population(
    population: list[Individual],
    ctx: GAContext,
    workers: int = 1,
) -> None:
    """Évalue une population avec cache global et parallélisation optionnelle.

    Args:
        population: Liste d'individus à évaluer.
        ctx: Contexte d'évaluation.
        workers: Nombre de workers threads (> 1 = parallélisé).
    """
    eval_cache: dict[str, Individual] = {}

    def _eval_one(ind: Individual) -> None:
        if ind.fitness is not None:
            return
        if ind.cache_key in eval_cache:
            cached = eval_cache[ind.cache_key]
            ind.fitness = cached.fitness
            ind.metrics = cached.metrics
            ind.decoded = cached.decoded
            return
        evaluate(ind, ctx)
        eval_cache[ind.cache_key] = ind

    if workers > 1:
        with ThreadPoolExecutor(max_workers=workers) as executor:
            list(executor.map(_eval_one, population))
    else:
        for ind in population:
            _eval_one(ind)


def run_ga(
    ctx: GAContext,
    progress_callback: Callable | None = None,
) -> GAResult:
    """Lance l'algorithme génétique complet.

    Boucle principale :
        1. Initialiser la population.
        2. Évaluer chaque individu (avec cache + threads).
        3. Pour chaque génération : élitisme, reproduction, évaluation.
        4. Retourner le meilleur individu.

    Invariant : le meilleur individu trouvé est toujours ≥ seed glouton.

    Args:
        ctx: Contexte d'évaluation.
        progress_callback: Callback optionnel (gen, stats).

    Returns:
        GAResult avec le meilleur individu, l'historique et les stats.
    """
    config = ctx.ga_config
    rng = random.Random(config.random_seed) if config.random_seed is not None else random.Random()
    ctx.rng = rng  # type: ignore[attr-defined]

    # Déterminer le nombre de workers
    workers = config.workers
    if workers is None or workers < 1:
        workers = os.cpu_count() or 1
        # Limiter à la taille de la population pour éviter l'overhead
        workers = min(workers, config.population_size)

    start_time = time.perf_counter()

    # 1. Population initiale
    seed_genes = getattr(ctx, "seed_genes", None)
    population = build_initial_population(ctx, seed_genes=seed_genes)

    # 2. Évaluation initiale (parallèle)
    _evaluate_population(population, ctx, workers=workers)

    # Meilleur individu global
    best_ever = max(population, key=lambda i: i.fitness if i.fitness is not None else float("-inf"))
    no_improvement = 0
    history: list[GenerationStats] = []

    # 3. Boucle évolutive
    for gen in range(config.max_generations):
        gen_start = time.perf_counter()

        # Élitisme
        elite_n = max(1, int(len(population) * config.elitism_rate))
        sorted_pop = sorted(
            population,
            key=lambda i: i.fitness if i.fitness is not None else float("-inf"),
            reverse=True,
        )
        elite = sorted_pop[:elite_n]
        new_population = list(elite)

        # Reproduction
        while len(new_population) < config.population_size:
            p1 = tournament_select(population, config.tournament_size, rng)
            p2 = tournament_select(population, config.tournament_size, rng)

            if rng.random() < config.crossover_probability:
                child = crossover_dispatch(p1, p2, ctx)
            else:
                child = clone(p1)

            mutate(child, ctx)
            repair(child, ctx)
            new_population.append(child)

        # Évaluation parallèle de la nouvelle population
        _evaluate_population(new_population, ctx, workers=workers)

        population = new_population
        for ind in population:
            ind.age += 1

        # Stats
        fitnesses = [i.fitness for i in population if i.fitness is not None]
        best_gen = max(population, key=lambda i: i.fitness if i.fitness is not None else float("-inf"))
        mean_fit = sum(fitnesses) / len(fitnesses) if fitnesses else 0.0
        median_fit = sorted(fitnesses)[len(fitnesses) // 2] if fitnesses else 0.0
        diversity = _compute_diversity(population)

        # Early stopping
        if best_gen.fitness is not None and best_ever.fitness is not None:
            if best_gen.fitness > best_ever.fitness + config.early_stop_min_delta:
                best_ever = best_gen
                no_improvement = 0
            else:
                no_improvement += 1

        gen_elapsed = time.perf_counter() - gen_start
        history.append(
            GenerationStats(
                generation=gen,
                best_fitness=best_gen.fitness if best_gen.fitness is not None else 0.0,
                mean_fitness=mean_fit,
                median_fitness=median_fit,
                diversity=diversity,
                elapsed_seconds=gen_elapsed,
            )
        )

        if progress_callback is not None:
            try:
                progress_callback(gen, history[-1])
            except Exception:
                pass

        if no_improvement >= config.early_stop_patience:
            break

    total_elapsed = time.perf_counter() - start_time

    # Ré-évaluer le best_ever pour s'assurer que decoded est à jour
    if best_ever.decoded is None or best_ever.fitness is None:
        evaluate(best_ever, ctx)

    return GAResult(
        best=best_ever,
        best_planning=best_ever.decoded,
        metrics=best_ever.metrics,
        history=history,
        n_generations_run=len(history),
        elapsed_seconds=total_elapsed,
        converged_early=no_improvement >= config.early_stop_patience,
    )
