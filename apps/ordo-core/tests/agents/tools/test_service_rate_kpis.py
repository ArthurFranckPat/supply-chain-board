"""Tests pour get_service_rate_kpis (Outil 6)."""

from datetime import timedelta
from unittest.mock import patch

from src.models.charge import ChargeByPoste
from src.agents.tools.service_rate_kpis import get_service_rate_kpis
from tests.agents.tools.conftest import TODAY, make_of, make_commande, make_loader


def _empty_heatmap():
    return []


class TestServiceRateKPIs:

    @patch("src.agents.tools.service_rate_kpis.calculate_weekly_charge_heatmap", return_value=[])
    def test_taux_service_global(self, _):
        """Le taux de service global = commandes servies / total."""
        commandes = [
            make_commande("C1", "ART1", TODAY + timedelta(days=5),
                          qte_commandee=100, qte_allouee=100, qte_restante=0),
            make_commande("C2", "ART2", TODAY + timedelta(days=5),
                          qte_commandee=100, qte_allouee=50, qte_restante=50),
            make_commande("C3", "ART3", TODAY + timedelta(days=5),
                          qte_commandee=100, qte_allouee=100, qte_restante=0),
        ]
        loader = make_loader(commandes=commandes)

        kpis = get_service_rate_kpis(loader, reference_date=TODAY)

        assert kpis.nb_commandes_total == 3
        assert kpis.nb_commandes_servies == 2
        assert kpis.taux_service_global == pytest.approx(2 / 3, rel=1e-3)

    @patch("src.agents.tools.service_rate_kpis.calculate_weekly_charge_heatmap", return_value=[])
    def test_commandes_en_retard_detectees(self, _):
        """Les commandes dont la date est dépassée et qte_restante > 0 sont signalées."""
        commandes = [
            make_commande("C_RETARD", "ART1", TODAY - timedelta(days=3),
                          qte_restante=50),
            make_commande("C_OK", "ART2", TODAY + timedelta(days=5),
                          qte_restante=50),
        ]
        loader = make_loader(commandes=commandes)

        kpis = get_service_rate_kpis(loader, reference_date=TODAY)

        assert kpis.nb_commandes_en_retard == 1
        assert "C_RETARD" in kpis.commandes_en_retard

    @patch("src.agents.tools.service_rate_kpis.calculate_weekly_charge_heatmap", return_value=[])
    def test_ofs_classifies_correctement(self, _):
        """Les OFs sont classés fermes vs suggérés."""
        ofs = [
            make_of("OF_F1", "ART1", 1, TODAY + timedelta(days=5)),
            make_of("OF_F2", "ART2", 1, TODAY + timedelta(days=5)),
            make_of("OF_S1", "ART3", 3, TODAY + timedelta(days=10)),
        ]
        loader = make_loader(ofs=ofs)

        kpis = get_service_rate_kpis(loader, reference_date=TODAY)

        assert kpis.ofs_affermis_actifs == 2
        assert kpis.ofs_suggeres_actifs == 1

    @patch("src.agents.tools.service_rate_kpis.calculate_weekly_charge_heatmap", return_value=[])
    def test_of_complete_exclu(self, _):
        """Un OF avec qte_restante=0 n'est pas compté."""
        ofs = [
            make_of("OF_DONE", "ART1", 1, TODAY + timedelta(days=5), qte_restante=0),
            make_of("OF_ACTIF", "ART2", 1, TODAY + timedelta(days=5), qte_restante=10),
        ]
        loader = make_loader(ofs=ofs)

        kpis = get_service_rate_kpis(loader, reference_date=TODAY)

        assert kpis.ofs_affermis_actifs == 1

    @patch("src.agents.tools.service_rate_kpis.calculate_weekly_charge_heatmap")
    def test_utilisation_postes_s1(self, mock_heatmap):
        """Le taux d'utilisation des postes S+1 est calculé."""
        mock_heatmap.return_value = [
            ChargeByPoste("PP_830", "LIGNE", {"S+1": 28.0}),  # 80% de 35h
        ]
        loader = make_loader()

        kpis = get_service_rate_kpis(loader, reference_date=TODAY, capacite_defaut=35.0)

        assert "PP_830" in kpis.utilisation_postes_s1
        assert kpis.utilisation_postes_s1["PP_830"] == pytest.approx(28.0 / 35.0, rel=1e-3)

    @patch("src.agents.tools.service_rate_kpis.calculate_weekly_charge_heatmap", return_value=[])
    def test_kpis_par_client(self, _):
        """Les KPIs sont ventilés par client."""
        commandes = [
            make_commande("C1", "ART1", TODAY + timedelta(days=5),
                          qte_commandee=100, qte_allouee=100, qte_restante=0, nom_client="ALDES"),
            make_commande("C2", "ART2", TODAY + timedelta(days=5),
                          qte_commandee=100, qte_allouee=0, qte_restante=100, nom_client="AERECO"),
        ]
        loader = make_loader(commandes=commandes)

        kpis = get_service_rate_kpis(loader, reference_date=TODAY)

        noms = {k.nom_client: k for k in kpis.kpis_par_client}
        assert "ALDES" in noms
        assert "AERECO" in noms
        assert noms["ALDES"].taux_service == 1.0
        assert noms["AERECO"].taux_service == 0.0


import pytest
