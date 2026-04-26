"""Représentation d'un individu (solution candidate) dans l'AG.

Fournit les opérations atomiques de manipulation : création, clonage,
hashage, invalidation de caches.
"""

from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Individual:
    """Individu = un planning complet encodé.

    Attributs:
        genes: {num_of → day_index} où day_index est l'index dans workdays.
               -1 signifie "non planifié" (utilisé en repair).
        fitness: Score agrégé (cache, invalidé à chaque mutation).
        metrics: KPIs détaillés (cache).
        decoded: Planning décodé (cache pour éviter le re-décodage).
        cache_key: Hash stable des genes pour invalidation.
        rank: Rang Pareto (réservé phase NSGA-II).
        age: Nombre de générations passées dans la population.
    """

    genes: dict[str, int]
    fitness: float | None = None
    metrics: Any = None
    decoded: Any = None
    cache_key: str | None = None
    rank: int | None = None
    age: int = 0


def make_individual(genes: dict[str, int]) -> Individual:
    """Crée un individu à partir d'un dictionnaire de genes.

    Args:
        genes: Mapping {num_of → day_index}.

    Returns:
        Nouvel Individual avec cache_key initialisé.
    """
    ind = Individual(genes=genes)
    ind.cache_key = hash_genes(genes)
    return ind


def clone(ind: Individual) -> Individual:
    """Deep copy d'un individu — caches vidés.

    Args:
        ind: Individu source.

    Returns:
        Nouvel Individual avec genes copiés et caches invalidés.
    """
    return make_individual(genes=deepcopy(ind.genes))


def hash_genes(genes: dict[str, int]) -> str:
    """Hash stable et déterministe d'un chromosome.

    L'ordre d'insertion dans le dict n'a pas d'importance.

    Args:
        genes: Mapping {num_of → day_index}.

    Returns:
        Chaîne hexadécimale de 32 caractères (MD5).
    """
    serialized = json.dumps(genes, sort_keys=True, separators=(",", ":"))
    return hashlib.md5(serialized.encode("utf-8")).hexdigest()


def invalidate(ind: Individual) -> None:
    """Invalide les caches d'évaluation d'un individu.

    Doit être appelée après toute mutation ou croisement.

    Args:
        ind: Individu à invalider (modifié in-place).
    """
    ind.fitness = None
    ind.metrics = None
    ind.decoded = None
    ind.cache_key = hash_genes(ind.genes)
