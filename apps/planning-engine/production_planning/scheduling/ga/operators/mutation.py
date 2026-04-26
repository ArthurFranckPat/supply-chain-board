"""Opérateurs de mutation pour l'algorithme génétique.

Stratégies :
- move : déplacer un OF vers un autre jour
- swap : échanger les jours de deux OF
- article_group : regrouper tous les OF d'un article sur le même jour
- shift : décaler tous les OF d'une ligne d'un cran
"""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

from ..chromosome import invalidate

if TYPE_CHECKING:
    from ..chromosome import Individual
    from ..decoder import GAContext


def move_mutation(ind: Individual, ctx: GAContext) -> None:
    """Déplace un OF aléatoire vers un autre jour aléatoire.

    Args:
        ind: Individu à muter (modifié in-place).
        ctx: Contexte (pour le nombre de jours et le RNG).
    """
    rng = getattr(ctx, "rng", random)
    n_days = len(ctx.workdays)
    if n_days <= 1 or not ind.genes:
        return

    num_of = rng.choice(list(ind.genes.keys()))
    current = ind.genes[num_of]
    # Choisir un jour différent
    choices = [i for i in range(n_days) if i != current]
    if choices:
        ind.genes[num_of] = rng.choice(choices)
        invalidate(ind)


def swap_mutation(ind: Individual, ctx: GAContext) -> None:  # noqa: ARG001
    """Échange les jours de deux OF aléatoires.

    Args:
        ind: Individu à muter (modifié in-place).
        ctx: Contexte (non utilisé, pour uniformité d'API).
    """
    rng = getattr(ctx, "rng", random)
    if len(ind.genes) < 2:
        return

    keys = list(ind.genes.keys())
    a, b = rng.sample(keys, 2)
    ind.genes[a], ind.genes[b] = ind.genes[b], ind.genes[a]
    invalidate(ind)


def article_group_mutation(ind: Individual, ctx: GAContext) -> None:
    """Regroupe tous les OF d'un article sur un même jour aléatoire.

    Args:
        ind: Individu à muter (modifié in-place).
        ctx: Contexte (pour les articles et le RNG).
    """
    rng = getattr(ctx, "rng", random)
    n_days = len(ctx.workdays)
    if n_days < 1 or not ctx.candidates:
        return

    # Choisir un article au hasard parmi ceux présents
    articles = list({c.article for c in ctx.candidates})
    if not articles:
        return

    target_article = rng.choice(articles)
    target_day = rng.randint(0, n_days - 1)

    changed = False
    for num_of, candidate in ctx.candidates_by_id.items():
        if candidate.article == target_article and num_of in ind.genes:
            ind.genes[num_of] = target_day
            changed = True

    if changed:
        invalidate(ind)


def shift_mutation(ind: Individual, ctx: GAContext) -> None:
    """Décale tous les OF d'une ligne d'un jour vers l'avant ou l'arrière.

    Args:
        ind: Individu à muter (modifié in-place).
        ctx: Contexte (pour les lignes et le RNG).
    """
    rng = getattr(ctx, "rng", random)
    n_days = len(ctx.workdays)
    if n_days <= 1 or not ctx.by_line:
        return

    # Choisir une ligne au hasard
    line = rng.choice(list(ctx.by_line.keys()))
    direction = rng.choice([-1, 1])

    changed = False
    for num_of in ctx.by_line.get(line, []):
        if num_of in ind.genes:
            new_day = ind.genes[num_of] + direction
            if 0 <= new_day < n_days:
                ind.genes[num_of] = new_day
                changed = True

    if changed:
        invalidate(ind)


def mutate(ind: Individual, ctx: GAContext) -> None:
    """Applique une mutation selon la configuration.

    La probabilité globale de mutation est ga_config.mutation_probability.
    Si la mutation est déclenchée, un opérateur est choisi selon mutation_mix.

    Args:
        ind: Individu à muter (modifié in-place).
        ctx: Contexte avec ga_config.
    """
    rng = getattr(ctx, "rng", random)
    config = ctx.ga_config

    if rng.random() >= config.mutation_probability:
        return

    mix = config.mutation_mix
    r = rng.random()
    cumulative = 0.0

    for operator_name, probability in mix.items():
        cumulative += probability
        if r <= cumulative:
            if operator_name == "move":
                move_mutation(ind, ctx)
            elif operator_name == "swap":
                swap_mutation(ind, ctx)
            elif operator_name == "inversion":
                # Inversion n'a pas de sens avec l'encodage jour seul (Option B)
                # Fallback sur move
                move_mutation(ind, ctx)
            elif operator_name == "group":
                article_group_mutation(ind, ctx)
            elif operator_name == "shift":
                shift_mutation(ind, ctx)
            return
