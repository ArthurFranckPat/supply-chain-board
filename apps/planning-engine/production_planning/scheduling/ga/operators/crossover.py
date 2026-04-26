"""Opérateurs de croisement (crossover) pour l'algorithme génétique.

Trois stratégies :
- day_block : préserve la cohérence des blocs journaliers
- article_block : préserve le grouping par article
- uniform : 50/50 par OF
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

from ..chromosome import clone, invalidate

if TYPE_CHECKING:
    from ..chromosome import Individual
    from ..decoder import GAContext


def day_block_crossover(
    p1: Individual,
    p2: Individual,
    ctx: GAContext,
) -> Individual:
    """Croisement par bloc de jour.

    Choisit un point de coupure jour. Tous les OF assignés à un jour
    ≤ coupure héritent du parent1, les autres du parent2.

    Args:
        p1: Parent 1.
        p2: Parent 2.
        ctx: Contexte (pour le nombre de jours).

    Returns:
        Enfant avec genes recombinés.
    """
    rng = getattr(ctx, "rng", random)
    n_days = len(ctx.workdays)
    if n_days <= 1:
        return clone(p1)

    cut = rng.randint(0, n_days - 2)  # point de coupure entre 0 et n-2

    child_genes = {}
    for num_of in p1.genes:
        day_idx = p1.genes[num_of]
        if day_idx <= cut:
            child_genes[num_of] = day_idx
        else:
            child_genes[num_of] = p2.genes.get(num_of, day_idx)

    child = clone(p1)
    child.genes = child_genes
    invalidate(child)
    return child


def article_block_crossover(
    p1: Individual,
    p2: Individual,
    ctx: GAContext,
) -> Individual:
    """Croisement par bloc d'article.

    Pour chaque article, choisit aléatoirement un parent.
    Tous les OF de cet article héritent du parent choisi.

    Args:
        p1: Parent 1.
        p2: Parent 2.
        ctx: Contexte (pour la liste des articles).

    Returns:
        Enfant avec genes recombinés par article.
    """
    rng = getattr(ctx, "rng", random)

    # Collecter les articles uniques
    articles = {c.article for c in ctx.candidates}
    choice_per_article = {a: rng.choice([1, 2]) for a in articles}

    child_genes = {}
    for num_of in p1.genes:
        candidate = ctx.candidates_by_id.get(num_of)
        if candidate is None:
            child_genes[num_of] = p1.genes[num_of]
            continue
        parent = p1 if choice_per_article.get(candidate.article, 1) == 1 else p2
        child_genes[num_of] = parent.genes.get(num_of, p1.genes[num_of])

    child = clone(p1)
    child.genes = child_genes
    invalidate(child)
    return child


def uniform_crossover(
    p1: Individual,
    p2: Individual,
    ctx: GAContext,  # noqa: ARG001
) -> Individual:
    """Croisement uniforme.

    Pour chaque OF, 50% de chance d'hériter du parent1 ou du parent2.

    Args:
        p1: Parent 1.
        p2: Parent 2.
        ctx: Contexte (non utilisé, pour uniformité d'API).

    Returns:
        Enfant avec genes recombinés uniformément.
    """
    rng = getattr(ctx, "rng", random)

    child_genes = {}
    for num_of in p1.genes:
        child_genes[num_of] = p1.genes[num_of] if rng.random() < 0.5 else p2.genes.get(num_of, p1.genes[num_of])

    child = clone(p1)
    child.genes = child_genes
    invalidate(child)
    return child


def crossover_dispatch(
    p1: Individual,
    p2: Individual,
    ctx: GAContext,
) -> Individual:
    """Dispatch vers l'opérateur de croisement selon la configuration.

    Args:
        p1: Parent 1.
        p2: Parent 2.
        ctx: Contexte avec ga_config.crossover_mix.

    Returns:
        Enfant produit par l'opérateur choisi.
    """
    rng = getattr(ctx, "rng", random)
    mix = ctx.ga_config.crossover_mix

    r = rng.random()
    cumulative = 0.0
    for operator_name, probability in mix.items():
        cumulative += probability
        if r <= cumulative:
            if operator_name == "day_block":
                return day_block_crossover(p1, p2, ctx)
            if operator_name == "article_block":
                return article_block_crossover(p1, p2, ctx)
            if operator_name == "uniform":
                return uniform_crossover(p1, p2, ctx)

    # Fallback
    return day_block_crossover(p1, p2, ctx)
