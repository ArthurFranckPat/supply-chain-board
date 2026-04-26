"""Tests unitaires pour ga/decoder.py."""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock

import pytest

from production_planning.scheduling.ga.chromosome import make_individual
from production_planning.scheduling.ga.config import GAConfig
from production_planning.scheduling.ga.decoder import (
    GAContext,
    DecodedPlanning,
    decode,
)
from production_planning.scheduling.models import CandidateOF


def _make_candidate(num_of: str, article: str, charge_hours: float, due_date: date) -> CandidateOF:
    return CandidateOF(
        num_of=num_of,
        article=article,
        description=f"Desc {article}",
        line="PP_830",
        due_date=due_date,
        quantity=10.0,
        charge_hours=charge_hours,
    )


def _make_context(candidates: list[CandidateOF], workdays: list[date]) -> GAContext:
    return GAContext(
        candidates=candidates,
        candidates_by_id={c.num_of: c for c in candidates},
        workdays=workdays,
        line_capacities={"PP_830": 14.0},
        line_min_open={"PP_830": 0.0},
        by_line={"PP_830": [c.num_of for c in candidates]},
        loader=MagicMock(),
        checker=MagicMock(),
        receptions_by_day={},
        initial_stock={},
        weights={"w1": 0.85, "w2": 0.10, "w3": 0.05, "w4": 0.15},
        ga_config=GAConfig(),
    )


class TestDecodeEmpty:
    def test_decode_empty_genes(self):
        """Tous les OF dans unscheduled si aucun gène valide."""
        workdays = [date(2026, 4, 27), date(2026, 4, 28)]
        cands = [_make_candidate("OF_001", "ART_A", 4.0, date(2026, 4, 27))]
        ctx = _make_context(cands, workdays)
        ind = make_individual({"OF_001": -1})

        result = decode(ind, ctx)

        assert isinstance(result, DecodedPlanning)
        assert len(result.unscheduled) == 1
        assert result.plannings["PP_830"] == []


class TestDecodeSingle:
    def test_decode_single_of(self):
        """1 OF, 1 ligne, 1 jour → planning correct."""
        workdays = [date(2026, 4, 27)]
        cands = [_make_candidate("OF_001", "ART_A", 4.0, date(2026, 4, 27))]
        ctx = _make_context(cands, workdays)
        ind = make_individual({"OF_001": 0})

        result = decode(ind, ctx)

        assert len(result.plannings["PP_830"]) == 1
        planned = result.plannings["PP_830"][0]
        assert planned.scheduled_day == date(2026, 4, 27)
        assert planned.start_hour == 0.0
        assert planned.end_hour == 4.0
        assert len(result.unscheduled) == 0


class TestDecodeSetup:
    def test_decode_setup_time(self):
        """2 OF d'articles différents → +0.25h de setup."""
        workdays = [date(2026, 4, 27)]
        cands = [
            _make_candidate("OF_001", "ART_A", 4.0, date(2026, 4, 27)),
            _make_candidate("OF_002", "ART_B", 3.0, date(2026, 4, 27)),
        ]
        ctx = _make_context(cands, workdays)
        ind = make_individual({"OF_001": 0, "OF_002": 0})

        result = decode(ind, ctx)

        ofs = result.plannings["PP_830"]
        assert len(ofs) == 2
        # Tri par due_date (identique) puis article
        ofs.sort(key=lambda c: (c.start_hour or 0.0))
        assert ofs[0].start_hour == 0.0
        assert ofs[0].end_hour == 4.0
        # Le deuxième a un setup de 0.25h
        assert ofs[1].start_hour == 4.25
        assert ofs[1].end_hour == 7.25


class TestDecodeCapacityOverflow:
    def test_decode_capacity_overflow(self):
        """3 OF de 6h sur ligne 14h → 1 OF débordé vers jour suivant."""
        workdays = [date(2026, 4, 27), date(2026, 4, 28)]
        cands = [
            _make_candidate("OF_001", "ART_A", 6.0, date(2026, 4, 27)),
            _make_candidate("OF_002", "ART_B", 6.0, date(2026, 4, 27)),
            _make_candidate("OF_003", "ART_C", 6.0, date(2026, 4, 27)),
        ]
        ctx = _make_context(cands, workdays)
        ind = make_individual({"OF_001": 0, "OF_002": 0, "OF_003": 0})

        result = decode(ind, ctx)

        ofs = result.plannings["PP_830"]
        # Au moins 2 OF planifiés sur le jour 1, le 3ème débordé
        day1 = [c for c in ofs if c.scheduled_day == date(2026, 4, 27)]
        day2 = [c for c in ofs if c.scheduled_day == date(2026, 4, 28)]
        assert len(day1) == 2
        assert len(day2) == 1


class TestDecodeIdempotence:
    def test_decode_idempotence(self):
        """Deux appels sur même individu produisent même résultat."""
        workdays = [date(2026, 4, 27)]
        cands = [
            _make_candidate("OF_001", "ART_A", 4.0, date(2026, 4, 27)),
            _make_candidate("OF_002", "ART_B", 3.0, date(2026, 4, 27)),
        ]
        ctx = _make_context(cands, workdays)
        ind = make_individual({"OF_001": 0, "OF_002": 0})

        r1 = decode(ind, ctx)
        r2 = decode(ind, ctx)

        assert len(r1.plannings["PP_830"]) == len(r2.plannings["PP_830"])
        for a, b in zip(r1.plannings["PP_830"], r2.plannings["PP_830"]):
            assert a.num_of == b.num_of
            assert a.start_hour == b.start_hour
            assert a.end_hour == b.end_hour
