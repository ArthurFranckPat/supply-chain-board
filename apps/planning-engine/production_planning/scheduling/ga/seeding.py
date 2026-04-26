"""Construction de la population initiale pour l'algorithme génétique.

Stratégie hybride (doc fondation §4.8) :
- 1 individu = solution glouton V1 (seed de qualité garantie)
- N variantes = mutations légères du glouton (±1 jour sur fraction des OF)
- M individus = aléatoires (distribution uniforme sur les jours)
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

from .chromosome import Individual, clone, make_individual

if TYPE_CHECKING:
    from .decoder import GAContext


def seed_from_greedy(seed_genes: dict[str, int]) -> Individual:
    """Crée un individu à partir du planning glouton.

    Args:
        seed_genes: Mapping {num_of → day_index} extrait du glouton.

    Returns:
        Individual représentant la solution gloutonne.
    """
    return make_individual(seed_genes.copy())


def perturb_seed(seed: Individual, ctx: GAContext, fraction: float = 0.1) -> Individual:
    """Crée une variante légèrement perturbée du seed glouton.

    Déplace ~fraction% des OF d'un jour aléatoire vers un autre.

    Args:
        seed: Seed glouton à perturber.
        ctx: Contexte (pour le nombre de jours et le RNG).
        fraction: Proportion d'OF à perturber (défaut 10%).

    Returns:
        Nouvel individu avec des mutations légères.
    """
    rng = getattr(ctx, "rng", random)
    n_days = len(ctx.workdays)
    if n_days <= 1 or not seed.genes:
        return clone(seed)

    variant = clone(seed)
    keys = list(variant.genes.keys())
    n_mutate = max(1, int(len(keys) * fraction))

    for _ in range(n_mutate):
        num_of = rng.choice(keys)
        current = variant.genes[num_of]
        choices = [i for i in range(n_days) if i != current]
        if choices:
            variant.genes[num_of] = rng.choice(choices)

    from .chromosome import invalidate
    invalidate(variant)
    return variant


def seed_random(ctx: GAContext) -> Individual:
    """Crée un individu aléatoire.

    Chaque OF est assigné à un jour uniformément aléatoire.

    Args:
        ctx: Contexte (pour les OF candidats et le nombre de jours).

    Returns:
        Nouvel individu avec assignation aléatoire.
    """
    rng = getattr(ctx, "rng", random)
    n_days = len(ctx.workdays)

    genes = {
        c.num_of: rng.randint(0, max(0, n_days - 1))
        for c in ctx.candidates
    }
    return make_individual(genes)


def build_initial_population(
    ctx: GAContext,
    seed_genes: dict[str, int] | None = None,
) -> list[Individual]:
    """Construit la population initiale complète.

    Args:
        ctx: Contexte d'évaluation.
        seed_genes: Seed glouton pré-calculé (optionnel).

    Returns:
        Liste de Individuals de taille population_size.
    """
    config = ctx.ga_config
    population: list[Individual] = []

    # 1. Seed glouton
    if seed_genes is not None:
        seed_v1 = seed_from_greedy(seed_genes)
        population.append(seed_v1)
    else:
        # Fallback : seed aléatoire si pas de glouton
        population.append(seed_random(ctx))

    # 2. Variantes du glouton
    for _ in range(config.seed_greedy_variants):
        if seed_genes is not None:
            population.append(perturb_seed(population[0], ctx, fraction=0.1))
        else:
            population.append(seed_random(ctx))

    # 3. Individus aléatoires
    for _ in range(config.seed_random_count):
        population.append(seed_random(ctx))

    # Ajustement final si la taille ne correspond pas exactement
    while len(population) < config.population_size:
        population.append(seed_random(ctx))
    while len(population) > config.population_size:
        population.pop()

    return population
