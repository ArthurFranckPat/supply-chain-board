"""Tests pour suggest_ofs_to_affirm (Outil 9)."""

from datetime import timedelta
from unittest.mock import MagicMock, patch

import pytest

from src.agents.tools.of_affirm_suggester import suggest_ofs_to_affirm
from tests.agents.tools.conftest import (
    TODAY, make_of, make_commande, make_stock,
    make_nomenclature, make_loader,
)


def _mock_checker(feasible=True, missing=None):
    """Retourne un RecursiveChecker mocké."""
    checker = MagicMock()
    result = MagicMock()
    result.feasible = feasible
    result.missing_components = missing or {}
    result.alerts = []
    checker.check_of.return_value = result
    return checker


class TestOFAffirmSuggester:

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_of_faisable_recommande(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """Un OF suggéré faisable est inclus dans les recommandations."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 5.0}
        mock_classify.return_value = (set(), set())  # pas lié à prévisions ni commandes FR
        mock_is_composant.return_value = True  # article est un composant

        of = make_of("OF001", "ART001", 3, TODAY + timedelta(days=7))
        loader = make_loader(ofs=[of])

        plan = suggest_ofs_to_affirm(loader, reference_date=TODAY, horizon_jours=14)

        assert len(plan.ofs_recommandes) == 1
        assert plan.ofs_recommandes[0].num_of == "OF001"

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_of_infaisable_exclu(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """Un OF suggéré non faisable est exclu des recommandations."""
        mock_checker_cls.return_value = _mock_checker(
            feasible=False, missing={"COMP001": 50}
        )
        mock_charge.return_value = {"PP_830": 5.0}
        mock_classify.return_value = (set(), set())
        mock_is_composant.return_value = True

        of = make_of("OF002", "ART002", 3, TODAY + timedelta(days=7))
        loader = make_loader(ofs=[of])

        plan = suggest_ofs_to_affirm(loader, reference_date=TODAY, horizon_jours=14)

        assert len(plan.ofs_recommandes) == 0
        assert len(plan.ofs_infaisables) == 1
        assert plan.ofs_infaisables[0].num_of == "OF002"
        assert "COMP001" in plan.ofs_infaisables[0].raison_infaisabilite

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_of_ferme_exclu(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """Un OF ferme (statut=1) n'est pas un candidat (on ne cherche que les suggérés)."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 5.0}
        mock_classify.return_value = (set(), set())
        mock_is_composant.return_value = True

        of_ferme = make_of("OF_F", "ART_F", 1, TODAY + timedelta(days=7))
        of_suggere = make_of("OF_S", "ART_S", 3, TODAY + timedelta(days=7))
        loader = make_loader(ofs=[of_ferme, of_suggere])

        plan = suggest_ofs_to_affirm(loader, reference_date=TODAY, horizon_jours=14)

        nums = [s.num_of for s in plan.ofs_recommandes]
        assert "OF_F" not in nums
        assert "OF_S" in nums

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_of_hors_horizon_exclu(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """Un OF dont la date_fin dépasse l'horizon n'est pas analysé."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 5.0}
        mock_classify.return_value = (set(), set())
        mock_is_composant.return_value = True

        of_loin = make_of("OF_LOIN", "ART_L", 3, TODAY + timedelta(days=30))
        of_proche = make_of("OF_PROCHE", "ART_P", 3, TODAY + timedelta(days=7))
        loader = make_loader(ofs=[of_loin, of_proche])

        plan = suggest_ofs_to_affirm(loader, reference_date=TODAY, horizon_jours=14)

        nums = [s.num_of for s in plan.ofs_recommandes]
        assert "OF_LOIN" not in nums
        assert "OF_PROCHE" in nums

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_priorite_commandes_urgentes(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """L'OF couvrant la commande la plus urgente a un score supérieur.

        OF_URG (date_fin=J+3) couvre CMD_URG (expédition=J+5, urgente car <=J+7).
        OF_NOR (date_fin=J+10) couvre CMD_NOR (expédition=J+20, non urgente).
        OF_URG doit apparaître en premier (score plus élevé).
        """
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 5.0}
        mock_classify.return_value = (set(), set())
        mock_is_composant.return_value = True

        # date_fin OF < date_expedition CMD : l'OF sera prêt avant le besoin
        of_urgent = make_of("OF_URG", "ART_URG", 3, TODAY + timedelta(days=3))
        of_normal = make_of("OF_NOR", "ART_NOR", 3, TODAY + timedelta(days=10))
        cmd_urgente = make_commande("CMD_URG", "ART_URG", TODAY + timedelta(days=5))   # <= J+7 → urgente
        cmd_normale = make_commande("CMD_NOR", "ART_NOR", TODAY + timedelta(days=20))  # > J+7 → non urgente
        loader = make_loader(
            ofs=[of_normal, of_urgent],
            commandes=[cmd_normale, cmd_urgente],
        )

        plan = suggest_ofs_to_affirm(loader, reference_date=TODAY, horizon_jours=14)

        assert plan.ofs_recommandes[0].num_of == "OF_URG"

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_capacite_limite_hors_capacite(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """Un OF faisable est mis hors_capacite si les postes sont saturés."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_classify.return_value = (set(), set())
        mock_is_composant.return_value = True

        of1 = make_of("OF_A", "ART_A", 3, TODAY + timedelta(days=5))
        of2 = make_of("OF_B", "ART_B", 3, TODAY + timedelta(days=6))

        def charge_side_effect(article, qte, loader):
            return {"PP_830": 20.0}

        mock_charge.side_effect = charge_side_effect
        loader = make_loader(ofs=[of1, of2])

        # Capacité PP_830 = 25h : OF_A prend 20h, OF_B ne rentre pas
        plan = suggest_ofs_to_affirm(
            loader, reference_date=TODAY, horizon_jours=14,
            capacite_par_poste={"PP_830": 25.0},
        )

        assert len(plan.ofs_recommandes) == 1
        assert len(plan.ofs_hors_capacite) == 1

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_commandes_couvertes_comptees(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """Les commandes couvertes par les OFs recommandés sont comptabilisées."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 5.0}
        mock_classify.return_value = (set(), set())
        mock_is_composant.return_value = True

        of = make_of("OF001", "ART001", 3, TODAY + timedelta(days=7))
        cmd1 = make_commande("CMD1", "ART001", TODAY + timedelta(days=10))
        cmd2 = make_commande("CMD2", "ART001", TODAY + timedelta(days=12))
        loader = make_loader(ofs=[of], commandes=[cmd1, cmd2])

        plan = suggest_ofs_to_affirm(loader, reference_date=TODAY, horizon_jours=14)

        assert plan.nb_commandes_couvertes == 2
        assert len(plan.ofs_recommandes[0].commandes_couvertes) == 2

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_aucun_candidat_retourne_plan_vide(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """Sans OFs suggérés dans l'horizon, le plan est vide."""
        mock_classify.return_value = (set(), set())
        mock_is_composant.return_value = False
        loader = make_loader(ofs=[])

        plan = suggest_ofs_to_affirm(loader, reference_date=TODAY, horizon_jours=14)

        assert len(plan.ofs_recommandes) == 0
        assert plan.nb_candidates == 0
        assert "Aucun" in plan.texte_recommandation

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_charge_additionnelle_correcte(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """La charge additionnelle totalise les heures des OFs recommandés."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 8.0}
        mock_classify.return_value = (set(), set())
        mock_is_composant.return_value = True

        ofs = [
            make_of(f"OF{i}", f"ART{i}", 3, TODAY + timedelta(days=5))
            for i in range(3)
        ]
        loader = make_loader(ofs=ofs)

        plan = suggest_ofs_to_affirm(loader, reference_date=TODAY, horizon_jours=14)

        assert plan.charge_additionnelle.get("PP_830", 0) == pytest.approx(24.0)

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_of_planifie_statut2_inclus(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """Un OF planifié (statut=2) est inclus comme candidat à l'affermissement."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 5.0}
        mock_classify.return_value = (set(), set())
        mock_is_composant.return_value = False

        of_planifie = make_of("OF_PLAN", "ART_PLAN", 2, TODAY + timedelta(days=7))
        loader = make_loader(ofs=[of_planifie])

        plan = suggest_ofs_to_affirm(loader, reference_date=TODAY, horizon_jours=14)

        assert any(s.num_of == "OF_PLAN" for s in plan.ofs_recommandes)

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_wos_canal_fr_exclu(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """Un WOS (statut=3) pour un article avec prévision FR est exclu."""
        from src.models.besoin_client import NatureBesoin

        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 5.0}
        # OF_FR est lié à une prévision FR, OF_EXPORT non
        mock_classify.return_value = ({"OF_FR"}, set())
        # ART_FR n'est pas un composant, ART_EXPORT l'est (pour qu'il soit inclus)
        def is_composant_side_effect(loader, article):
            return article == "ART_EXPORT"
        mock_is_composant.side_effect = is_composant_side_effect

        # OF suggéré pour un article FR canal
        of_fr = make_of("OF_FR", "ART_FR", 3, TODAY + timedelta(days=7))
        # OF suggéré pour un article non FR canal
        of_export = make_of("OF_EXPORT", "ART_EXPORT", 3, TODAY + timedelta(days=7))

        # Prévision FR pour ART_FR (déclenche l'exclusion)
        prev_fr = make_commande(
            "PREV001", "ART_FR", TODAY + timedelta(days=30),
            code_pays="FR", nature_besoin=NatureBesoin.PREVISION,
        )
        loader = make_loader(ofs=[of_fr, of_export], commandes=[prev_fr])

        plan = suggest_ofs_to_affirm(loader, reference_date=TODAY, horizon_jours=14)

        nums_recommandes = [s.num_of for s in plan.ofs_recommandes]
        nums_exclus = [s.num_of for s in plan.ofs_infaisables + plan.ofs_hors_capacite]
        assert "OF_FR" not in nums_recommandes
        assert "OF_FR" not in nums_exclus   # exclu silencieusement (pas un candidat)
        assert "OF_EXPORT" in nums_recommandes

    @patch("src.agents.tools.of_affirm_suggester._classify_ofs_by_allocation")
    @patch("src.agents.tools.of_affirm_suggester._is_composant_in_nomenclature")
    @patch("src.agents.tools.of_affirm_suggester.RecursiveChecker")
    @patch("src.agents.tools.of_affirm_suggester.calculate_article_charge")
    def test_texte_recommandation_contient_of(self, mock_charge, mock_checker_cls, mock_is_composant, mock_classify):
        """Le texte de recommandation mentionne les OFs recommandés."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 5.0}
        mock_classify.return_value = (set(), set())
        mock_is_composant.return_value = True

        of = make_of("OF_TEST", "ART_TEST", 3, TODAY + timedelta(days=5))
        loader = make_loader(ofs=[of])

        plan = suggest_ofs_to_affirm(loader, reference_date=TODAY, horizon_jours=14)

        assert "OF_TEST" in plan.texte_recommandation
        assert "PLAN" in plan.texte_recommandation
