"""Tests pour detect_bottlenecks (Outil 3)."""

from datetime import timedelta
from unittest.mock import patch

from src.models.charge import ChargeByPoste
from src.agents.tools.bottleneck_detector import detect_bottlenecks
from tests.agents.tools.conftest import TODAY, make_loader


def _make_heatmap(poste, semaine, charge_h, libelle="POSTE TEST"):
    return [ChargeByPoste(poste_charge=poste, libelle_poste=libelle, charges={semaine: charge_h})]


class TestBottleneckDetector:

    @patch("src.agents.tools.bottleneck_detector.calculate_article_charge", return_value={})
    @patch("src.agents.tools.bottleneck_detector.calculate_weekly_charge_heatmap")
    def test_poste_sature_detecte(self, mock_heatmap, mock_charge):
        """Un poste à 110% de capacité est classé SATURÉ."""
        mock_heatmap.return_value = _make_heatmap("PP_830", "S+1", 38.5)  # > 35h
        loader = make_loader()

        alerts = detect_bottlenecks(loader, reference_date=TODAY, capacite_defaut=35.0)

        satures = [a for a in alerts if a.statut == "SATURE"]
        assert len(satures) == 1
        assert satures[0].poste == "PP_830"
        assert satures[0].taux_charge > 1.0

    @patch("src.agents.tools.bottleneck_detector.calculate_article_charge", return_value={})
    @patch("src.agents.tools.bottleneck_detector.calculate_weekly_charge_heatmap")
    def test_poste_tension_detecte(self, mock_heatmap, mock_charge):
        """Un poste à 90% de capacité est classé TENSION."""
        mock_heatmap.return_value = _make_heatmap("PP_128", "S+1", 31.5)  # 90% de 35h
        loader = make_loader()

        alerts = detect_bottlenecks(loader, reference_date=TODAY, capacite_defaut=35.0)

        tensions = [a for a in alerts if a.statut == "TENSION"]
        assert len(tensions) == 1
        assert tensions[0].poste == "PP_128"

    @patch("src.agents.tools.bottleneck_detector.calculate_article_charge", return_value={})
    @patch("src.agents.tools.bottleneck_detector.calculate_weekly_charge_heatmap")
    def test_poste_sous_charge_detecte(self, mock_heatmap, mock_charge):
        """Un poste à 50% de capacité est classé SOUS_CHARGE."""
        mock_heatmap.return_value = _make_heatmap("PP_091", "S+2", 17.5)  # 50% de 35h
        loader = make_loader()

        alerts = detect_bottlenecks(loader, reference_date=TODAY, capacite_defaut=35.0)

        sous_charges = [a for a in alerts if a.statut == "SOUS_CHARGE"]
        assert len(sous_charges) == 1
        assert sous_charges[0].poste == "PP_091"

    @patch("src.agents.tools.bottleneck_detector.calculate_article_charge", return_value={})
    @patch("src.agents.tools.bottleneck_detector.calculate_weekly_charge_heatmap")
    def test_poste_normal_exclu(self, mock_heatmap, mock_charge):
        """Un poste à 75% (entre 60% et 85%) n'est pas inclus dans les alertes."""
        mock_heatmap.return_value = _make_heatmap("PP_500", "S+1", 26.25)  # 75% de 35h
        loader = make_loader()

        alerts = detect_bottlenecks(loader, reference_date=TODAY, capacite_defaut=35.0)

        assert len(alerts) == 0

    @patch("src.agents.tools.bottleneck_detector.calculate_article_charge", return_value={})
    @patch("src.agents.tools.bottleneck_detector.calculate_weekly_charge_heatmap")
    def test_tri_sature_avant_tension(self, mock_heatmap, mock_charge):
        """Les postes SATURÉS apparaissent avant les postes en TENSION."""
        mock_heatmap.return_value = [
            ChargeByPoste("PP_T", "TENSION", {"S+1": 31.5}),
            ChargeByPoste("PP_S", "SATURE", {"S+1": 38.5}),
        ]
        loader = make_loader()

        alerts = detect_bottlenecks(loader, reference_date=TODAY, capacite_defaut=35.0)

        statuts = [a.statut for a in alerts]
        if "SATURE" in statuts and "TENSION" in statuts:
            assert statuts.index("SATURE") < statuts.index("TENSION")

    @patch("src.agents.tools.bottleneck_detector.calculate_article_charge", return_value={})
    @patch("src.agents.tools.bottleneck_detector.calculate_weekly_charge_heatmap")
    def test_filtre_par_semaine(self, mock_heatmap, mock_charge):
        """Le filtre semaines_cibles ne retourne que les alertes des semaines demandées."""
        mock_heatmap.return_value = [
            ChargeByPoste("PP_A", "POSTE A", {"S+1": 38.5, "S+2": 38.5}),
        ]
        loader = make_loader()

        alerts = detect_bottlenecks(
            loader, reference_date=TODAY, capacite_defaut=35.0,
            semaines_cibles=["S+1"],
        )

        semaines = [a.semaine for a in alerts]
        assert all(s == "S+1" for s in semaines)
        assert "S+2" not in semaines

    @patch("src.agents.tools.bottleneck_detector.calculate_article_charge", return_value={})
    @patch("src.agents.tools.bottleneck_detector.calculate_weekly_charge_heatmap")
    def test_capacite_par_poste_personnalisee(self, mock_heatmap, mock_charge):
        """Une capacité personnalisée par poste est respectée."""
        # PP_830 a une capacité de 70h (2x8) → 38.5h = 55% → SOUS_CHARGE
        mock_heatmap.return_value = _make_heatmap("PP_830", "S+1", 38.5)
        loader = make_loader()

        alerts = detect_bottlenecks(
            loader, reference_date=TODAY,
            capacite_par_poste={"PP_830": 70.0},
            capacite_defaut=35.0,
        )

        sous_charges = [a for a in alerts if a.statut == "SOUS_CHARGE"]
        assert any(a.poste == "PP_830" for a in sous_charges)
