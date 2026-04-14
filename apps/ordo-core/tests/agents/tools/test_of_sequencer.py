"""Tests pour sequence_ofs_for_poste (Outil 5)."""

from datetime import timedelta
from unittest.mock import MagicMock, patch

from src.agents.tools.of_sequencer import sequence_ofs_for_poste
from tests.agents.tools.conftest import TODAY, make_of, make_commande, make_loader


def _mock_checker(feasible=True):
    """Retourne un RecursiveChecker mocké."""
    checker = MagicMock()
    result = MagicMock()
    result.feasible = feasible
    checker.check_of.return_value = result
    return checker


class TestOFSequencer:

    @patch("src.agents.tools.of_sequencer.RecursiveChecker")
    @patch("src.agents.tools.of_sequencer.calculate_article_charge")
    def test_edd_trie_par_date_expedition(self, mock_charge, mock_checker_cls):
        """EDD : l'OF dont la commande expire le plus tôt est en premier."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 5.0}

        of_tardif = make_of("OF_B", "ART_B", 1, TODAY + timedelta(days=5))
        of_urgent = make_of("OF_A", "ART_A", 1, TODAY + timedelta(days=5))
        cmd_tardive = make_commande("CMD_B", "ART_B", TODAY + timedelta(days=10))
        cmd_urgente = make_commande("CMD_A", "ART_A", TODAY + timedelta(days=3))

        loader = make_loader(
            ofs=[of_tardif, of_urgent],
            commandes=[cmd_tardive, cmd_urgente],
        )

        result = sequence_ofs_for_poste(loader, "PP_830", regle="EDD", reference_date=TODAY)

        assert result.sequence[0].num_of == "OF_A"
        assert result.sequence[1].num_of == "OF_B"

    @patch("src.agents.tools.of_sequencer.RecursiveChecker")
    @patch("src.agents.tools.of_sequencer.calculate_article_charge")
    def test_spt_trie_par_duree_croissante(self, mock_charge, mock_checker_cls):
        """SPT : l'OF avec le moins d'heures sur le poste est en premier."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)

        of_long = make_of("OF_LONG", "ART_L", 1, TODAY + timedelta(days=5))
        of_court = make_of("OF_COURT", "ART_C", 1, TODAY + timedelta(days=5))

        def charge_side_effect(article, qte, loader):
            return {"PP_830": 2.0} if article == "ART_C" else {"PP_830": 8.0}

        mock_charge.side_effect = charge_side_effect
        loader = make_loader(ofs=[of_long, of_court])

        result = sequence_ofs_for_poste(loader, "PP_830", regle="SPT", reference_date=TODAY)

        assert result.sequence[0].num_of == "OF_COURT"

    @patch("src.agents.tools.of_sequencer.RecursiveChecker")
    @patch("src.agents.tools.of_sequencer.calculate_article_charge")
    def test_of_sans_ce_poste_exclu(self, mock_charge, mock_checker_cls):
        """Un OF qui n'utilise pas ce poste n'est pas séquencé."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_999": 5.0}  # autre poste

        of = make_of("OF001", "ART001", 1, TODAY + timedelta(days=5))
        loader = make_loader(ofs=[of])

        result = sequence_ofs_for_poste(loader, "PP_830", reference_date=TODAY)

        assert len(result.sequence) == 0

    @patch("src.agents.tools.of_sequencer.RecursiveChecker")
    @patch("src.agents.tools.of_sequencer.calculate_article_charge")
    def test_of_infaisable_exclu_si_only_feasible(self, mock_charge, mock_checker_cls):
        """Avec only_feasible=True, les OFs infaisables ne sont pas séquencés."""
        mock_checker_cls.return_value = _mock_checker(feasible=False)
        mock_charge.return_value = {"PP_830": 5.0}

        of = make_of("OF002", "ART002", 1, TODAY + timedelta(days=5))
        loader = make_loader(ofs=[of])

        result = sequence_ofs_for_poste(loader, "PP_830", only_feasible=True, reference_date=TODAY)

        assert len(result.sequence) == 0

    @patch("src.agents.tools.of_sequencer.RecursiveChecker")
    @patch("src.agents.tools.of_sequencer.calculate_article_charge")
    def test_retard_detecte(self, mock_charge, mock_checker_cls):
        """Un OF dont la date_fin est passée est marqué en_retard=True."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 5.0}

        of = make_of("OF003", "ART003", 1, TODAY - timedelta(days=2))
        loader = make_loader(ofs=[of])

        result = sequence_ofs_for_poste(loader, "PP_830", reference_date=TODAY)

        assert result.nb_ofs_en_retard == 1
        assert result.sequence[0].en_retard is True

    @patch("src.agents.tools.of_sequencer.RecursiveChecker")
    @patch("src.agents.tools.of_sequencer.calculate_article_charge")
    def test_charge_totale_correcte(self, mock_charge, mock_checker_cls):
        """La charge totale est la somme des heures de chaque OF sur le poste."""
        mock_checker_cls.return_value = _mock_checker(feasible=True)
        mock_charge.return_value = {"PP_830": 7.0}

        ofs = [
            make_of(f"OF{i}", f"ART{i}", 1, TODAY + timedelta(days=5))
            for i in range(3)
        ]
        loader = make_loader(ofs=ofs)

        result = sequence_ofs_for_poste(loader, "PP_830", reference_date=TODAY)

        assert result.charge_totale_heures == pytest.approx(21.0)


import pytest
