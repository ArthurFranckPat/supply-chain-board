"""Tests for ChargeCalculator"""

from unittest.mock import MagicMock
from datetime import date, timedelta


def test_calculate_charge_for_single_horizon():
    """Calculate charge for one week horizon"""
    from src.agents.organization.charge_calculator import ChargeCalculator

    loader = MagicMock()
    # Mock commandes dans S+1 (jours 1-7)
    cmd1 = MagicMock()
    cmd1.article = "ART001"
    cmd1.date_expedition_demandee = date.today() + timedelta(days=3)
    cmd1.est_commande.return_value = True
    cmd1.qte_restante = 700

    loader.commandes_clients = [cmd1]

    # Mock OF avec gamme
    of1 = MagicMock()
    of1.article = "ART001"
    of1.qte_restante = 700

    # Mock gamme avec opération PP_830
    operation = MagicMock()
    operation.poste_charge = "PP_830"
    operation.cadence = 100.0
    gamme = MagicMock()
    gamme.operations = [operation]
    loader.get_gamme.return_value = gamme

    # Mock matcher
    matcher = MagicMock()
    match_result = MagicMock()
    match_result.of = of1
    match_result.commande = cmd1
    matcher.match_commandes.return_value = [match_result]

    calculator = ChargeCalculator(loader)
    charges = calculator.calculate_charge_for_horizon(
        reference_date=date.today(),
        horizon_weeks=1,
        matcher=matcher
    )

    # 700 unités / 100 cadence = 7 heures
    assert charges["PP_830"] == 7.0


def test_calculate_charge_horizons_s1_to_s4():
    """Calculate charge for all 4 horizons"""
    from src.agents.organization.charge_calculator import ChargeCalculator
    from src.agents.organization.models import PosteChargeResult

    loader = MagicMock()
    matcher = MagicMock()

    # Mock pour retourner des charges croissantes
    def mock_calculate_horizon(reference_date, horizon_weeks, matcher):
        if horizon_weeks == 1:
            return {"PP_830": 25.0}
        elif horizon_weeks == 2:
            return {"PP_830": 35.0}
        elif horizon_weeks == 3:
            return {"PP_830": 45.0}
        elif horizon_weeks == 4:
            return {"PP_830": 60.0}
        return {}

    calculator = ChargeCalculator(loader)
    calculator.calculate_charge_for_horizon = mock_calculate_horizon

    results = calculator.calculate_charge_horizons(
        reference_date=date.today(),
        matcher=matcher
    )

    assert "PP_830" in results
    assert results["PP_830"].charge_s1 == 25.0
    assert results["PP_830"].charge_s2 == 35.0
    assert results["PP_830"].charge_s3 == 45.0
    assert results["PP_830"].charge_s4 == 60.0
