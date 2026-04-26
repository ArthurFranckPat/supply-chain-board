"""Configuration centralisée de l'algorithme génétique.

Aucune valeur magique ailleurs dans le code AG ne doit être codée en dur.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal


@dataclass(frozen=True)
class GAConfig:
    """Paramètres de l'algorithme génétique."""

    # Population
    population_size: int = 100
    max_generations: int = 200
    elitism_rate: float = 0.05

    # Opérateurs
    crossover_probability: float = 0.8
    mutation_probability: float = 0.15
    tournament_size: int = 3

    # Mix d'opérateurs (somme = 1.0)
    crossover_mix: dict[str, float] = field(
        default_factory=lambda: {
            "day_block": 0.5,
            "article_block": 0.3,
            "uniform": 0.2,
        }
    )
    mutation_mix: dict[str, float] = field(
        default_factory=lambda: {
            "move": 0.4,
            "swap": 0.3,
            "inversion": 0.0,
            "group": 0.2,
            "shift": 0.1,
        }
    )

    # Seeding
    seed_greedy_count: int = 1
    seed_greedy_variants: int = 9
    seed_random_count: int = 90

    # Convergence
    early_stop_patience: int = 20
    early_stop_min_delta: float = 0.001

    # Évaluation composants
    component_check_strategy: Literal["full", "approximate"] = "full"
    full_check_top_k: int = 5

    # Pénalités fitness (ajoutées aux poids existants w1..w4)
    setup_cost: float = 1.0
    late_weight: float = 5.0
    component_violation_weight: float = 100.0

    # Reproductibilité / parallélisme
    random_seed: int | None = None
    workers: int = 1

    def __post_init__(self) -> None:
        """Validation des contraintes de cohérence."""
        total_seed = self.seed_greedy_count + self.seed_greedy_variants + self.seed_random_count
        if total_seed != self.population_size:
            raise ValueError(
                f"seed_greedy_count ({self.seed_greedy_count}) + "
                f"seed_greedy_variants ({self.seed_greedy_variants}) + "
                f"seed_random_count ({self.seed_random_count}) = {total_seed} "
                f"!= population_size ({self.population_size})"
            )

        if not (0.0 < self.elitism_rate < 0.5):
            raise ValueError(f"elitism_rate doit être dans ]0, 0.5[, got {self.elitism_rate}")

        crossover_sum = sum(self.crossover_mix.values())
        if not (0.999 <= crossover_sum <= 1.001):
            raise ValueError(f"crossover_mix doit sommer à ~1.0, got {crossover_sum}")

        mutation_sum = sum(self.mutation_mix.values())
        if not (0.999 <= mutation_sum <= 1.001):
            raise ValueError(f"mutation_mix doit sommer à ~1.0, got {mutation_sum}")


def default_ga_config() -> GAConfig:
    """Retourne la configuration par défaut."""
    return GAConfig()


def load_ga_config(
    path: str = "apps/planning-engine/config/ga.json",
    overrides: dict | None = None,
) -> GAConfig:
    """Charge la configuration depuis un fichier JSON avec overrides optionnels.

    Args:
        path: Chemin vers le fichier JSON de configuration.
        overrides: Dictionnaire de valeurs à surcharger.

    Returns:
        Instance GAConfig validée.
    """
    config_path = Path(path)
    kwargs: dict = {}

    if config_path.exists():
        with config_path.open("r", encoding="utf-8") as f:
            kwargs = json.load(f)

    if overrides:
        kwargs.update(overrides)

    return GAConfig(**kwargs)
