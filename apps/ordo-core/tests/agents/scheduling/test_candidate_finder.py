"""Tests pour CandidateFinder."""

from datetime import date, timedelta
from unittest.mock import MagicMock, patch
from src.agents.scheduling.candidate_finder import CandidateFinder
from src.agents.scheduling.models import SchedulingConfig


def _make_commande(num, article, date_exp, qte=100):
    c = MagicMock()
    c.num_commande = num
    c.article = article
    c.date_expedition_demandee = date_exp
    c.qte_restante = qte
    c.est_commande.return_value = True
    return c


def test_get_s2_s3_orders_filters_by_horizon():
    """Seules les commandes dans la fenêtre S+2/S+3 sont retournées."""
    today = date(2026, 3, 23)
    finder = CandidateFinder(loader=MagicMock(), config=SchedulingConfig())

    cmd_s1 = _make_commande("C1", "ART1", today + timedelta(days=3))
    cmd_s2 = _make_commande("C2", "ART2", today + timedelta(days=10))
    cmd_s3 = _make_commande("C3", "ART3", today + timedelta(days=17))
    cmd_beyond = _make_commande("C4", "ART4", today + timedelta(days=25))

    finder.loader.commandes_clients = [cmd_s1, cmd_s2, cmd_s3, cmd_beyond]

    # S+2 = jours 8-14, S+3 = jours 15-21
    result = finder.get_s2_s3_orders(reference_date=today)
    nums = [c.num_commande for c in result]
    assert "C2" in nums
    assert "C3" in nums
    assert "C1" not in nums   # trop proche (S+1)
    assert "C4" not in nums   # trop loin (S+4)


def test_calculate_of_hours_per_poste():
    """Les heures par poste sont calculées à partir des cadences."""
    loader = MagicMock()
    # Mock une gamme avec des operations
    operation = MagicMock()
    operation.poste_charge = "PP_830"
    operation.cadence = 100.0
    gamme = MagicMock()
    gamme.operations = [operation]
    loader.get_gamme.return_value = gamme

    finder = CandidateFinder(loader=loader, config=SchedulingConfig())
    of = MagicMock()
    of.article = "ART001"
    of.qte_restante = 700

    hours = finder.calculate_of_hours_per_poste(of)
    assert hours["PP_830"] == 700 / 100  # 7.0
