"""Tests unitaires pour le filtrage par pays."""

import pytest
from datetime import date

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
