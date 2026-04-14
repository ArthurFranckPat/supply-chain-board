"""Tests pour simulate_schedule_impact (Outil 4)."""

from datetime import timedelta
from unittest.mock import patch

from src.models.charge import ChargeByPoste
from src.agents.tools.schedule_simulator import simulate_schedule_impact
from tests.agents.tools.conftest import TODAY, make_of, make_loader


def _heatmap(poste, semaine, charge_h):
    return [ChargeByPoste(poste_charge=poste, libelle_poste="TEST", charges={semaine: charge_h})]


def _week_info(semaine="S+2"):
    return {"week_label": semaine}


class TestScheduleSimulator:

    @patch("src.agents.tools.schedule_simulator.get_week_info", return_value=_week_info("S+2"))
    @patch("src.agents.tools.schedule_simulator.calculate_article_charge", return_value={"PP_830": 10.0})
    @patch("src.agents.tools.schedule_simulator.calculate_weekly_charge_heatmap")
    def test_delta_calcule_correctement(self, mock_heatmap, mock_charge, mock_week):
        """Le delta correspond à la charge additionnelle des OFs simulés."""
        mock_heatmap.return_value = _heatmap("PP_830", "S+2", 20.0)
        of = make_of("OF001", "ART001", 1, TODAY + timedelta(days=10))
        loader = make_loader(ofs=[of])

        result = simulate_schedule_impact(loader, ["OF001"], reference_date=TODAY)

        assert result.delta["PP_830"]["S+2"] == 10.0
        assert result.simulated["PP_830"]["S+2"] == 30.0

    @patch("src.agents.tools.schedule_simulator.get_week_info", return_value=_week_info("S+1"))
    @patch("src.agents.tools.schedule_simulator.calculate_article_charge", return_value={"PP_830": 5.0})
    @patch("src.agents.tools.schedule_simulator.calculate_weekly_charge_heatmap")
    def test_of_introuvable_ignore(self, mock_heatmap, mock_charge, mock_week):
        """Un numéro d'OF inexistant n'est pas inclus dans la simulation."""
        mock_heatmap.return_value = _heatmap("PP_830", "S+1", 20.0)
        loader = make_loader(ofs=[])

        result = simulate_schedule_impact(loader, ["OF_INEXISTANT"], reference_date=TODAY)

        assert result.ofs_simules == []
        assert "OF_INEXISTANT" in result.recommendation

    @patch("src.agents.tools.schedule_simulator.get_week_info", return_value=_week_info("S+1"))
    @patch("src.agents.tools.schedule_simulator.calculate_article_charge", return_value={"PP_830": 20.0})
    @patch("src.agents.tools.schedule_simulator.calculate_weekly_charge_heatmap")
    def test_bottleneck_cree_detecte(self, mock_heatmap, mock_charge, mock_week):
        """Un poste qui passe en saturation suite à la simulation est signalé."""
        # Baseline : PP_830 à 20h (57%) — sous 35h de capacité
        mock_heatmap.return_value = _heatmap("PP_830", "S+1", 20.0)
        of = make_of("OF002", "ART002", 1, TODAY + timedelta(days=5))
        loader = make_loader(ofs=[of])

        # Ajoute 20h → total 40h > 35h → SATURÉ
        result = simulate_schedule_impact(loader, ["OF002"], reference_date=TODAY, capacite_defaut=35.0)

        assert any("PP_830" in b for b in result.bottlenecks_created)

    @patch("src.agents.tools.schedule_simulator.get_week_info", return_value=_week_info("S+1"))
    @patch("src.agents.tools.schedule_simulator.calculate_article_charge", return_value={"PP_830": 15.0})
    @patch("src.agents.tools.schedule_simulator.calculate_weekly_charge_heatmap")
    def test_of_sans_qte_restante_ignore(self, mock_heatmap, mock_charge, mock_week):
        """Un OF avec qte_restante=0 n'est pas simulé."""
        mock_heatmap.return_value = _heatmap("PP_830", "S+1", 10.0)
        of = make_of("OF003", "ART003", 1, TODAY + timedelta(days=5), qte_restante=0)
        loader = make_loader(ofs=[of])

        result = simulate_schedule_impact(loader, ["OF003"], reference_date=TODAY)

        assert result.ofs_simules == []

    @patch("src.agents.tools.schedule_simulator.get_week_info", return_value=_week_info("S+2"))
    @patch("src.agents.tools.schedule_simulator.calculate_article_charge", return_value={"PP_830": 5.0})
    @patch("src.agents.tools.schedule_simulator.calculate_weekly_charge_heatmap")
    def test_baseline_inchange(self, mock_heatmap, mock_charge, mock_week):
        """La baseline ne doit pas être modifiée par la simulation."""
        mock_heatmap.return_value = _heatmap("PP_830", "S+2", 15.0)
        of = make_of("OF004", "ART004", 1, TODAY + timedelta(days=10))
        loader = make_loader(ofs=[of])

        result = simulate_schedule_impact(loader, ["OF004"], reference_date=TODAY)

        assert result.baseline["PP_830"]["S+2"] == 15.0
        assert result.simulated["PP_830"]["S+2"] == 20.0
