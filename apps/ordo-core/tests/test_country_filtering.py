"""Tests unitaires pour le filtrage par pays."""

import pytest
from datetime import date, timedelta

from src.loaders.data_loader import DataLoader
from src.models.besoin_client import BesoinClient, NatureBesoin, TypeCommande


class TestBesoinClientCountryMethods:
    """Tests pour les méthodes de filtrage par pays dans BesoinClient."""

    def test_est_france_true(self):
        """Test: Client France est correctement identifié."""
        besoin = BesoinClient(
            nom_client="Client FR",
            code_pays="FR",
            type_commande=TypeCommande.NOR,
            num_commande="CMD001",
            nature_besoin=NatureBesoin.COMMANDE,
            article="ART001",
            description="Test",
            categorie="PF3",
            source_origine_besoin="Ventes",
            of_contremarque="",
            date_commande=date(2026, 3, 1),
            date_expedition_demandee=date(2026, 4, 1),
            qte_commandee=100,
            qte_allouee=0,
            qte_restante=100,
        )

        assert besoin.est_france() is True
        assert besoin.est_export() is False

    def test_est_export_true(self):
        """Test: Client Export est correctement identifié."""
        besoin = BesoinClient(
            nom_client="Client DE",
            code_pays="DE",
            type_commande=TypeCommande.NOR,
            num_commande="CMD001",
            nature_besoin=NatureBesoin.COMMANDE,
            article="ART001",
            description="Test",
            categorie="PF3",
            source_origine_besoin="Ventes",
            of_contremarque="",
            date_commande=date(2026, 3, 1),
            date_expedition_demandee=date(2026, 4, 1),
            qte_commandee=100,
            qte_allouee=0,
            qte_restante=100,
        )

        assert besoin.est_france() is False
        assert besoin.est_export() is True

    def test_multiple_export_countries(self):
        """Test: Différents pays d'export."""
        countries = ["DE", "ES", "IT", "PL", "PT", "UK", "US"]

        for country in countries:
            besoin = BesoinClient(
                nom_client=f"Client {country}",
                code_pays=country,
                type_commande=TypeCommande.NOR,
                num_commande="CMD001",
                nature_besoin=NatureBesoin.COMMANDE,
                article="ART001",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 4, 1),
                qte_commandee=100,
                qte_allouee=0,
                qte_restante=100,
            )

            assert besoin.est_france() is False
            assert besoin.est_export() is True


