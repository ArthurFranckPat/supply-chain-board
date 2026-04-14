"""Tests pour get_rescheduling_messages (Outil 1)."""

from datetime import timedelta

import pytest

from src.agents.tools.rescheduling_messages import get_rescheduling_messages
from tests.agents.tools.conftest import TODAY, make_of, make_commande, make_reception, make_nomenclature, make_stock, make_loader


class TestReschedulingMessages:

    def test_retard_quand_date_fin_depassee(self):
        """Un OF dont la date_fin est passée génère un message RETARD."""
        of = make_of("OF001", "ART001", 1, TODAY - timedelta(days=3))
        loader = make_loader(ofs=[of])

        messages = get_rescheduling_messages(loader, reference_date=TODAY)

        assert len(messages) == 1
        assert messages[0].type == "RETARD"
        assert messages[0].num_of == "OF001"
        assert messages[0].jours_ecart == 3

    def test_retard_imminent_sur_of_ferme(self):
        """Un OF ferme à J+1 génère un message RETARD_IMMINENT."""
        of = make_of("OF002", "ART002", 1, TODAY + timedelta(days=1))
        loader = make_loader(ofs=[of])

        messages = get_rescheduling_messages(loader, reference_date=TODAY)

        assert len(messages) == 1
        assert messages[0].type == "RETARD_IMMINENT"
        assert messages[0].priorite == 1

    def test_pas_retard_imminent_sur_of_suggere(self):
        """Un OF suggéré à J+1 ne génère pas RETARD_IMMINENT (uniquement pour les fermes)."""
        of = make_of("OF003", "ART003", 3, TODAY + timedelta(days=1))
        loader = make_loader(ofs=[of])

        messages = get_rescheduling_messages(loader, reference_date=TODAY)

        types = [m.type for m in messages]
        assert "RETARD_IMMINENT" not in types

    def test_urgence_quand_commande_expire_bientot(self):
        """Un OF suggéré avec une commande à J+3 génère un message URGENCE."""
        of = make_of("OF004", "ART004", 3, TODAY + timedelta(days=10))
        commande = make_commande("CMD001", "ART004", TODAY + timedelta(days=3))
        loader = make_loader(ofs=[of], commandes=[commande])

        messages = get_rescheduling_messages(loader, reference_date=TODAY)

        assert any(m.type == "URGENCE" for m in messages)
        urgence = next(m for m in messages if m.type == "URGENCE")
        assert urgence.commande_liee == "CMD001"

    def test_pas_urgence_si_commande_lointaine(self):
        """Pas de message URGENCE si la commande est à J+10."""
        of = make_of("OF005", "ART005", 3, TODAY + timedelta(days=20))
        commande = make_commande("CMD002", "ART005", TODAY + timedelta(days=10))
        loader = make_loader(ofs=[of], commandes=[commande])

        messages = get_rescheduling_messages(loader, reference_date=TODAY)

        assert not any(m.type == "URGENCE" for m in messages)

    def test_deblocage_quand_reception_imminente(self):
        """Un OF suggéré dont un composant est attendu dans 2j génère DEBLOCAGE."""
        of = make_of("OF006", "ART006", 3, TODAY + timedelta(days=15))
        nomenclature = make_nomenclature("ART006", [("COMP001", 1.0, "Acheté")])
        reception = make_reception("COMP001", TODAY + timedelta(days=2))
        loader = make_loader(
            ofs=[of],
            receptions=[reception],
            nomenclatures={"ART006": nomenclature},
        )

        messages = get_rescheduling_messages(loader, reference_date=TODAY)

        assert any(m.type == "DEBLOCAGE" for m in messages)

    def test_of_completed_exclu(self):
        """Un OF avec qte_restante=0 n'est pas inclus."""
        of = make_of("OF007", "ART007", 1, TODAY - timedelta(days=5), qte_restante=0)
        loader = make_loader(ofs=[of])

        messages = get_rescheduling_messages(loader, reference_date=TODAY)

        assert len(messages) == 0

    def test_tri_par_priorite(self):
        """Les messages critiques (priorité 1) apparaissent avant les importants (priorité 2)."""
        of_retard = make_of("OF010", "ART010", 1, TODAY - timedelta(days=1))
        of_urgence = make_of("OF011", "ART011", 3, TODAY + timedelta(days=15))
        commande = make_commande("CMD010", "ART011", TODAY + timedelta(days=2))
        loader = make_loader(ofs=[of_retard, of_urgence], commandes=[commande])

        messages = get_rescheduling_messages(loader, reference_date=TODAY)

        assert messages[0].priorite <= messages[-1].priorite

    def test_pas_deblocage_si_stock_suffisant(self):
        """Pas de DEBLOCAGE si le stock couvre déjà le besoin de l'OF."""
        of = make_of("OF_OK", "ART_OK", 3, TODAY + timedelta(days=15), qte_restante=10)
        nomenclature = make_nomenclature("ART_OK", [("COMP_STOCK", 1.0, "Acheté")])
        reception = make_reception("COMP_STOCK", TODAY + timedelta(days=2))
        stock = make_stock("COMP_STOCK", physique=100, alloue=0)  # dispo=100 > besoin=10
        loader = make_loader(
            ofs=[of],
            receptions=[reception],
            nomenclatures={"ART_OK": nomenclature},
            stocks={"COMP_STOCK": stock},
        )

        messages = get_rescheduling_messages(loader, reference_date=TODAY)

        assert not any(m.type == "DEBLOCAGE" for m in messages)

    def test_zombie_of_exclu_par_max_retard(self):
        """Un OF en retard de plus de max_retard_days est ignoré (donnée stale)."""
        of_zombie = make_of("OF_ZOMBIE", "ART_Z", 1, TODAY - timedelta(days=500))
        loader = make_loader(ofs=[of_zombie])

        messages = get_rescheduling_messages(loader, reference_date=TODAY, max_retard_days=90)

        assert len(messages) == 0

    def test_of_dans_horizon_retard_inclus(self):
        """Un OF en retard de 30 jours (< max_retard_days=90) génère bien un message RETARD."""
        of = make_of("OF_RETARD_30", "ART_R", 1, TODAY - timedelta(days=30))
        loader = make_loader(ofs=[of])

        messages = get_rescheduling_messages(loader, reference_date=TODAY, max_retard_days=90)

        assert len(messages) == 1
        assert messages[0].type == "RETARD"
        assert messages[0].jours_ecart == 30
