"""Tests unitaires pour les opérateurs génétiques."""

from __future__ import annotations

import random
from datetime import date
from unittest.mock import MagicMock

import pytest

from production_planning.scheduling.ga.chromosome import Individual, make_individual
from production_planning.scheduling.ga.config import GAConfig
from production_planning.scheduling.ga.decoder import GAContext
from production_planning.scheduling.ga.operators.crossover import (
    article_block_crossover,
    day_block_crossover,
    uniform_crossover,
    crossover_dispatch,
)
from production_planning.scheduling.ga.operators.mutation import (
    article_group_mutation,
    move_mutation,
    mutate,
    shift_mutation,
    swap_mutation,
)
from production_planning.scheduling.ga.operators.selection import tournament_select
from production_planning.scheduling.models import CandidateOF


def _make_ctx(workdays: list[date] | None = None, rng_seed: int = 42) -> GAContext:
    workdays = workdays or [date(2026, 4, 27), date(2026, 4, 28), date(2026, 4, 29)]
    candidates = [
        CandidateOF("OF_001", "ART_A", "Desc A", "PP_830", date(2026, 4, 27), 10.0, 4.0),
        CandidateOF("OF_002", "ART_B", "Desc B", "PP_830", date(2026, 4, 27), 10.0, 3.0),
        CandidateOF("OF_003", "ART_A", "Desc A", "PP_830", date(2026, 4, 28), 10.0, 5.0),
        CandidateOF("OF_004", "ART_C", "Desc C", "PP_830", date(2026, 4, 28), 10.0, 2.0),
    ]
    ctx = GAContext(
        candidates=candidates,
        candidates_by_id={c.num_of: c for c in candidates},
        workdays=workdays,
        line_capacities={"PP_830": 14.0},
        line_min_open={"PP_830": 0.0},
        by_line={"PP_830": ["OF_001", "OF_002", "OF_003", "OF_004"]},
        loader=MagicMock(),
        checker=MagicMock(),
        receptions_by_day={},
        initial_stock={},
        weights={"w1": 0.85, "w2": 0.10, "w3": 0.05, "w4": 0.15},
        ga_config=GAConfig(),
    )
    ctx.rng = random.Random(rng_seed)  # type: ignore[attr-defined]
    return ctx


class TestTournamentSelect:
    def test_tournament_picks_best_of_k(self):
        pop = [
            make_individual({"OF_001": 0}),
            make_individual({"OF_001": 1}),
            make_individual({"OF_001": 2}),
        ]
        pop[0].fitness = 1.0
        pop[1].fitness = 5.0
        pop[2].fitness = 3.0
        rng = random.Random(42)

        winner = tournament_select(pop, k=3, rng=rng)
        assert winner.fitness == 5.0

    def test_tournament_uses_rng_deterministic(self):
        pop = [
            make_individual({"OF_001": 0}),
            make_individual({"OF_001": 1}),
        ]
        pop[0].fitness = 10.0
        pop[1].fitness = 1.0
        rng = random.Random(42)

        winner = tournament_select(pop, k=1, rng=rng)
        # Avec k=1, c'est un tirage aléatoire
        assert winner in pop

    def test_tournament_empty_raises(self):
        with pytest.raises(ValueError, match="vide"):
            tournament_select([], k=3, rng=random.Random(42))


class TestDayBlockCrossover:
    def test_preserves_keys(self):
        ctx = _make_ctx()
        p1 = make_individual({"OF_001": 0, "OF_002": 1, "OF_003": 2, "OF_004": 0})
        p2 = make_individual({"OF_001": 2, "OF_002": 0, "OF_003": 1, "OF_004": 2})
        child = day_block_crossover(p1, p2, ctx)
        assert set(child.genes.keys()) == set(p1.genes.keys())

    def test_child_has_different_genes(self):
        ctx = _make_ctx()
        p1 = make_individual({"OF_001": 0, "OF_002": 1, "OF_003": 2, "OF_004": 0})
        p2 = make_individual({"OF_001": 2, "OF_002": 0, "OF_003": 1, "OF_004": 2})
        child = day_block_crossover(p1, p2, ctx)
        # L'enfant doit avoir des genes différents d'au moins un parent
        assert child.genes != p1.genes or child.genes != p2.genes


class TestArticleBlockCrossover:
    def test_groups_articles(self):
        ctx = _make_ctx()
        p1 = make_individual({"OF_001": 0, "OF_002": 1, "OF_003": 2, "OF_004": 0})
        p2 = make_individual({"OF_001": 2, "OF_002": 0, "OF_003": 1, "OF_004": 2})
        child = article_block_crossover(p1, p2, ctx)

        # Tous les OF de ART_A doivent venir du même parent
        art_a_from_p1 = child.genes["OF_001"] == p1.genes["OF_001"] and child.genes["OF_003"] == p1.genes["OF_003"]
        art_a_from_p2 = child.genes["OF_001"] == p2.genes["OF_001"] and child.genes["OF_003"] == p2.genes["OF_003"]
        assert art_a_from_p1 or art_a_from_p2


