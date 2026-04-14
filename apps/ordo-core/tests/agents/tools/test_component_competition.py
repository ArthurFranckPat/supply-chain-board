"""Tests pour get_competing_ofs_for_component (Outil 7)."""

from datetime import timedelta

import pytest

from src.agents.tools.component_competition import get_competing_ofs_for_component
from tests.agents.tools.conftest import (
    TODAY, make_of, make_reception, make_stock,
    make_nomenclature, make_loader,
)


class TestComponentCompetition:

    def test_ofs_concurrents_trouves(self):
        """Les OFs dont la nomenclature contient le composant sont listés."""
        nomenclature = make_nomenclature("ART_PARENT", [("COMP001", 2.0, "Acheté")])
        of = make_of("OF001", "ART_PARENT", 1, TODAY + timedelta(days=5), qte_restante=100)
        stock = make_stock("COMP001", physique=300, alloue=0)
        loader = make_loader(
            ofs=[of],
            nomenclatures={"ART_PARENT": nomenclature},
            stocks={"COMP001": stock},
        )

        result = get_competing_ofs_for_component(loader, "COMP001")

        assert len(result.ofs_concurrents) == 1
        assert result.ofs_concurrents[0].num_of == "OF001"
        assert result.ofs_concurrents[0].qte_besoin == pytest.approx(200.0)  # 2.0 × 100

    def test_deficit_calcule(self):
        """Le déficit = besoin_total - stock_disponible (min 0)."""
        nomenclature = make_nomenclature("ART_A", [("COMP002", 3.0, "Acheté")])
        of = make_of("OF002", "ART_A", 1, TODAY + timedelta(days=5), qte_restante=100)
        stock = make_stock("COMP002", physique=200, alloue=0)  # dispo=200, besoin=300
        loader = make_loader(
            ofs=[of],
            nomenclatures={"ART_A": nomenclature},
            stocks={"COMP002": stock},
        )

        result = get_competing_ofs_for_component(loader, "COMP002")

        assert result.stock_disponible == 200
        assert result.besoin_total == pytest.approx(300.0)
        assert result.deficit == pytest.approx(100.0)

    def test_pas_de_deficit_si_stock_suffisant(self):
        """Pas de déficit si le stock couvre tous les besoins."""
        nomenclature = make_nomenclature("ART_B", [("COMP003", 1.0, "Acheté")])
        of = make_of("OF003", "ART_B", 1, TODAY + timedelta(days=5), qte_restante=50)
        stock = make_stock("COMP003", physique=500, alloue=0)
        loader = make_loader(
            ofs=[of],
            nomenclatures={"ART_B": nomenclature},
            stocks={"COMP003": stock},
        )

        result = get_competing_ofs_for_component(loader, "COMP003")

        assert result.deficit == 0.0

    def test_priorite_ferme_avant_suggere(self):
        """Les OFs fermes (statut=1) ont une priorité supérieure aux suggérés (statut=3)."""
        nomenclature_f = make_nomenclature("ART_F", [("COMP004", 1.0, "Acheté")])
        nomenclature_s = make_nomenclature("ART_S", [("COMP004", 1.0, "Acheté")])
        of_suggere = make_of("OF_S", "ART_S", 3, TODAY + timedelta(days=3), qte_restante=10)
        of_ferme = make_of("OF_F", "ART_F", 1, TODAY + timedelta(days=5), qte_restante=10)
        stock = make_stock("COMP004", physique=5)
        loader = make_loader(
            ofs=[of_suggere, of_ferme],
            nomenclatures={"ART_F": nomenclature_f, "ART_S": nomenclature_s},
            stocks={"COMP004": stock},
        )

        result = get_competing_ofs_for_component(loader, "COMP004")

        assert result.of_prioritaire == "OF_F"
        assert result.ofs_concurrents[0].num_of == "OF_F"
        assert result.ofs_concurrents[0].priorite_relative == 1

    def test_aucun_of_concurrent(self):
        """Si aucun OF n'utilise le composant, la liste est vide."""
        stock = make_stock("COMP_SEUL", physique=100)
        loader = make_loader(stocks={"COMP_SEUL": stock})

        result = get_competing_ofs_for_component(loader, "COMP_SEUL")

        assert len(result.ofs_concurrents) == 0
        assert result.of_prioritaire is None
        assert result.deficit == 0.0

    def test_reception_prevue_detectee(self):
        """Les réceptions prévues sont remontées dans le résultat."""
        stock = make_stock("COMP005", physique=0)
        reception = make_reception("COMP005", TODAY + timedelta(days=5), qte=200)
        loader = make_loader(
            receptions=[reception],
            stocks={"COMP005": stock},
        )

        result = get_competing_ofs_for_component(loader, "COMP005")

        assert result.reception_prevue == 200
        assert result.date_premiere_reception == TODAY + timedelta(days=5)

    def test_of_complete_exclu(self):
        """Un OF avec qte_restante=0 n'est pas inclus."""
        nomenclature = make_nomenclature("ART_Z", [("COMP006", 1.0, "Acheté")])
        of = make_of("OF_DONE", "ART_Z", 1, TODAY + timedelta(days=5), qte_restante=0)
        stock = make_stock("COMP006", physique=100)
        loader = make_loader(
            ofs=[of],
            nomenclatures={"ART_Z": nomenclature},
            stocks={"COMP006": stock},
        )

        result = get_competing_ofs_for_component(loader, "COMP006")

        assert len(result.ofs_concurrents) == 0
