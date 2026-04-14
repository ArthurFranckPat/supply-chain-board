"""Tests pour check_late_receptions_impact (Outil 2)."""

from datetime import timedelta

from src.agents.tools.late_receptions import check_late_receptions_impact
from tests.agents.tools.conftest import (
    TODAY, make_of, make_commande, make_reception,
    make_nomenclature, make_loader,
)


class TestLateReceptions:

    def test_reception_en_retard_detectee(self):
        """Une réception dont la date est passée est signalée."""
        reception = make_reception("COMP001", TODAY - timedelta(days=4))
        loader = make_loader(receptions=[reception])

        impacts = check_late_receptions_impact(loader, reference_date=TODAY)

        assert len(impacts) == 1
        assert impacts[0].article == "COMP001"
        assert impacts[0].jours_retard == 4

    def test_reception_future_ignoree(self):
        """Une réception dont la date est dans le futur n'est pas signalée."""
        reception = make_reception("COMP002", TODAY + timedelta(days=2))
        loader = make_loader(receptions=[reception])

        impacts = check_late_receptions_impact(loader, reference_date=TODAY)

        assert len(impacts) == 0

    def test_reception_quantite_nulle_ignoree(self):
        """Une réception avec qte=0 n'est pas signalée."""
        reception = make_reception("COMP003", TODAY - timedelta(days=1), qte=0)
        loader = make_loader(receptions=[reception])

        impacts = check_late_receptions_impact(loader, reference_date=TODAY)

        assert len(impacts) == 0

    def test_cascade_vers_ofs(self):
        """Les OFs dont la nomenclature utilise le composant en retard sont listés."""
        reception = make_reception("COMP010", TODAY - timedelta(days=2))
        nomenclature = make_nomenclature("ART_PARENT", [("COMP010", 1.0, "Acheté")])
        of = make_of("OF_IMPACTE", "ART_PARENT", 1, TODAY + timedelta(days=5))
        loader = make_loader(
            ofs=[of],
            receptions=[reception],
            nomenclatures={"ART_PARENT": nomenclature},
        )

        impacts = check_late_receptions_impact(loader, reference_date=TODAY)

        assert len(impacts) == 1
        assert "OF_IMPACTE" in impacts[0].ofs_bloques

    def test_cascade_vers_commandes(self):
        """Les commandes liées aux articles impactés sont listées."""
        reception = make_reception("COMP020", TODAY - timedelta(days=2))
        nomenclature = make_nomenclature("ART_PARENT2", [("COMP020", 1.0, "Acheté")])
        commande = make_commande("CMD_IMPACT", "ART_PARENT2", TODAY + timedelta(days=3))
        loader = make_loader(
            commandes=[commande],
            receptions=[reception],
            nomenclatures={"ART_PARENT2": nomenclature},
        )

        impacts = check_late_receptions_impact(loader, reference_date=TODAY)

        assert "CMD_IMPACT" in impacts[0].commandes_impactees

    def test_niveau_risque_critique(self):
        """Un retard de 7 jours ou plus donne un niveau CRITIQUE."""
        reception = make_reception("COMP030", TODAY - timedelta(days=8))
        loader = make_loader(receptions=[reception])

        impacts = check_late_receptions_impact(loader, reference_date=TODAY)

        assert impacts[0].niveau_risque == "CRITIQUE"

    def test_niveau_risque_moyen(self):
        """Un retard de 1 jour sans OF bloqué donne un niveau MOYEN."""
        reception = make_reception("COMP040", TODAY - timedelta(days=1))
        loader = make_loader(receptions=[reception])

        impacts = check_late_receptions_impact(loader, reference_date=TODAY)

        assert impacts[0].niveau_risque == "MOYEN"

    def test_tri_critique_en_premier(self):
        """Les impacts CRITIQUE apparaissent avant MOYEN."""
        rec_critique = make_reception("C1", TODAY - timedelta(days=10))
        rec_moyen = make_reception("C2", TODAY - timedelta(days=1))
        loader = make_loader(receptions=[rec_moyen, rec_critique])

        impacts = check_late_receptions_impact(loader, reference_date=TODAY)

        assert impacts[0].niveau_risque == "CRITIQUE"

    def test_reception_ancienne_exclue_par_max_retard(self):
        """Une réception vieille de plus de max_retard_days est ignorée (donnée stale)."""
        reception_stale = make_reception("COMP_STALE", TODAY - timedelta(days=500))
        loader = make_loader(receptions=[reception_stale])

        impacts = check_late_receptions_impact(loader, reference_date=TODAY, max_retard_days=90)

        assert len(impacts) == 0

    def test_reception_dans_horizon_retard_incluse(self):
        """Une réception en retard de 30 jours (< max_retard_days=90) est bien incluse."""
        reception = make_reception("COMP_30J", TODAY - timedelta(days=30))
        loader = make_loader(receptions=[reception])

        impacts = check_late_receptions_impact(loader, reference_date=TODAY, max_retard_days=90)

        assert len(impacts) == 1
        assert impacts[0].jours_retard == 30
