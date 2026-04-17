"""Tests pour le modèle BesoinClient."""

import pytest
from datetime import date

from src.models.besoin_client import BesoinClient, TypeCommande, NatureBesoin


class TestBesoinClient:
    """Tests pour la classe BesoinClient."""

    def test_besoin_client_mts(self):
        """Test la création d'un BesoinClient MTS."""
        besoin = BesoinClient(
            code_pays="FR",
            nom_client="ALDES",
            type_commande=TypeCommande.MTS,
            num_commande="AR2600799",
            nature_besoin=NatureBesoin.COMMANDE,
            article="EFL1345AL",
            description="Test",
            categorie="PF3",
            source_origine_besoin="Ventes",
            of_contremarque="F426-06674",
            date_commande=date(2026, 2, 15),
            date_expedition_demandee=date(2026, 3, 4),
            qte_commandee=720,
            qte_allouee=0,
            qte_restante=720,
        )

        assert besoin.is_mts()
        assert not besoin.is_nor_mto()
        assert besoin.est_commande()
        assert not besoin.est_prevision()
        assert besoin.qte_restante == 720
        assert besoin.of_contremarque == "F426-06674"

    def test_besoin_client_nor(self):
        """Test la création d'un BesoinClient NOR."""
        besoin = BesoinClient(
            nom_client="AERECO",
            code_pays="DE",
            type_commande=TypeCommande.NOR,
            num_commande="AR2601108",
            nature_besoin=NatureBesoin.COMMANDE,
            article="B6794",
            description="Test",
            categorie="PF3",
            source_origine_besoin="Ventes",
            of_contremarque="",
            date_commande=None,
            date_expedition_demandee=date(2026, 3, 18),
            qte_commandee=36,
            qte_allouee=0,
            qte_restante=36,
        )

        assert not besoin.is_mts()
        assert besoin.is_nor_mto()
        assert besoin.est_commande()
        assert not besoin.est_prevision()
        assert besoin.of_contremarque == ""

    def test_besoin_client_mto(self):
        """Test la création d'un BesoinClient MTO."""
        besoin = BesoinClient(
            nom_client="ALDES",
            code_pays="FR",
            type_commande=TypeCommande.MTO,
            num_commande="AR2601234",
            nature_besoin=NatureBesoin.COMMANDE,
            article="TEST123",
            description="Test",
            categorie="PF3",
            source_origine_besoin="Ventes",
            of_contremarque="",
            date_commande=date(2026, 2, 20),
            date_expedition_demandee=date(2026, 3, 20),
            qte_commandee=100,
            qte_allouee=50,
            qte_restante=50,
        )

        assert not besoin.is_mts()
        assert besoin.is_nor_mto()  # MTO is also NOR/MTO
        assert besoin.est_commande()

    def test_besoin_client_prevision(self):
        """Test la création d'un BesoinClient de type prévision."""
        besoin = BesoinClient(
            nom_client="EXPORT CLIENT",
            code_pays="DE",
            type_commande=TypeCommande.NOR,
            num_commande="PREV-2026-03",
            nature_besoin=NatureBesoin.PREVISION,
            article="TEST123",
            description="Test",
            categorie="PF3",
            source_origine_besoin="Ventes",
            of_contremarque="",
            date_commande=None,
            date_expedition_demandee=date(2026, 3, 31),
            qte_commandee=500,
            qte_allouee=0,
            qte_restante=500,
        )

        assert not besoin.is_mts()
        assert besoin.is_nor_mto()
        assert not besoin.est_commande()
        assert besoin.est_prevision()

    def test_parsing_csv_row_mts(self):
        """Test le parsing d'une commande MTS depuis une ligne CSV."""
        row = {
            "NOM_FOURNISSEUR_OU_CLIENT": "ALDES",
            "PAYS": "FR",
            "TYPE_COMMANDE": "MTS",
            "NUM_ORDRE": "AR2600799",
            "SOURCE_ORIGINE_BESOIN": "Ventes",
            "ARTICLE": "EFL1345AL",
            "DESIGNATION": "EFL1345AL desc",
            "CATEGORIE": "PF3",
            "OF_CONTREMARQUE": "F426-06674",
            "DATE_DEBUT": "02/15/2026 00:00:00",
            "DATE_FIN": "03/04/2026 00:00:00",
            "QTE_COMMANDEE": "720",
            "QTE_ALLOUEE": "0",
            "QTE_RESTANTE_FABRICATION": "720",
        }

        besoin = BesoinClient.from_csv_row(row)

        assert besoin.is_mts()
        assert besoin.num_commande == "AR2600799"
        assert besoin.article == "EFL1345AL"
        assert isinstance(besoin.date_commande, date)
        assert besoin.date_commande.day == 15
        assert besoin.date_commande.month == 2
        assert besoin.date_commande.year == 2026
        assert isinstance(besoin.date_expedition_demandee, date)
        assert besoin.qte_restante == 720

    def test_parsing_csv_row_nor(self):
        """Test le parsing d'une commande NOR depuis une ligne CSV."""
        row = {
            "NOM_FOURNISSEUR_OU_CLIENT": "AERECO LEGTECHNIKA Kft",
            "PAYS": "HU",
            "TYPE_COMMANDE": "NOR",
            "NUM_ORDRE": "AR2601108",
            "SOURCE_ORIGINE_BESOIN": "Ventes",
            "ARTICLE": "B6794",
            "DESIGNATION": "B6794 desc",
            "CATEGORIE": "PF3",
            "OF_CONTREMARQUE": "",
            "DATE_DEBUT": "",
            "DATE_FIN": "03/18/2026 00:00:00",
            "QTE_COMMANDEE": "36",
            "QTE_ALLOUEE": "0",
            "QTE_RESTANTE_FABRICATION": "36",
        }

        besoin = BesoinClient.from_csv_row(row)

        assert besoin.is_nor_mto()
        assert not besoin.is_mts()
        assert besoin.num_commande == "AR2601108"
        assert besoin.article == "B6794"
        assert besoin.date_commande is None  # Empty string
        assert isinstance(besoin.date_expedition_demandee, date)

    def test_parsing_csv_row_empty_type_commande(self):
        """Test le parsing avec TYPE_COMMANDE vide (doit défaut à NOR)."""
        row = {
            "NOM_FOURNISSEUR_OU_CLIENT": "TEST CLIENT",
            "PAYS": "",
            "TYPE_COMMANDE": "",
            "NUM_ORDRE": "TEST001",
            "SOURCE_ORIGINE_BESOIN": "Ventes",
            "ARTICLE": "TEST123",
            "DESIGNATION": "",
            "CATEGORIE": "",
            "OF_CONTREMARQUE": "",
            "DATE_DEBUT": "",
            "DATE_FIN": "03/01/2026 00:00:00",
            "QTE_COMMANDEE": "100",
            "QTE_ALLOUEE": "0",
            "QTE_RESTANTE_FABRICATION": "100",
        }

        besoin = BesoinClient.from_csv_row(row)

        # Doit défaut à NOR
        assert besoin.is_nor_mto()
        assert besoin.type_commande == TypeCommande.NOR

    def test_parsing_csv_row_invalid_type_commande(self):
        """Test le parsing avec TYPE_COMMANDE invalide (doit défaut à NOR)."""
        row = {
            "NOM_FOURNISSEUR_OU_CLIENT": "TEST CLIENT",
            "PAYS": "",
            "TYPE_COMMANDE": "INVALID",
            "NUM_ORDRE": "TEST001",
            "SOURCE_ORIGINE_BESOIN": "Ventes",
            "ARTICLE": "TEST123",
            "DESIGNATION": "",
            "CATEGORIE": "",
            "OF_CONTREMARQUE": "",
            "DATE_DEBUT": "",
            "DATE_FIN": "03/01/2026 00:00:00",
            "QTE_COMMANDEE": "100",
            "QTE_ALLOUEE": "0",
            "QTE_RESTANTE_FABRICATION": "100",
        }

        besoin = BesoinClient.from_csv_row(row)

        # Doit défaut à NOR
        assert besoin.is_nor_mto()
        assert besoin.type_commande == TypeCommande.NOR

    def test_parsing_csv_row_with_thousands_separator(self):
        """Test le parsing avec séparateur de milliers."""
        row = {
            "NOM_FOURNISSEUR_OU_CLIENT": "TEST CLIENT",
            "PAYS": "",
            "TYPE_COMMANDE": "NOR",
            "NUM_ORDRE": "TEST001",
            "SOURCE_ORIGINE_BESOIN": "Ventes",
            "ARTICLE": "TEST123",
            "DESIGNATION": "",
            "CATEGORIE": "",
            "OF_CONTREMARQUE": "",
            "DATE_DEBUT": "",
            "DATE_FIN": "03/01/2026 00:00:00",
            "QTE_COMMANDEE": "1,500",
            "QTE_ALLOUEE": "500",
            "QTE_RESTANTE_FABRICATION": "1,000",
        }

        besoin = BesoinClient.from_csv_row(row)

        assert besoin.qte_commandee == 1500
        assert besoin.qte_allouee == 500
        assert besoin.qte_restante == 1000

    def test_repr(self):
        """Test la représentation textuelle."""
        besoin = BesoinClient(
            nom_client="ALDES",
            code_pays="FR",
            type_commande=TypeCommande.MTS,
            num_commande="AR2600799",
            nature_besoin=NatureBesoin.COMMANDE,
            article="EFL1345AL",
            description="Test",
            categorie="PF3",
            source_origine_besoin="Ventes",
            of_contremarque="F426-06674",
            date_commande=None,
            date_expedition_demandee=date(2026, 3, 4),
            qte_commandee=720,
            qte_allouee=0,
            qte_restante=720,
        )

        repr_str = repr(besoin)

        assert "AR2600799" in repr_str
        assert "EFL1345AL" in repr_str
        assert "720" in repr_str
        assert "COMMANDE" in repr_str

    def test_repr_without_of_link(self):
        """Test la représentation sans OF lié."""
        besoin = BesoinClient(
            nom_client="AERECO",
            code_pays="DE",
            type_commande=TypeCommande.NOR,
            num_commande="AR2601108",
            nature_besoin=NatureBesoin.COMMANDE,
            article="B6794",
            description="Test",
            categorie="PF3",
            source_origine_besoin="Ventes",
            of_contremarque="",
            date_commande=None,
            date_expedition_demandee=date(2026, 3, 18),
            qte_commandee=36,
            qte_allouee=0,
            qte_restante=36,
        )

        repr_str = repr(besoin)

        assert "AR2601108" in repr_str
        assert "B6794" in repr_str
        assert "36" in repr_str
        assert "COMMANDE" in repr_str
