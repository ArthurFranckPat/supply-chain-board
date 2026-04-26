"""Tests unitaires pour ga/chromosome.py."""

from __future__ import annotations

import pytest

from production_planning.scheduling.ga.chromosome import (
    clone,
    hash_genes,
    invalidate,
    make_individual,
)


class TestMakeIndividual:
    def test_make_individual_basic(self):
        genes = {"OF_001": 0, "OF_002": 1, "OF_003": 0}
        ind = make_individual(genes)
        assert ind.genes == genes
        assert ind.fitness is None
        assert ind.cache_key is not None


class TestClone:
    def test_clone_independence(self):
        original = make_individual({"OF_001": 0, "OF_002": 1})
        original.fitness = 42.0
        original.metrics = {"score": 42.0}

        copied = clone(original)

        # Modification du clone n'altère pas l'original
        copied.genes["OF_001"] = 99
        assert original.genes["OF_001"] == 0
        assert copied.genes["OF_001"] == 99

        # Caches vidés
        assert copied.fitness is None
        assert copied.metrics is None
        # Après mutation + invalidation, le cache_key change
        invalidate(copied)
        assert copied.cache_key != original.cache_key


class TestHashGenes:
    def test_hash_stability(self):
        """L'ordre d'insertion ne doit pas changer le hash."""
        genes_a = {"OF_001": 0, "OF_002": 1, "OF_003": 2}
        genes_b = {"OF_003": 2, "OF_001": 0, "OF_002": 1}
        assert hash_genes(genes_a) == hash_genes(genes_b)

    def test_hash_different_values(self):
        genes_a = {"OF_001": 0}
        genes_b = {"OF_001": 1}
        assert hash_genes(genes_a) != hash_genes(genes_b)

    def test_hash_empty(self):
        assert hash_genes({}) == hash_genes({})


class TestInvalidate:
    def test_invalidate_clears_caches(self):
        ind = make_individual({"OF_001": 0})
        ind.fitness = 100.0
        ind.metrics = {"taux_service": 0.9}
        old_key = ind.cache_key

        invalidate(ind)

        assert ind.fitness is None
        assert ind.metrics is None
        assert ind.decoded is None
        assert ind.cache_key is not None
        # Le cache_key est recalculé — pour les mêmes genes, il est identique
        assert ind.cache_key == old_key

    def test_invalidate_after_mutation_changes_key(self):
        ind = make_individual({"OF_001": 0})
        old_key = ind.cache_key

        ind.genes["OF_001"] = 1
        invalidate(ind)

        assert ind.cache_key != old_key
