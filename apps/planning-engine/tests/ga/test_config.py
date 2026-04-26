"""Tests unitaires pour ga/config.py."""

from __future__ import annotations

import pytest

from production_planning.scheduling.ga.config import GAConfig, default_ga_config, load_ga_config


class TestDefaultConfig:
    def test_default_config_valid(self):
        cfg = default_ga_config()
        assert cfg.population_size == 100
        assert cfg.max_generations == 200
        assert cfg.elitism_rate == 0.05
        assert cfg.seed_greedy_count + cfg.seed_greedy_variants + cfg.seed_random_count == cfg.population_size


class TestValidation:
    def test_invalid_seed_split_raises(self):
        with pytest.raises(ValueError, match="seed_greedy_count"):
            GAConfig(seed_greedy_count=1, seed_greedy_variants=5, seed_random_count=10)

    def test_invalid_elitism_rate(self):
        with pytest.raises(ValueError, match="elitism_rate"):
            GAConfig(elitism_rate=0.6)
        with pytest.raises(ValueError, match="elitism_rate"):
            GAConfig(elitism_rate=0.0)

    def test_invalid_crossover_mix(self):
        with pytest.raises(ValueError, match="crossover_mix"):
            GAConfig(crossover_mix={"day_block": 0.5, "uniform": 0.2})

    def test_invalid_mutation_mix(self):
        with pytest.raises(ValueError, match="mutation_mix"):
            GAConfig(mutation_mix={"move": 0.5})


class TestOverrides:
    def test_overrides_applied(self):
        cfg = GAConfig(
            population_size=50,
            seed_greedy_count=1,
            seed_greedy_variants=4,
            seed_random_count=45,
        )
        assert cfg.population_size == 50
        # Les autres valeurs par défaut restent inchangées
        assert cfg.max_generations == 200
