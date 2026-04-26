"""Tests unitaires pour ga/evaluation/precompute.py."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

import pytest

from production_planning.scheduling.ga.evaluation.precompute import (
    PrecomputedData,
    _flatten_bom,
    _build_available_by_day,
    precompute,
)
from production_planning.scheduling.models import CandidateOF


def _make_mock_loader():
    """Crée un mock loader avec nomenclatures simples."""
    loader = MagicMock()
    loader.stocks = {"COMP_A": MagicMock(), "COMP_B": MagicMock()}
    return loader


class TestFlattenBom:
    def test_simple_purchase(self):
        """Article sans sous-nomenclature → retourne lui-même."""
        loader = _make_mock_loader()
        loader.get_nomenclature.return_value = None

        result = _flatten_bom(loader, "ART_X", 10.0)
        assert result == {"ART_X": 10.0}

    def test_recursive_flatten(self):
        """Article avec composants ACHAT."""
        loader = _make_mock_loader()

        # Nomenclature ART_PARENT : 2× COMP_A + 1× COMP_B
        nom_parent = MagicMock()
        comp_a = MagicMock()
        comp_a.article_composant = "COMP_A"
        comp_a.qte_requise.return_value = 2.0
        comp_a.is_achete.return_value = True
        comp_a.is_fabrique.return_value = False

        comp_b = MagicMock()
        comp_b.article_composant = "COMP_B"
        comp_b.qte_requise.return_value = 1.0
        comp_b.is_achete.return_value = True
        comp_b.is_fabrique.return_value = False

        nom_parent.composants = [comp_a, comp_b]
        loader.get_nomenclature.return_value = nom_parent

        result = _flatten_bom(loader, "ART_PARENT", 10.0)
        assert result == {"COMP_A": 2.0, "COMP_B": 1.0}


class TestBuildAvailableByDay:
    def test_monotone(self):
        """La disponibilité doit être croissante."""
        initial = {"ART_A": 10.0}
        receptions = {
            date(2026, 4, 27): [("ART_A", 5.0)],
            date(2026, 4, 28): [("ART_A", 3.0)],
        }
        workdays = [date(2026, 4, 27), date(2026, 4, 28), date(2026, 4, 29)]

        result = _build_available_by_day(initial, receptions, workdays)

        avail = result["ART_A"]
        assert avail[date(2026, 4, 27)] == 15.0
        assert avail[date(2026, 4, 28)] == 18.0
        assert avail[date(2026, 4, 29)] == 18.0


class TestPrecompute:
    def test_precompute_basic(self):
        """Vérifie la structure des données pré-calculées."""
        loader = _make_mock_loader()
        loader.get_nomenclature.return_value = None

        candidates = [
            CandidateOF("OF_001", "ART_A", "Desc", "PP_830", date(2026, 4, 27), 10.0, 4.0),
        ]
        workdays = [date(2026, 4, 27), date(2026, 4, 28)]
        receptions = {}

        result = precompute(loader, candidates, workdays, receptions)

        assert isinstance(result, PrecomputedData)
        assert "OF_001" in result.bom_flat
        assert "OF_001" in result.charge_by_of
        assert result.charge_by_of["OF_001"] == 4.0
