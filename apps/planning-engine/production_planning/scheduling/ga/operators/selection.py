"""Sélection par tournoi pour l'algorithme génétique."""

from __future__ import annotations

import random
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..chromosome import Individual


def tournament_select(
    population: list[Individual],
    k: int,
    rng: random.Random,
) -> Individual:
    """Sélection par tournoi de taille k.

    Tire k individus uniformément au hasard et retourne celui
    avec la fitness maximale.

    Args:
        population: Population courante.
        k: Taille du tournoi (défaut 3 dans la config).
        rng: Générateur aléatoire dédié.

    Returns:
        Le meilleur individu parmi les k tirés.

    Raises:
        ValueError: Si la population est vide ou si un individu sans fitness est tiré.
    """
    if not population:
        raise ValueError("Population vide")

    contestants = rng.sample(population, min(k, len(population)))
    for ind in contestants:
        if ind.fitness is None:
            raise ValueError(f"Individu sans fitness dans le tournoi: {ind}")

    return max(contestants, key=lambda ind: ind.fitness)  # type: ignore[return-value]