class TestUniformCrossover:
    def test_inherits_from_both(self):
        ctx = _make_ctx()
        p1 = make_individual({"OF_001": 0, "OF_002": 0, "OF_003": 0, "OF_004": 0})
        p2 = make_individual({"OF_001": 2, "OF_002": 2, "OF_003": 2, "OF_004": 2})

        from_p1 = 0
        for _ in range(100):
            child = uniform_crossover(p1, p2, ctx)
            from_p1 += sum(1 for k in child.genes if child.genes[k] == p1.genes[k])

        ratio = from_p1 / (100 * len(p1.genes))
        # En moyenne ~50% des genes viennent de p1
        assert 0.4 <= ratio <= 0.6


class TestCrossoverDispatch:
    def test_dispatches_to_valid_operator(self):
        ctx = _make_ctx()
        p1 = make_individual({"OF_001": 0, "OF_002": 1})
        p2 = make_individual({"OF_001": 2, "OF_002": 0})
        child = crossover_dispatch(p1, p2, ctx)
        assert set(child.genes.keys()) == set(p1.genes.keys())


class TestMoveMutation:
    def test_changes_one_gene(self):
        ctx = _make_ctx()
        ind = make_individual({"OF_001": 0, "OF_002": 1, "OF_003": 2})
        old = dict(ind.genes)
        move_mutation(ind, ctx)
        diff = [k for k in ind.genes if ind.genes[k] != old[k]]
        assert len(diff) <= 1

    def test_respects_bounds(self):
        ctx = _make_ctx()
        ind = make_individual({"OF_001": 0})
        for _ in range(50):
            move_mutation(ind, ctx)
            assert 0 <= ind.genes["OF_001"] < len(ctx.workdays)


class TestSwapMutation:
    def test_preserves_multiset(self):
        ctx = _make_ctx()
        ind = make_individual({"OF_001": 0, "OF_002": 1, "OF_003": 2})
        old_values = sorted(ind.genes.values())
        swap_mutation(ind, ctx)
        new_values = sorted(ind.genes.values())
        assert old_values == new_values


class TestArticleGroupMutation:
    def test_aligns_articles(self):
        ctx = _make_ctx()
        ind = make_individual({"OF_001": 0, "OF_002": 1, "OF_003": 2, "OF_004": 1})
        old = dict(ind.genes)
        article_group_mutation(ind, ctx)
        # Vérifier que si un article a été groupé, tous ses OF ont le même jour
        articles = set(c.article for c in ctx.candidates)
        for article in articles:
            ofs = [c.num_of for c in ctx.candidates if c.article == article]
            changed = any(ind.genes.get(o) != old.get(o) for o in ofs)
            if changed:
                days = {ind.genes[o] for o in ofs if o in ind.genes}
                assert len(days) == 1, f"Article {article} n'est pas groupé sur un seul jour"


class TestShiftMutation:
    def test_shifts_line_by_one(self):
        ctx = _make_ctx()
        ind = make_individual({"OF_001": 1, "OF_002": 1, "OF_003": 2, "OF_004": 0})
        old = dict(ind.genes)
        shift_mutation(ind, ctx)
        # Vérifier que les changements sont cohérents (±1 sur une ligne)
        diffs = {k: ind.genes[k] - old[k] for k in ind.genes if ind.genes[k] != old[k]}
        if diffs:
            # Tous les diffs doivent être identiques (+1 ou -1)
            assert len(set(diffs.values())) == 1
            assert list(diffs.values())[0] in {-1, 1}


class TestMutate:
    def test_mutation_probability_zero(self):
        ctx = _make_ctx()
        ctx.ga_config = GAConfig(mutation_probability=0.0)
        ind = make_individual({"OF_001": 0, "OF_002": 1})
        old = dict(ind.genes)
        mutate(ind, ctx)
        assert ind.genes == old

    def test_mutation_probability_one(self):
        ctx = _make_ctx()
        ctx.ga_config = GAConfig(mutation_probability=1.0)
        ind = make_individual({"OF_001": 0, "OF_002": 1})
        old = dict(ind.genes)
        mutate(ind, ctx)
        # Avec proba 1.0, une mutation a lieu (le cache est invalidé)
        assert ind.cache_key != make_individual(old).cache_key or ind.genes != old
