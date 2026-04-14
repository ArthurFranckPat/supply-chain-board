"""Tests pour summarize_week_status (Outil 8)."""

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest

from src.agents.tools.week_summary import summarize_week_status
from tests.agents.tools.conftest import TODAY, make_loader


def _make_rescheduling_msg(type_, num_of="OF001", priorite=1):
    m = MagicMock()
    m.type = type_
    m.num_of = num_of
    m.message = f"[{type_}] OF {num_of}"
    m.action_recommandee = "Action requise"
    m.priorite = priorite
    return m


def _make_bottleneck(poste, statut, taux=1.1):
    a = MagicMock()
    a.poste = poste
    a.statut = statut
    a.semaine = "S+1"
    a.taux_charge = taux
    a.suggestion = f"{poste} suggestion"
    return a


def _make_reception_impact(article, risque="CRITIQUE", jours=7):
    r = MagicMock()
    r.article = article
    r.niveau_risque = risque
    r.jours_retard = jours
    r.fournisseur = "FOUR001"
    r.ofs_bloques = ["OF001"]
    return r


def _make_kpis(taux=0.92, nb_total=50, nb_servies=46, nb_retards=3,
               ofs_affermis=10, ofs_suggeres=5):
    k = MagicMock()
    k.taux_service_global = taux
    k.nb_commandes_total = nb_total
    k.nb_commandes_servies = nb_servies
    k.nb_commandes_en_retard = nb_retards
    k.ofs_affermis_actifs = ofs_affermis
    k.ofs_suggeres_actifs = ofs_suggeres
    k.commandes_en_retard = []
    return k


class TestWeekSummary:

    @patch("src.agents.tools.week_summary.get_service_rate_kpis")
    @patch("src.agents.tools.week_summary.detect_bottlenecks")
    @patch("src.agents.tools.week_summary.check_late_receptions_impact")
    @patch("src.agents.tools.week_summary.get_rescheduling_messages")
    def test_appelle_tous_les_sous_outils(self, mock_msg, mock_recep, mock_bn, mock_kpi):
        """summarize_week_status doit appeler les 4 sous-outils."""
        mock_msg.return_value = []
        mock_recep.return_value = []
        mock_bn.return_value = []
        mock_kpi.return_value = _make_kpis()
        loader = make_loader()

        summarize_week_status(loader, reference_date=TODAY)

        mock_msg.assert_called_once()
        mock_recep.assert_called_once()
        mock_bn.assert_called_once()
        mock_kpi.assert_called_once()

    @patch("src.agents.tools.week_summary.get_service_rate_kpis")
    @patch("src.agents.tools.week_summary.detect_bottlenecks")
    @patch("src.agents.tools.week_summary.check_late_receptions_impact")
    @patch("src.agents.tools.week_summary.get_rescheduling_messages")
    def test_messages_critiques_separes_des_importants(self, mock_msg, mock_recep, mock_bn, mock_kpi):
        """Les messages de priorité 1 (critiques) et 2 (importants) sont séparés."""
        mock_msg.return_value = [
            _make_rescheduling_msg("RETARD", priorite=1),
            _make_rescheduling_msg("URGENCE", "OF002", priorite=2),
        ]
        mock_recep.return_value = []
        mock_bn.return_value = []
        mock_kpi.return_value = _make_kpis()
        loader = make_loader()

        summary = summarize_week_status(loader, reference_date=TODAY)

        assert len(summary.messages_critiques) == 1
        assert summary.messages_critiques[0].type == "RETARD"
        assert len(summary.messages_importants) == 1
        assert summary.messages_importants[0].type == "URGENCE"

    @patch("src.agents.tools.week_summary.get_service_rate_kpis")
    @patch("src.agents.tools.week_summary.detect_bottlenecks")
    @patch("src.agents.tools.week_summary.check_late_receptions_impact")
    @patch("src.agents.tools.week_summary.get_rescheduling_messages")
    def test_goulots_et_sous_charges_separes(self, mock_msg, mock_recep, mock_bn, mock_kpi):
        """Les postes saturés/tension et sous-chargés sont séparés."""
        mock_msg.return_value = []
        mock_recep.return_value = []
        mock_bn.return_value = [
            _make_bottleneck("PP_830", "SATURE", taux=1.1),
            _make_bottleneck("PP_128", "TENSION", taux=0.88),
            _make_bottleneck("PP_091", "SOUS_CHARGE", taux=0.5),
        ]
        mock_kpi.return_value = _make_kpis()
        loader = make_loader()

        summary = summarize_week_status(loader, reference_date=TODAY)

        assert len(summary.alertes_goulots) == 2
        assert len(summary.postes_sous_charge) == 1
        assert summary.postes_sous_charge[0].poste == "PP_091"

    @patch("src.agents.tools.week_summary.get_service_rate_kpis")
    @patch("src.agents.tools.week_summary.detect_bottlenecks")
    @patch("src.agents.tools.week_summary.check_late_receptions_impact")
    @patch("src.agents.tools.week_summary.get_rescheduling_messages")
    def test_texte_briefing_contient_taux_service(self, mock_msg, mock_recep, mock_bn, mock_kpi):
        """Le texte de briefing mentionne le taux de service."""
        mock_msg.return_value = []
        mock_recep.return_value = []
        mock_bn.return_value = []
        mock_kpi.return_value = _make_kpis(taux=0.95, nb_total=100, nb_servies=95)
        loader = make_loader()

        summary = summarize_week_status(loader, reference_date=TODAY)

        assert "95" in summary.texte_briefing  # 95%
        assert "BRIEFING" in summary.texte_briefing

    @patch("src.agents.tools.week_summary.get_service_rate_kpis")
    @patch("src.agents.tools.week_summary.detect_bottlenecks")
    @patch("src.agents.tools.week_summary.check_late_receptions_impact")
    @patch("src.agents.tools.week_summary.get_rescheduling_messages")
    def test_situation_saine_message_positif(self, mock_msg, mock_recep, mock_bn, mock_kpi):
        """Sans alertes critiques, le briefing indique une situation sous contrôle."""
        mock_msg.return_value = []
        mock_recep.return_value = []
        mock_bn.return_value = []
        mock_kpi.return_value = _make_kpis()
        loader = make_loader()

        summary = summarize_week_status(loader, reference_date=TODAY)

        assert "sous contrôle" in summary.texte_briefing

    @patch("src.agents.tools.week_summary.get_service_rate_kpis")
    @patch("src.agents.tools.week_summary.detect_bottlenecks")
    @patch("src.agents.tools.week_summary.check_late_receptions_impact")
    @patch("src.agents.tools.week_summary.get_rescheduling_messages")
    def test_kpis_accessible_depuis_summary(self, mock_msg, mock_recep, mock_bn, mock_kpi):
        """Les KPIs sont accessibles directement depuis le WeekSummary."""
        kpis = _make_kpis(taux=0.88, ofs_affermis=12, ofs_suggeres=8)
        mock_msg.return_value = []
        mock_recep.return_value = []
        mock_bn.return_value = []
        mock_kpi.return_value = kpis
        loader = make_loader()

        summary = summarize_week_status(loader, reference_date=TODAY)

        assert summary.taux_service_global == pytest.approx(0.88)
        assert summary.nb_ofs_affermis == 12
        assert summary.nb_ofs_suggeres == 8
        assert summary.kpis is kpis
