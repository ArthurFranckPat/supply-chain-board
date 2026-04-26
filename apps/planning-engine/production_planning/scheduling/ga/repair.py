"""Opérateur de réparation pour l'algorithme génétique.

Restaure la validité d'un individu après croisement/mutation :
1. Borne les genes hors [0, n_days-1]
2. Le décodeur gère déjà l'overflow capacitaire (soft-repair)
3. Invalide les caches
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .chromosome import invalidate

if TYPE_CHECKING:
    from ..chromosome import Individual
    from ..decoder import GAContext


MAX_REPAIR_ITERS = 3


def repair(individual: Individual, ctx: GAContext) -> None:
    """Répare un individu après opération génétique.

    Actions :
        1. Ramène les genes hors bornes dans [0, len(workdays)-1].
        2. (Le décodeur gère l'overflow capacitaire.)
        3. Invalide les caches.

    Args:
        individual: Individu à réparer (modifié in-place).
        ctx: Contexte (pour le nombre de jours).
    """
    n_days = len(ctx.workdays)
    if n_days == 0:
        return

    # 1. Bornes
    for num_of in list(individual.genes.keys()):
        day_idx = individual.genes[num_of]
        if day_idx < 0:
            individual.genes[num_of] = 0
        elif day_idx >= n_days:
            individual.genes[num_of] = n_days - 1

    # 2. Le soft-repair d'overflow est géré par le décodeur
    #    (voir decoder.py : décalage vers j+1 quand capacity dépassée)

    # 3. Invalider les caches
    invalidate(individual)
