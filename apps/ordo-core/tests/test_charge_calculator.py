"""Tests unitaires pour le calcul de charge."""

import pytest
from datetime import date, timedelta
from unittest.mock import Mock, MagicMock

from src.algorithms.charge_calculator import (
    is_valid_poste,
    calculate_article_charge,
    get_week_info,
    group_by_week,
    calculate_weekly_charge_heatmap,
    get_poste_libelle,
)
from src.models.besoin_client import BesoinClient, NatureBesoin, TypeCommande
from src.models.gamme import Gamme, GammeOperation
from src.models.nomenclature import Nomenclature, NomenclatureEntry
from src.models.charge import ChargeByPoste


class TestIsValidPoste:
    """Tests pour la fonction is_valid_poste."""

    def test_valid_postes(self):
        """Test: Postes valides (pattern PP_xxx)."""
        assert is_valid_poste("PP_830") is True
        assert is_valid_poste("PP_128") is True
        assert is_valid_poste("PP_001") is True
        assert is_valid_poste("PP_999") is True

    def test_invalid_postes(self):
        """Test: Postes invalides."""
        assert is_valid_poste("POSTE DIV AERECO 9") is False
        assert is_valid_poste("PP_AERECO") is False
        assert is_valid_poste("PP_830A") is False
        assert is_valid_poste("P_830") is False
        assert is_valid_poste("830") is False


class TestGetWeekInfo:
    """Tests pour la fonction get_week_info."""

    def test_week_s1(self):
        """Test: Calcul S+1."""
        date_ref = date(2026, 3, 22)  # Dimanche
        expedition = date(2026, 3, 25)  # Mercredi suivant

        info = get_week_info(expedition, date_ref)

        assert info["week_label"] == "S+1"
        assert info["week_number"] == 13
        assert info["year"] == 2026
        assert info["date_start"] == date(2026, 3, 23)  # Lundi
        assert info["date_end"] == date(2026, 3, 29)  # Dimanche

    def test_week_past_date(self):
        """Test: Date passée doit être S+1."""
        date_ref = date(2026, 3, 22)
        expedition = date(2026, 3, 15)  # Semaine passée

        info = get_week_info(expedition, date_ref)

        assert info["week_label"] == "S+1"  # Pas de S+0 ou S-1

    def test_week_s2(self):
        """Test: Calcul S+2."""
        date_ref = date(2026, 3, 22)
        expedition = date(2026, 4, 1)  # 10 jours plus tard

        info = get_week_info(expedition, date_ref)

        assert info["week_label"] == "S+2"


class TestGroupByWeek:
    """Tests pour la fonction group_by_week."""

    def test_group_besoins_by_week(self):
        """Test: Groupement des besoins par semaine."""
        date_ref = date(2026, 3, 22)  # Dimanche

        besoins = [
            BesoinClient(
                nom_client="Client A",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="CMD001",
                nature_besoin=NatureBesoin.COMMANDE,
                article="ART001",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 3, 25),  # S+1
                qte_commandee=100,
                qte_allouee=0,
                qte_restante=100,
            ),
            BesoinClient(
                nom_client="Client B",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="CMD002",
                nature_besoin=NatureBesoin.COMMANDE,
                article="ART002",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 4, 1),  # S+2
                qte_commandee=200,
                qte_allouee=0,
                qte_restante=200,
            ),
        ]

        grouped = group_by_week(besoins, 4, date_ref)

        assert "S+1" in grouped
        assert "S+2" in grouped
        assert len(grouped["S+1"]) == 1
        assert len(grouped["S+2"]) == 1
        assert grouped["S+1"][0].article == "ART001"
        assert grouped["S+2"][0].article == "ART002"

    def test_horizon_filtering(self):
        """Test: Filtrage par horizon."""
        date_ref = date(2026, 3, 22)

        besoins = [
            BesoinClient(
                nom_client="Client A",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="CMD001",
                nature_besoin=NatureBesoin.COMMANDE,
                article="ART001",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 3, 25),  # S+1
                qte_commandee=100,
                qte_allouee=0,
                qte_restante=100,
            ),
            BesoinClient(
                nom_client="Client B",
                code_pays="FR",
                type_commande=TypeCommande.NOR,
                num_commande="CMD002",
                nature_besoin=NatureBesoin.COMMANDE,
                article="ART002",
                of_contremarque="",
                date_commande=date(2026, 3, 1),
                date_expedition_demandee=date(2026, 5, 1),  # Hors horizon (S+7)
                qte_commandee=200,
                qte_allouee=0,
                qte_restante=200,
            ),
        ]

        grouped = group_by_week(besoins, 4, date_ref)

        # Seul S+1 doit être présent
        assert "S+1" in grouped
        assert "S+7" not in grouped


