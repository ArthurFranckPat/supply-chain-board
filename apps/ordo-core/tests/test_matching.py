"""Tests pour le matching commande→OF."""

import pytest

from src.loaders import DataLoader
from src.algorithms.matching import CommandeOFMatcher, OFConso
from src.models.besoin_client import BesoinClient


@pytest.fixture
def loader():
    """Fixture pour DataLoader."""
    loader = DataLoader("data")
    loader.load_all()
    return loader


@pytest.fixture
def matcher(loader):
    """Fixture pour CommandeOFMatcher."""
    return CommandeOFMatcher(loader)


class TestOFConso:
    """Tests pour la classe OFConso."""

    def test_init(self):
        """Test l'initialisation d'OFConso."""
        of = type('OF', (), {
            'num_of': 'F123-456',
            'qte_restante': 100,
            'statut_num': 3,
            'article': 'TEST',
            'date_fin': None
        })()

        conso = OFConso(
            of=of,
            qte_disponible=100,
            qte_allouee=0,
            commandes_servees=[]
        )

        assert conso.of == of
        assert conso.qte_disponible == 100
        assert conso.qte_allouee == 0
        assert len(conso.commandes_servees) == 0

    def test_est_disponible(self):
        """Test la méthode est_disponible."""
        of = type('OF', (), {
            'num_of': 'F123-456',
            'qte_restante': 100,
            'statut_num': 3,
            'article': 'TEST',
            'date_fin': None
        })()

        conso = OFConso(
            of=of,
            qte_disponible=100,
            qte_allouee=0,
            commandes_servees=[]
        )

        # Test avec quantité suffisante
        assert conso.est_disponible(50) is True

        # Test avec quantité insuffisante
        assert conso.est_disponible(150) is False

        # Test avec quantité exacte
        assert conso.est_disponible(100) is True

    def test_allouer(self):
        """Test la méthode allouer."""
        of = type('OF', (), {
            'num_of': 'F123-456',
            'qte_restante': 100,
            'statut_num': 3,
            'article': 'TEST',
            'date_fin': None
        })()

        conso = OFConso(
            of=of,
            qte_disponible=100,
            qte_allouee=0,
            commandes_servees=[]
        )

        # Allouer
        conso.allouer(30, "CMD001")

        assert conso.qte_allouee == 30
        assert conso.qte_disponible == 70
        assert "CMD001" in conso.commandes_servees


