"""Tests unitaires pour la consommation des prévisions."""

import pytest
from datetime import date

from src.orders.forecast_consumption import consume_forecasts_by_article
from src.models.besoin_client import BesoinClient, NatureBesoin, TypeCommande


class TestConsumeForecastsByArticle:
    """Tests pour la fonction consume_forecasts_by_article."""

    def test_consume_total(self):
        """Test: Prévisions entièrement consommées par les commandes."""
        besoins = [
            BesoinClient(
                nom_client="Client A",
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
                qte_commandee=1200,
                qte_allouee=0,
                qte_restante=1200,
            ),
            BesoinClient(
                nom_client="Client A",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="PREV001",
                nature_besoin=NatureBesoin.PREVISION,
                article="ART001",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 4, 1),
                qte_commandee=720,
                qte_allouee=0,
                qte_restante=720,
            ),
        ]

        besoins_ajustes, stats = consume_forecasts_by_article(besoins, "S+2")

        # Vérifier les stats
        assert "ART001" in stats
        assert stats["ART001"]["prev_brut"] == 720
        assert stats["ART001"]["cmd"] == 1200
        assert stats["ART001"]["prev_net"] == 0  # Entièrement consommée

        # Vérifier les besoins ajustés
        assert len(besoins_ajustes) == 1  # Plus que la commande
        assert besoins_ajustes[0].nature_besoin == NatureBesoin.COMMANDE
        assert besoins_ajustes[0].qte_restante == 1200

    def test_consume_partial(self):
        """Test: Prévisions partiellement consommées."""
        besoins = [
            BesoinClient(
                nom_client="Client A",
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
                qte_commandee=500,
                qte_allouee=0,
                qte_restante=500,
            ),
            BesoinClient(
                nom_client="Client B",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="PREV001",
                nature_besoin=NatureBesoin.PREVISION,
                article="ART001",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 4, 1),
                qte_commandee=1000,
                qte_allouee=0,
                qte_restante=1000,
            ),
        ]

        besoins_ajustes, stats = consume_forecasts_by_article(besoins, "S+2")

        # Vérifier les stats
        assert stats["ART001"]["prev_net"] == 500  # 1000 - 500

        # Vérifier qu'il reste une prévision
        previsions = [b for b in besoins_ajustes if b.est_prevision()]
        assert len(previsions) == 1
        assert previsions[0].qte_restante == 500

    def test_no_consumption(self):
        """Test: Pas de consommation (pas de commandes)."""
        besoins = [
            BesoinClient(
                nom_client="Client A",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="PREV001",
                nature_besoin=NatureBesoin.PREVISION,
                article="ART001",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 4, 1),
                qte_commandee=500,
                qte_allouee=0,
                qte_restante=500,
            ),
        ]

        besoins_ajustes, stats = consume_forecasts_by_article(besoins, "S+2")

        # Vérifier que la prévision reste inchangée
        assert len(besoins_ajustes) == 1
        assert stats["ART001"]["prev_net"] == 500
        assert besoins_ajustes[0].qte_restante == 500

    def test_multiple_articles(self):
        """Test: Consommation sur plusieurs articles."""
        besoins = [
            # Article 1: Commande > Prévision
            BesoinClient(
                nom_client="Client A",
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
                qte_commandee=1000,
                qte_allouee=0,
                qte_restante=1000,
            ),
            BesoinClient(
                nom_client="Client A",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="PREV001",
                nature_besoin=NatureBesoin.PREVISION,
                article="ART001",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 4, 1),
                qte_commandee=500,
                qte_allouee=0,
                qte_restante=500,
            ),
            # Article 2: Prévision > Commande
            BesoinClient(
                nom_client="Client B",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="CMD002",
                nature_besoin=NatureBesoin.COMMANDE,
                article="ART002",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 4, 1),
                qte_commandee=200,
                qte_allouee=0,
                qte_restante=200,
            ),
            BesoinClient(
                nom_client="Client B",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="PREV002",
                nature_besoin=NatureBesoin.PREVISION,
                article="ART002",
                description="Test",
                categorie="PF3",
                source_origine_besoin="Ventes",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 4, 1),
                qte_commandee=800,
                qte_allouee=0,
                qte_restante=800,
            ),
        ]

        besoins_ajustes, stats = consume_forecasts_by_article(besoins, "S+2")

        # Vérifier ART001
        assert stats["ART001"]["prev_net"] == 0  # 500 - 1000 = 0

        # Vérifier ART002
        assert stats["ART002"]["prev_net"] == 600  # 800 - 200 = 600

        # Vérifier le nombre de besoins ajustés
        # CMD001 + CMD002 + PREV002 (ART002 restante) = 3
        assert len(besoins_ajustes) == 3

    def test_empty_list(self):
        """Test: Liste vide de besoins."""
        besoins = []
        besoins_ajustes, stats = consume_forecasts_by_article(besoins, "S+2")

        assert len(besoins_ajustes) == 0
        assert len(stats) == 0

    def test_only_commands(self):
        """Test: Uniquement des commandes, pas de prévisions."""
        besoins = [
            BesoinClient(
                nom_client="Client A",
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
                qte_commandee=500,
                qte_allouee=0,
                qte_restante=500,
            ),
        ]

        besoins_ajustes, stats = consume_forecasts_by_article(besoins, "S+2")

        # Les commandes doivent être conservées
        assert len(besoins_ajustes) == 1
        assert besoins_ajustes[0].qte_restante == 500
        # Pas de stats car pas de prévisions
        assert len(stats) == 0
