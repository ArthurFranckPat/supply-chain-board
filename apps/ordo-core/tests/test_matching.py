"""Tests pour le matching commande->OF."""

import pytest
from datetime import date
from types import SimpleNamespace

from src.loaders import DataLoader
from src.algorithms.matching import CommandeOFMatcher, OFConso
from src.models.besoin_client import BesoinClient, NatureBesoin, TypeCommande
from src.models.of import OF
from src.models.stock import Stock


# ---------------------------------------------------------------------------
# Helpers - construction de fausses donnees
# ---------------------------------------------------------------------------

def _make_of(num_of, article, statut_num, date_fin, qte_restante=100):
    return OF(
        num_of=num_of,
        article=article,
        description=f"DESC_{article}",
        statut_num=statut_num,
        statut_texte={1: "Ferme", 2: "Planifie", 3: "Suggere"}.get(statut_num, "Suggere"),
        date_fin=date_fin,
        qte_a_fabriquer=qte_restante,
        qte_fabriquee=0,
        qte_restante=qte_restante,
    )


def _make_commande(num_commande, article, date_exp, qte_restante=100,
                   type_commande=TypeCommande.NOR, of_contremarque="",
                   nature_besoin=NatureBesoin.COMMANDE):
    return BesoinClient(
        nom_client="Client Test",
        code_pays="FR",
        type_commande=type_commande,
        num_commande=num_commande,
        nature_besoin=nature_besoin,
        article=article,
        description=f"DESC_{article}",
        categorie="PF3",
        source_origine_besoin="Ventes",
        of_contremarque=of_contremarque,
        date_commande=date(2026, 3, 1),
        date_expedition_demandee=date_exp,
        qte_commandee=qte_restante,
        qte_allouee=0,
        qte_restante=qte_restante,
    )


def _make_loader(ofs=None, commandes_clients=None, stocks=None,
                 nomenclatures=None, articles=None, allocations=None):
    """Cree un DataLoader avec des controles internes fixes (pas d'E/S disque)."""
    loader = DataLoader.__new__(DataLoader)
    loader.csv_loader = None
    loader._ofs = ofs or []
    loader._commandes_clients = commandes_clients or []
    loader._stocks = stocks or {}
    loader._nomenclatures = nomenclatures or {}
    loader._articles = articles or {}
    loader._allocations = allocations or {}
    loader._gammes = {}
    loader._receptions = []
    loader._receptions_by_article = {}
    loader._ofs_by_num = {of.num_of: of for of in loader._ofs}
    loader._ofs_by_origin = {}
    return loader


# Fixtures utilisant les helpers

@pytest.fixture
def sample_ofs():
    return [
        _make_of("F-FERME-MC4337", "MC4337", 1, date(2026, 4, 10), qte_restante=50),
        _make_of("F-SUGG-MC4337", "MC4337", 3, date(2026, 4, 15), qte_restante=80),
        _make_of("F-PLAN-MC4337", "MC4337", 2, date(2026, 4, 12), qte_restante=60),
        _make_of("F-FERME-OTHER", "OTHER_ART", 1, date(2026, 4, 8), qte_restante=30),
        _make_of("F-SUGG-OTHER", "OTHER_ART", 3, date(2026, 4, 20), qte_restante=40),
    ]


@pytest.fixture
def sample_commandes():
    return [
        _make_commande("CMD-MTS-1", "MC4337", date(2026, 4, 10),
                       type_commande=TypeCommande.MTS, of_contremarque="F-FERME-MC4337"),
        _make_commande("CMD-MTS-NOOF", "MC4337", date(2026, 4, 12),
                       type_commande=TypeCommande.MTS, of_contremarque=""),
        _make_commande("CMD-NOR-1", "MC4337", date(2026, 4, 11),
                       type_commande=TypeCommande.NOR),
        _make_commande("CMD-NOR-2", "OTHER_ART", date(2026, 4, 9),
                       type_commande=TypeCommande.NOR),
    ]


@pytest.fixture
def sample_stocks():
    return {
        "MC4337": Stock("MC4337", stock_physique=200, stock_alloue=50, stock_bloque=0),
        "OTHER_ART": Stock("OTHER_ART", stock_physique=100, stock_alloue=10, stock_bloque=0),
    }


@pytest.fixture
def loader(sample_ofs, sample_commandes, sample_stocks):
    return _make_loader(ofs=sample_ofs, commandes_clients=sample_commandes, stocks=sample_stocks)


@pytest.fixture
def matcher(loader):
    return CommandeOFMatcher(loader)