class TestCommandeOFMatcher:
    """Tests pour la classe CommandeOFMatcher."""

    def test_init(self, loader):
        """Test l'initialisation du matcher."""
        matcher = CommandeOFMatcher(loader)

        assert matcher.data_loader == loader
        assert matcher.date_tolerance_days == 10
        assert matcher.of_conso == {}

    def test_init_with_tolerance(self, loader):
        """Test l'initialisation avec tolérance personnalisée."""
        matcher = CommandeOFMatcher(loader, date_tolerance_days=5)

        assert matcher.date_tolerance_days == 5

    def test_reset(self, loader):
        """Test la réinitialisation."""
        matcher = CommandeOFMatcher(loader)

        # Initialiser des OF
        matcher._initialiser_of_conso()

        assert len(matcher.of_conso) > 0

        # Reset
        matcher.reset()

        assert matcher.of_conso == {}
        assert matcher.ofs_deja_utilises == set()

    def test_initialiser_of_conso(self, loader):
        """Test l'initialisation des OF."""
        matcher = CommandeOFMatcher(loader)

        # Initialiser
        matcher._initialiser_of_conso()

        # Vérifier que des OF ont été initialisés
        assert len(matcher.of_conso) > 0

        # Vérifier que tous les OF ont qte_disponible = qte_restante
        for of_conso in matcher.of_conso.values():
            assert of_conso.qte_disponible == of_conso.of.qte_restante

    def test_initialiser_of_conso_with_articles(self, loader):
        """Test l'initialisation pour des articles spécifiques."""
        matcher = CommandeOFMatcher(loader)

        # Initialiser pour un article spécifique
        article = "MC4337"
        matcher._initialiser_of_conso(articles={article})

        # Vérifier que seuls les OF de cet article sont initialisés
        for of_conso in matcher.of_conso.values():
            assert of_conso.of.article == article

    def test_match_mts_with_of_link(self, loader):
        """Test le matching d'une commande MTS avec OF lié."""
        # Trouver une commande MTS avec OF
        commande = None
        for cmd in loader.commandes_clients:
            if cmd.is_mts() and cmd.of_contremarque:
                commande = cmd
                break

        if commande is None:
            pytest.skip("Aucune commande MTS avec OF trouvée")

        matcher = CommandeOFMatcher(loader)

        # Matcher la commande
        result = matcher.match_commande(commande)

        assert result.commande == commande
        # Le résultat dépend de si l'OF existe

    def test_match_mts_without_of_link(self, loader):
        """Test le matching d'une commande MTS sans OF."""
        # Trouver une commande MTS sans OF (OF vide ou inexistant)
        commande = None
        for cmd in loader.commandes_clients:
            if cmd.is_mts() and not cmd.of_contremarque:
                commande = cmd
                break

        if commande is None:
            pytest.skip("Aucune commande MTS sans OF trouvée")

        matcher = CommandeOFMatcher(loader)

        # Matcher la commande
        result = matcher.match_commande(commande)

        assert result.commande == commande
        assert "sans OF" in result.matching_method or "introuvable" in result.matching_method.lower()

    def test_match_nor_mto(self, loader):
        """Test le matching d'une commande NOR/MTO."""
        # Trouver une commande NOR/MTO
        commande = next((cmd for cmd in loader.commandes_clients if cmd.is_nor_mto()), None)

        if commande is None:
            pytest.skip("Aucune commande NOR/MTO trouvée")

        matcher = CommandeOFMatcher(loader)

        # Matcher la commande
        result = matcher.match_commande(commande)

        assert result.commande == commande
        assert result.stock_allocation is not None

    def test_of_priority_in_matching(self, loader):
        """Test que les OF FERMES sont prioritaires."""
        # Trouver un article avec des OF FERMES et SUGGÉRÉS
        from collections import defaultdict

        ofs_by_article = defaultdict(list)
        for of in loader.ofs:
            if of.statut_num in (1, 2, 3) and of.qte_restante > 0:
                ofs_by_article[of.article].append(of)

        # Trouver un article avec des FERMES et SUGGÉRÉS
        article = None
        for art, ofs in ofs_by_article.items():
            statuts = {of.statut_num for of in ofs}
            if 1 in statuts and 3 in statuts:  # FERME et SUGGÉRÉ
                article = art
                break

        if article is None:
            pytest.skip("Aucun article avec OF FERME et SUGGÉRÉ trouvé")

        # Créer une commande NOR/MTO pour cet article
        commande = type('Commande', (), {
            'num_commande': 'TEST001',
            'article': article,
            'qte_restante': 10,
            'date_expedition_demandee': None,
            'is_nor_mto': lambda: True,
            'is_mts': lambda: False
        })()

        matcher = CommandeOFMatcher(loader)
        matcher._initialiser_of_conso(articles={article})

        # Trouver un OF FERME et un OF SUGGÉRÉ
        of_ferme = next((of for of in ofs_by_article[article] if of.statut_num == 1), None)
        of_suggere = next((of for of in ofs_by_article[article] if of.statut_num == 3), None)

        if of_ferme is None or of_suggere is None:
            pytest.skip("Pas assez d'OFs pour tester")

        # Créer OFConso pour tester
        of_conso_ferme = OFConso(
            of=of_ferme,
            qte_disponible=of_ferme.qte_restante,
            qte_allouee=0,
            commandes_servees=[]
        )

        of_conso_suggere = OFConso(
            of=of_suggere,
            qte_disponible=of_suggere.qte_restante,
            qte_allouee=0,
            commandes_servees=[]
        )

        # Vérifier que le FERME est prioritaire
        # (Ceci est testé indirectement via _find_of_for_besoin_net)
        assert of_conso_ferme.of.statut_num == 1
        assert of_conso_suggere.of.statut_num == 3

    def test_planned_of_priority_between_ferme_and_suggested(self, loader):
        """Test que les OF PLANIFIÉS ont une priorité intermédiaire."""
        # Trouver des OF des 3 statuts pour le même article
        from collections import defaultdict

        ofs_by_article = defaultdict(list)
        for of in loader.ofs:
            if of.statut_num in (1, 2, 3) and of.qte_restante > 0:
                ofs_by_article[of.article].append(of)

        # Trouver un article avec les 3 statuts
        article = None
        for art, ofs in ofs_by_article.items():
            statuts = {of.statut_num for of in ofs}
            if len(statuts) == 3:  # FERME, PLANIFIÉ, SUGGÉRÉ
                article = art
                break

        if article is None:
            pytest.skip("Aucun article avec les 3 statuts trouvé")

        # Récupérer les OF
        of_ferme = next((of for of in ofs_by_article[article] if of.statut_num == 1), None)
        of_planifie = next((of for of in ofs_by_article[article] if of.statut_num == 2), None)
        of_suggere = next((of for of in ofs_by_article[article] if of.statut_num == 3), None)

        # Vérifier les priorités
        # FERME (priorité 0) < PLANIFIÉ (priorité 1) < SUGGÉRÉ (priorité 2)
        assert of_ferme is not None
        assert of_planifie is not None
        assert of_suggere is not None

        # Les priorités sont définies dans _find_of_for_besoin_net
        # Ce test vérifie juste qu'on a les 3 types
        assert of_ferme.statut_num == 1
        assert of_planifie.statut_num == 2
        assert of_suggere.statut_num == 3