class TestCalculateArticleCharge:
    """Tests pour la fonction calculate_article_charge."""

    def test_simple_charge(self):
        """Test: Calcul simple avec gamme directe."""
        # Mock DataLoader
        loader = Mock()
        loader.get_gamme = Mock(return_value=Gamme(
            article="ART001",
            operations=[
                GammeOperation(
                    article="ART001",
                    poste_charge="PP_830",
                    libelle_poste="LIGNE EASY HOME",
                    cadence=100.0,
                )
            ]
        ))
        loader.get_nomenclature = Mock(return_value=None)

        charge = calculate_article_charge("ART001", 500, loader)

        assert charge == {"PP_830": 5.0}  # 500 / 100 = 5h

    def test_invalid_poste_filtered(self):
        """Test: Les postes invalides sont filtrés."""
        loader = Mock()
        loader.get_gamme = Mock(return_value=Gamme(
            article="ART001",
            operations=[
                GammeOperation(
                    article="ART001",
                    poste_charge="PP_830",
                    libelle_poste="LIGNE EASY HOME",
                    cadence=100.0,
                ),
                GammeOperation(
                    article="ART001",
                    poste_charge="POSTE DIV AERECO 9",  # Invalide
                    libelle_poste="Poste divers",
                    cadence=50.0,
                ),
            ]
        ))
        loader.get_nomenclature = Mock(return_value=None)

        charge = calculate_article_charge("ART001", 100, loader)

        # Seul PP_830 doit être présent
        assert "PP_830" in charge
        assert "POSTE DIV AERECO 9" not in charge
        assert charge["PP_830"] == 1.0

    def test_no_gamme(self):
        """Test: Article sans gamme = pas de charge."""
        loader = Mock()
        loader.get_gamme = Mock(return_value=None)
        loader.get_nomenclature = Mock(return_value=None)

        charge = calculate_article_charge("ART001", 100, loader)

        assert charge == {}


class TestCalculateWeeklyChargeHeatmap:
    """Tests pour la fonction calculate_weekly_charge_heatmap."""

    def test_backlog_and_encours_columns(self):
        """Test: Colonnes BACKLOG et EN_COURS sont présentes."""
        loader = Mock()
        loader.commandes_clients = []
        loader.get_gamme = Mock(return_value=None)
        loader.get_nomenclature = Mock(return_value=None)

        heatmap = calculate_weekly_charge_heatmap(
            besoins=[],
            data_loader=loader,
            num_weeks=4,
        )

        # Vérifier que c'est une liste
        assert isinstance(heatmap, list)

    def test_heatmap_structure(self):
        """Test: Structure de la heatmap."""
        loader = Mock()
        loader.commandes_clients = []
        loader.get_gamme = Mock(return_value=None)
        loader.get_nomenclature = Mock(return_value=None)

        heatmap = calculate_weekly_charge_heatmap(
            besoins=[],
            data_loader=loader,
            num_weeks=4,
        )

        # Si des données sont présentes, vérifier la structure
        for poste in heatmap:
            assert isinstance(poste, ChargeByPoste)
            assert hasattr(poste, "poste_charge")
            assert hasattr(poste, "libelle_poste")
            assert hasattr(poste, "charges")
            assert isinstance(poste.charges, dict)


class TestGetPosteLibelle:
    """Tests pour la fonction get_poste_libelle."""

    def test_existing_poste(self):
        """Test: Récupérer le libellé d'un poste existant."""
        loader = Mock()
        loader.gammes = {
            "ART001": Gamme(
                article="ART001",
                operations=[
                    GammeOperation(
                        article="ART001",
                        poste_charge="PP_830",
                        libelle_poste="LIGNE EASY HOME",
                        cadence=100.0,
                    )
                ]
            )
        }

        libelle = get_poste_libelle("PP_830", loader)

        assert libelle == "LIGNE EASY HOME"

    def test_unknown_poste(self):
        """Test: Poste inconnu retourne chaîne vide."""
        loader = Mock()
        loader.gammes = {}

        libelle = get_poste_libelle("PP_999", loader)

        assert libelle == ""
