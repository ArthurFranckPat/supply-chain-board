"""Moteur principal de l'algorithme génétique.

Phase 1 : boucle minimale — retourne le seed glouton sans évolution.
Les phases ultérieures ajouteront la population, les opérateurs,
la convergence et l'élitisme.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from .chromosome import Individual, make_individual
from .decoder import GAContext, decode, DecodedPlanning
from .fitness import evaluate, FitnessMetrics


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


def run_ga(
    ctx: GAContext,
    progress_callback: Callable | None = None,
) -> GAResult:
    """Lance l'algorithme génétique.

    Phase 1 : retourne le seed glouton sans évolution.
    Le seed est construit à partir du planning glouton fourni dans ctx.

    Args:
        ctx: Contexte d'évaluation (candidats, capacités, etc.).
        progress_callback: Callback optionnel (gen, stats).

    Returns:
        GAResult avec le meilleur individu trouvé.
    """
    import time

    start = time.perf_counter()

    # Phase 1 : utiliser le seed glouton fourni dans le contexte
    seed_genes = getattr(ctx, "seed_genes", None)
    if seed_genes is None:
        # Fallback : tous les OF non planifiés (jour 0)
        seed_genes = {
            c.num_of: 0
            for c in ctx.candidates
        }

    best = make_individual(seed_genes)
    evaluate(best, ctx)

    elapsed = time.perf_counter() - start

    if progress_callback is not None:
        try:
            progress_callback(0, None)
        except Exception:
            pass

    return GAResult(
        best=best,
        best_planning=best.decoded,
        metrics=best.metrics,
        history=[],
        n_generations_run=0,
        elapsed_seconds=elapsed,
        converged_early=True,
    )