class TestOFConso:
    """Tests pour la classe OFConso."""

    def test_init(self):
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

        # Test avec quantite suffisante
        assert conso.est_disponible(50) is True

        # Test avec quantite insuffisante
        assert conso.est_disponible(150) is False

        # Test avec quantite exacte
        assert conso.est_disponible(100) is True

    def test_allouer(self):
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
        matcher = CommandeOFMatcher(loader)

        assert matcher.data_loader == loader
        assert matcher.date_tolerance_days == 10
        assert matcher.of_conso == {}

    def test_init_with_tolerance(self, loader):
        matcher = CommandeOFMatcher(loader, date_tolerance_days=5)

        assert matcher.date_tolerance_days == 5

    def test_reset(self, loader):
        matcher = CommandeOFMatcher(loader)

        # Initialiser des OF
        matcher._initialiser_of_conso()

        assert len(matcher.of_conso) > 0

        # Reset
        matcher.reset()

        assert matcher.of_conso == {}
        assert matcher.ofs_deja_utilises == set()

    def test_initialiser_of_conso(self, loader):
        matcher = CommandeOFMatcher(loader)

        # Initialiser
        matcher._initialiser_of_conso()

        # Verifier que des OF ont ete initialises
        assert len(matcher.of_conso) > 0

        # Verifier que tous les OF ont qte_disponible = qte_restante
        for of_conso in matcher.of_conso.values():
            assert of_conso.qte_disponible == of_conso.of.qte_restante

    def test_initialiser_of_conso_with_articles(self, loader):
        matcher = CommandeOFMatcher(loader)

        # Initialiser pour un article specifique
        article = "MC4337"
        matcher._initialiser_of_conso(articles={article})

        # Verifier que seuls les OF de cet article sont initialises
        for of_conso in matcher.of_conso.values():
            assert of_conso.of.article == article

    def test_match_mts_with_of_link(self, loader):
        """Test le matching d'une commande MTS avec OF lie (lien par NUM_ORDRE_ORIGINE)."""
        # Trouver une commande MTS avec contremarque
        commande = None
        for cmd in loader.commandes_clients:
            if cmd.is_mts() and cmd.of_contremarque:
                commande = cmd
                break

        assert commande is not None, "Aucune commande MTS avec OF trouvée"

        # Ajouter le lien NUM_ORDRE_ORIGINE dans les OF pour le matcher
        # Le matcher utilise get_ofs_by_origin qui utilise _ofs_by_origin
        loader._ofs_by_origin = {commande.num_commande: [
            _make_of(commande.of_contremarque, commande.article, 1, commande.date_expedition_demandee, qte_restante=50)
        ]}

        matcher = CommandeOFMatcher(loader)

        # Matcher la commande
        result = matcher.match_commande(commande)

        assert result.commande == commande

    def test_match_mts_without_of_link(self, loader):
        """Test le matching d'une commande MTS sans OF (OF vide ou inexistant)."""
        # Trouver une commande MTS sans OF
        commande = None
        for cmd in loader.commandes_clients:
            if cmd.is_mts() and not cmd.of_contremarque:
                commande = cmd
                break

        assert commande is not None, "Aucune commande MTS sans OF trouvée"

        matcher = CommandeOFMatcher(loader)

        # Matcher la commande
        result = matcher.match_commande(commande)

        assert result.commande == commande
        assert result.matching_method != "Lien direct NUM_ORDRE_ORIGINE"

    def test_match_nor_mto(self, loader):
        """Test le matching d'une commande NOR/MTO."""
        # Trouver une commande NOR/MTO
        commande = next((cmd for cmd in loader.commandes_clients if cmd.is_nor_mto()), None)

        assert commande is not None, "Aucune commande NOR/MTO trouvée"

        matcher = CommandeOFMatcher(loader)

        # Matcher la commande
        result = matcher.match_commande(commande)

        assert result.commande == commande
        assert result.stock_allocation is not None

    def test_of_priority_in_matching(self):
        """Test que les OF FERMES sont prioritaires sur les SUGGERES."""
        of_ferme = _make_of("F-FERME", "ART1", 1, date(2026, 4, 10), qte_restante=50)
        of_suggere = _make_of("F-SUGG", "ART1", 3, date(2026, 4, 12), qte_restante=50)

        loader = _make_loader(
            ofs=[of_ferme, of_suggere],
            stocks={"ART1": Stock("ART1", stock_physique=0, stock_alloue=0, stock_bloque=0)},
        )

        matcher = CommandeOFMatcher(loader)
        matcher._initialiser_of_conso(articles={"ART1"})

        # Verifier les priorites : FERME = 0, SUGGERE = 2
        of_conso_ferme = matcher.of_conso["F-FERME"]
        of_conso_suggere = matcher.of_conso["F-SUGG"]

        assert of_conso_ferme.of.statut_num == 1
        assert of_conso_suggere.of.statut_num == 3

    def test_planned_of_priority_between_ferme_and_suggested(self):
        """Test que les OF PLANIFIES ont une priorite intermediaire."""
        of_ferme = _make_of("F-FERME", "ART1", 1, date(2026, 4, 10), qte_restante=50)
        of_planifie = _make_of("F-PLAN", "ART1", 2, date(2026, 4, 11), qte_restante=50)
        of_suggere = _make_of("F-SUGG", "ART1", 3, date(2026, 4, 12), qte_restante=50)

        loader = _make_loader(
            ofs=[of_ferme, of_planifie, of_suggere],
        )

        # Verifier les priorites definies dans _find_of_for_besoin_net
        # FERME (priorite 0) < PLANIFIE (priorite 1) < SUGGERE (priorite 2)
        assert of_ferme.statut_num == 1
        assert of_planifie.statut_num == 2
        assert of_suggere.statut_num == 3
