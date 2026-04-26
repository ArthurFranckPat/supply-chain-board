"""Module d'algorithme génétique pour l'ordonnancement V2.

Façade publique — le seul point d'entrée que le reste du codebase doit importer.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Callable

from .config import GAConfig, load_ga_config, default_ga_config
from .chromosome import Individual, make_individual, clone, hash_genes, invalidate
from .decoder import decode, DecodedPlanning, GAContext
from .fitness import evaluate, FitnessMetrics
from .engine import run_ga, GAResult, GenerationStats
from .evaluation import PrecomputedData, precompute, FullRecursiveChecker, ApproximateChecker

__all__ = [
    "GAConfig",
    "load_ga_config",
    "default_ga_config",
    "Individual",
    "make_individual",
    "clone",
    "hash_genes",
    "invalidate",
    "decode",
    "DecodedPlanning",
    "GAContext",
    "evaluate",
    "FitnessMetrics",
    "run_ga",
    "GAResult",
    "GenerationStats",
    "PrecomputedData",
    "precompute",
    "FullRecursiveChecker",
    "ApproximateChecker",
    "run_ga_schedule",
]


def run_ga_schedule(
    loader: Any,
    *,
    reference_date: date,
    workdays: list[date],
    candidates: list[Any],
    line_capacities: dict[str, float],
    line_min_open: dict[str, float],
    weights: dict[str, float],
    ga_config: GAConfig | None = None,
    random_seed: int | None = None,
    progress_callback: Callable | None = None,
    checker: Any = None,
    receptions_by_day: dict | None = None,
    by_line: dict[str, list[str]] | None = None,
    seed_genes: dict[str, int] | None = None,
) -> GAResult:
    """Point d'entrée principal pour lancer l'AG depuis le scheduler.

    Assemble le GAContext avec le component_checker approprié.

    Args:
        loader: DataLoader existant.
        reference_date: Date de référence du planning.
        workdays: Liste des jours ouvrés.
        candidates: Liste des OF candidats.
        line_capacities: Capacité journalière par ligne.
        line_min_open: Seuil minimum d'ouverture par ligne.
        weights: Poids fitness (w1..w4).
        ga_config: Configuration AG (défaut si None).
        random_seed: Graine aléatoire optionnelle.
        progress_callback: Callback de progression.
        checker: RecursiveChecker existant.
        receptions_by_day: Réceptions indexées par jour.
        by_line: Mapping ligne → num_of.
        seed_genes: Seed glouton pré-calculé.

    Returns:
        GAResult complet.
    """
    from ..material import build_material_stock_state

    if ga_config is None:
        ga_config = default_ga_config()

    candidates_by_id = {c.num_of: c for c in candidates}
    material_state = build_material_stock_state(loader)

    # Pré-calcul des données (Phase 3)
    precomputed = precompute(
        loader=loader,
        candidates=candidates,
        workdays=workdays,
        receptions_by_day=receptions_by_day or {},
        material_state=material_state,
    )

    # Choix du checker selon la stratégie
    if ga_config.component_check_strategy == "full" and checker is not None:
        component_checker = FullRecursiveChecker(checker)
    else:
        component_checker = ApproximateChecker(precomputed)

    ctx = GAContext(
        candidates=candidates,
        candidates_by_id=candidates_by_id,
        workdays=workdays,
        line_capacities=line_capacities,
        line_min_open=line_min_open,
        by_line=by_line or {},
        loader=loader,
        checker=checker,
        receptions_by_day=receptions_by_day or {},
        initial_stock=precomputed.initial_stock,
        weights=weights,
        ga_config=ga_config,
        component_checker=component_checker,
    )

    # Injecter le seed glouton dans le contexte
    if seed_genes is not None:
        ctx.seed_genes = seed_genes  # type: ignore[attr-defined]

    return run_ga(ctx, progress_callback=progress_callback)