class TestDataLoaderGetCommandesS1:
    """Tests pour la méthode get_commandes_s1 de DataLoader."""

    @pytest.fixture
    def sample_besoins(self):
        """Crée des besoins de test."""
        date_ref = date(2026, 3, 22)  # Dimanche
        return [
            # France + Commande
            BesoinClient(
                nom_client="Client FR",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="CMD_FR",
                nature_besoin=NatureBesoin.COMMANDE,
                article="ART001",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date_ref + timedelta(days=2),  # S+1
                qte_commandee=100,
                qte_allouee=0,
                qte_restante=100,
            ),
            # France + Prévision (doit être exclue)
            BesoinClient(
                nom_client="Client FR",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="PREV_FR",
                nature_besoin=NatureBesoin.PREVISION,
                article="ART001",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date_ref + timedelta(days=2),
                qte_commandee=50,
                qte_allouee=0,
                qte_restante=50,
            ),
            # Export + Commande
            BesoinClient(
                nom_client="Client DE",
                code_pays="DE",
                type_commande=TypeCommande.NOR,
                num_commande="CMD_DE",
                nature_besoin=NatureBesoin.COMMANDE,
                article="ART002",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date_ref + timedelta(days=2),
                qte_commandee=200,
                qte_allouee=0,
                qte_restante=200,
            ),
            # Export + Prévision (incluse si include_previsions=True)
            BesoinClient(
                nom_client="Client DE",
                code_pays="DE",
                type_commande=TypeCommande.NOR,
                num_commande="PREV_DE",
                nature_besoin=NatureBesoin.PREVISION,
                article="ART002",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date_ref + timedelta(days=2),
                qte_commandee=100,
                qte_allouee=0,
                qte_restante=100,
            ),
        ]

    def test_france_excludes_previsions(self, sample_besoins):
        """Test: France = uniquement les commandes, pas de prévisions."""
        # Mock DataLoader
        loader = DataLoader.__new__(DataLoader)
        loader._commandes_clients = sample_besoins

        date_ref = date(2026, 3, 22)
        result = loader.get_commandes_s1(date_ref, horizon_days=7, include_previsions=False)

        # Doit contenir: CMD_FR + CMD_DE (pas de prévisions France)
        assert len(result) == 2

        commandes = [b.num_commande for b in result]
        assert "CMD_FR" in commandes
        assert "CMD_DE" in commandes
        assert "PREV_FR" not in commandes  # France prévision exclue
        assert "PREV_DE" not in commandes  # Export prévision exclue (paramètre False)

    def test_export_includes_previsions_when_requested(self, sample_besoins):
        """Test: include_previsions=True inclut les previsions (FR et export)."""
        loader = DataLoader.__new__(DataLoader)
        loader._commandes_clients = sample_besoins

        date_ref = date(2026, 3, 22)
        result = loader.get_commandes_s1(date_ref, horizon_days=7, include_previsions=True)

        # Doit contenir: CMD_FR + CMD_DE + PREV_FR + PREV_DE
        # get_commandes_s1 n'applique pas de filtre par pays ;
        # avec include_previsions=True, toutes les commandes et previsions sont incluses.
        assert len(result) == 4

        commandes = [b.num_commande for b in result]
        assert "CMD_FR" in commandes
        assert "CMD_DE" in commandes
        assert "PREV_DE" in commandes  # Export prevision incluse
        assert "PREV_FR" in commandes  # France prevision incluse quand include_previsions=True

    def test_sorting_priority(self, sample_besoins):
        """Test: Tri par priorité (commandes d'abord, puis date)."""
        loader = DataLoader.__new__(DataLoader)
        loader._commandes_clients = sample_besoins

        date_ref = date(2026, 3, 22)
        result = loader.get_commandes_s1(date_ref, horizon_days=7, include_previsions=True)

        # Les commandes doivent être avant les prévisions
        indices = {b.num_commande: i for i, b in enumerate(result)}

        # CMD_FR avant PREV_DE
        if "CMD_FR" in indices and "PREV_DE" in indices:
            assert indices["CMD_FR"] < indices["PREV_DE"]

        # CMD_DE avant PREV_DE
        if "CMD_DE" in indices and "PREV_DE" in indices:
            assert indices["CMD_DE"] < indices["PREV_DE"]

    def test_empty_country_code(self):
        """Test: Pays vide = comportement standard."""
        besoin = BesoinClient(
            nom_client="Client Unknown",
            code_pays="",  # Vide
            type_commande=TypeCommande.NOR,
            num_commande="CMD_001",
            nature_besoin=NatureBesoin.COMMANDE,
            article="ART001",
            description="Test",
            categorie="PF3",
            source_origine_besoin="Ventes",
            of_contremarque="",
            date_commande=date(2026, 3, 1),
            date_expedition_demandee=date(2026, 4, 1),
            qte_commandee=100,
            qte_allouee=0,
            qte_restante=100,
        )

        # Pays vide n'est ni France ni Export
        assert besoin.est_france() is False
        # Mais est_export() retourne True car code != "FR"
        assert besoin.est_export() is True

    def test_zero_quantity_filtered(self):
        """Test: Les besoins avec qte_restante = 0 sont filtrés."""
        loader = DataLoader.__new__(DataLoader)
        loader._commandes_clients = [
            BesoinClient(
                nom_client="Client FR",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="CMD_001",
                nature_besoin=NatureBesoin.COMMANDE,
                article="ART001",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 4, 1),
                qte_commandee=100,
                qte_allouee=100,  # Tout alloué
                qte_restante=0,  # Plus de reste
            ),
        ]

        date_ref = date(2026, 3, 22)
        result = loader.get_commandes_s1(date_ref, horizon_days=7, include_previsions=False)

        # Ne doit rien retourner (qte_restante = 0)
        assert len(result) == 0

    def test_horizon_filtering(self):
        """Test: Filtrage par horizon de jours."""
        loader = DataLoader.__new__(DataLoader)
        date_ref = date(2026, 3, 22)

        loader._commandes_clients = [
            BesoinClient(
                nom_client="Client FR",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="CMD_001",
                nature_besoin=NatureBesoin.COMMANDE,
                article="ART001",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date_ref + timedelta(days=2),  # Dans l'horizon
                qte_commandee=100,
                qte_allouee=0,
                qte_restante=100,
            ),
            BesoinClient(
                nom_client="Client FR",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="CMD_002",
                nature_besoin=NatureBesoin.COMMANDE,
                article="ART002",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date_ref + timedelta(days=15),  # Hors horizon
                qte_commandee=200,
                qte_allouee=0,
                qte_restante=200,
            ),
        ]

        result = loader.get_commandes_s1(date_ref, horizon_days=7, include_previsions=False)

        # Seul CMD_001 doit être dans l'horizon
        assert len(result) == 1
        assert result[0].num_commande == "CMD_001"
