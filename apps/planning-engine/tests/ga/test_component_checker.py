"""Tests unitaires pour ga/evaluation/component_checker.py."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

import pytest

from production_planning.scheduling.ga.evaluation.component_checker import (
    ApproximateChecker,
    FullRecursiveChecker,
)
from production_planning.scheduling.ga.evaluation.precompute import PrecomputedData
from production_planning.scheduling.models import CandidateOF
from production_planning.orders.allocation import StockState


def _make_stock_state(initial: dict[str, float]) -> StockState:
    return StockState(initial)


class TestApproximateChecker:
    def test_feasible_when_stock_sufficient(self):
        """Faisable si stock suffisant pour tous les composants."""
        precomputed = PrecomputedData(
            bom_flat={"OF_001": {"COMP_A": 5.0}},
            available_by_day={},
            charge_by_of={},
            initial_stock={"COMP_A": 10.0},
            receptions_by_day={},
        )
        checker = ApproximateChecker(precomputed)
        candidate = CandidateOF("OF_001", "ART_A", "Desc", "PP_830", date(2026, 4, 27), 10.0, 4.0)
        stock = _make_stock_state({"COMP_A": 10.0})

        feasible, reason, blocking = checker.evaluate(candidate, date(2026, 4, 27), stock)
        assert feasible is True
        assert blocking == ""

    def test_blocked_when_stock_insufficient(self):
        """Bloqué si stock insuffisant."""
        precomputed = PrecomputedData(
            bom_flat={"OF_001": {"COMP_A": 15.0}},
            available_by_day={},
            charge_by_of={},
            initial_stock={"COMP_A": 10.0},
            receptions_by_day={},
        )
        checker = ApproximateChecker(precomputed)
        candidate = CandidateOF("OF_001", "ART_A", "Desc", "PP_830", date(2026, 4, 27), 10.0, 4.0)
        stock = _make_stock_state({"COMP_A": 10.0})

        feasible, reason, blocking = checker.evaluate(candidate, date(2026, 4, 27), stock)
        assert feasible is False
        assert "COMP_A" in blocking

    def test_no_false_negative(self):
        """ApproximateChecker ne doit jamais rejeter un OF que le stock suffirait à valider."""
        precomputed = PrecomputedData(
            bom_flat={"OF_001": {"COMP_A": 5.0}},
            available_by_day={},
            charge_by_of={},
            initial_stock={"COMP_A": 100.0},
            receptions_by_day={},
        )
        checker = ApproximateChecker(precomputed)
        candidate = CandidateOF("OF_001", "ART_A", "Desc", "PP_830", date(2026, 4, 27), 10.0, 4.0)
        stock = _make_stock_state({"COMP_A": 100.0})

        feasible, _, _ = checker.evaluate(candidate, date(2026, 4, 27), stock)
        assert feasible is True

    def test_reserve_allocates_scarce(self):
        """Reserve n'alloue que les composants en rupture."""
        precomputed = PrecomputedData(
            bom_flat={"OF_001": {"COMP_A": 15.0, "COMP_B": 3.0}},
            available_by_day={},
            charge_by_of={},
            initial_stock={"COMP_A": 10.0, "COMP_B": 10.0},
            receptions_by_day={},
        )
        checker = ApproximateChecker(precomputed)
        candidate = CandidateOF("OF_001", "ART_A", "Desc", "PP_830", date(2026, 4, 27), 10.0, 4.0)
        stock = _make_stock_state({"COMP_A": 10.0, "COMP_B": 10.0})

        checker.reserve(candidate, date(2026, 4, 27), stock)
        # Seul COMP_A est en rupture (besoin 15, dispo 10)
        assert stock.allocated_stock.get("COMP_A", 0.0) > 0
        # COMP_B est suffisant, pas d'allocation
        assert stock.allocated_stock.get("COMP_B", 0.0) == 0.0


class TestFullRecursiveChecker:
    def test_delegates_to_recursive_checker(self):
        """FullRecursiveChecker délègue au RecursiveChecker existant."""
        mock_checker = MagicMock()
        mock_checker.data_loader = MagicMock()

        # Simuler un résultat faisable
        mock_result = MagicMock()
        mock_result.feasible = True
        mock_result.missing_components = {}

        mock_runtime_checker = MagicMock()
        mock_runtime_checker._check_article_recursive.return_value = mock_result

        full_checker = FullRecursiveChecker(mock_checker)

        # Patch la création du RecursiveChecker runtime
        from production_planning.feasibility import recursive as rc
        original = rc.RecursiveChecker
        rc.RecursiveChecker = lambda *args, **kwargs: mock_runtime_checker

        try:
            candidate = CandidateOF("OF_001", "ART_A", "Desc", "PP_830", date(2026, 4, 27), 10.0, 4.0)
            stock = _make_stock_state({})
            feasible, reason, blocking = full_checker.evaluate(candidate, date(2026, 4, 27), stock)
            assert feasible is True
        finally:
            rc.RecursiveChecker = original
