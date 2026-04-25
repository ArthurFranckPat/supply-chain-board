"""Tests pour AllocationManager."""

import pytest
from datetime import date
from types import SimpleNamespace

from production_planning.feasibility.recursive import RecursiveChecker
from production_planning.orders.allocation import AllocationManager, StockState
from production_planning.models.of import OF
from production_planning.models.stock import Stock
from production_planning.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle
from production_planning.models.allocation import OFAllocation


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


def _make_nomenclature(parent, components):
    """Cree une nomenclature simple. components: list of (code, qte, TypeArticle)."""
    return Nomenclature(
        article=parent,
        designation=f"DESC_{parent}",
        composants=[
            NomenclatureEntry(
                article_parent=parent,
                designation_parent=f"DESC_{parent}",
                niveau=10,
                article_composant=code,
                designation_composant=f"DESC_{code}",
                qte_lien=qte,
                type_article=type_article,
            )
            for code, qte, type_article in components
        ],
    )


def _make_loader(ofs=None, stocks=None, nomenclatures=None,
                 articles=None, allocations=None):
    """Cree un SimpleNamespace imitant DataLoader avec les donnees fournies."""
    allocations = allocations or {}
    nomenclatures = nomenclatures or {}
    stocks = stocks or {}
    articles = articles or {}
    ofs = ofs or []

    return SimpleNamespace(
        commandes_clients=[],
        ofs=ofs,
        articles=articles,
        stocks=stocks,
        nomenclatures=nomenclatures,
        get_article=lambda article: articles.get(article),
        get_nomenclature=lambda article: nomenclatures.get(article),
        get_stock=lambda article: stocks.get(article),
        get_allocations_of=lambda num_doc: allocations.get(num_doc, []),
        get_ofs_by_article=lambda article, statut=None, date_besoin=None: [
            of for of in ofs if of.article == article and of.qte_restante > 0
            and (statut is None or of.statut_num == statut)
        ],
        get_receptions=lambda article: [],
    )


@pytest.fixture
def sample_ofs():
    """OF de chaque statut avec nomenclature."""
    return [
        _make_of("OF-FERME-1", "PF_A", 1, date(2026, 4, 20), qte_restante=50),
        _make_of("OF-PLAN-1", "PF_A", 2, date(2026, 4, 25), qte_restante=30),
        _make_of("OF-SUGG-1", "PF_A", 3, date(2026, 4, 30), qte_restante=20),
        _make_of("OF-FERME-2", "PF_B", 1, date(2026, 4, 18), qte_restante=40),
        _make_of("OF-SUGG-2", "PF_B", 3, date(2026, 4, 22), qte_restante=60),
    ]


@pytest.fixture
def sample_stocks():
    return {
        "COMP_X": Stock("COMP_X", stock_physique=200, stock_alloue=50, stock_bloque=0),
        "COMP_Y": Stock("COMP_Y", stock_physique=100, stock_alloue=10, stock_bloque=0),
    }


@pytest.fixture
def sample_nomenclatures():
    return {
        "PF_A": _make_nomenclature("PF_A", [
            ("COMP_X", 2.0, TypeArticle.ACHETE),
        ]),
        "PF_B": _make_nomenclature("PF_B", [
            ("COMP_Y", 1.0, TypeArticle.ACHETE),
        ]),
    }


@pytest.fixture
def sample_allocations():
    # OF-FERME-1 a deja COMP_X alloue
    return {
        "OF-FERME-1": [OFAllocation(article="COMP_X", qte_allouee=50.0, num_doc="OF-FERME-1", date_besoin="20/04/2026")],
    }


@pytest.fixture
def loader(sample_ofs, sample_stocks, sample_nomenclatures, sample_allocations):
    return _make_loader(
        ofs=sample_ofs,
        stocks=sample_stocks,
        nomenclatures=sample_nomenclatures,
        allocations=sample_allocations,
    )


@pytest.fixture
def checker(loader):
    return RecursiveChecker(loader)


class TestStockState:
    """Tests pour la classe StockState."""

    def test_init(self):
        """Test l'initialisation de StockState."""
        initial_stock = {"A1953": 100, "C1948": 200}
        stock_state = StockState(initial_stock)

        assert stock_state.initial_stock == initial_stock
        assert stock_state.allocated_stock == {}

    def test_get_available(self):
        """Test la recuperation du stock disponible."""
        initial_stock = {"A1953": 100}
        stock_state = StockState(initial_stock)

        # Stock disponible initial
        assert stock_state.get_available("A1953") == 100

        # Article non present
        assert stock_state.get_available("INCONNU") == 0

    def test_allocate(self):
        """Test l'allocation de stock."""
        initial_stock = {"A1953": 100}
        stock_state = StockState(initial_stock)

        # Allouer 50 unites
        stock_state.allocate("OF001", {"A1953": 50})

        assert stock_state.get_available("A1953") == 50

    def test_allocate_multiple(self):
        """Test plusieurs allocations successives."""
        initial_stock = {"A1953": 100}
        stock_state = StockState(initial_stock)

        # Premiere allocation
        stock_state.allocate("OF001", {"A1953": 30})
        assert stock_state.get_available("A1953") == 70

        # Deuxieme allocation
        stock_state.allocate("OF002", {"A1953": 20})
        assert stock_state.get_available("A1953") == 50

    def test_allocate_multiple_articles(self):
        """Test l'allocation de plusieurs articles."""
        initial_stock = {"A1953": 100, "C1948": 200}
        stock_state = StockState(initial_stock)

        # Allouer plusieurs articles
        stock_state.allocate("OF001", {"A1953": 30, "C1948": 50})

        assert stock_state.get_available("A1953") == 70
        assert stock_state.get_available("C1948") == 150


class TestAllocationManager:
    """Tests pour la classe AllocationManager."""

    def test_init(self, loader, checker):
        """Test l'initialisation d'AllocationManager."""
        manager = AllocationManager(loader, checker)

        assert manager.data_loader == loader
        assert manager.checker == checker

    def test_allocate_stock_ferme_with_allocations_skipped(self, loader, checker):
        """Test que les OF FERMES avec allocations skip l'allocation virtuelle."""
        # OF-FERME-1 a deja des allocations dans sample_allocations
        of = next((o for o in loader.ofs if o.num_of == "OF-FERME-1"), None)
        assert of is not None

        manager = AllocationManager(loader, checker)

        results = manager.allocate_stock([of])

        assert of.num_of in results
        result = results[of.num_of]

        # Pas d'allocation virtuelle pour FERME avec allocations
        assert result.allocated_quantity == {} or result.allocated_quantity is None

    def test_allocate_stock_planned_uses_virtual_allocation(self, loader, checker):
        """Test que les OF PLANIFIES utilisent l'allocation virtuelle."""
        of = next((o for o in loader.ofs if o.statut_num == 2), None)
        assert of is not None

        manager = AllocationManager(loader, checker)

        # Creer un stock virtuel limite
        stock_state = StockState({"COMP_X": 100})

        # Allouer manuellement pour tester
        result = manager._allocate_of(of, stock_state)

        assert result is not None
        # Le resultat depend de la faisabilite de l'OF

    def test_allocate_stock_suggested_uses_virtual_allocation(self, loader, checker):
        """Test que les OF SUGGERES utilisent l'allocation virtuelle."""
        of = next((o for o in loader.ofs if o.statut_num == 3), None)
        assert of is not None

        manager = AllocationManager(loader, checker)

        # Creer un stock virtuel limite
        stock_state = StockState({"COMP_X": 100})

        # Allouer manuellement pour tester
        result = manager._allocate_of(of, stock_state)

        assert result is not None

    def test_allocate_stock_mixed_statuses(self, loader, checker):
        """Test l'allocation avec un mix des 3 statuts."""
        # Prendre un OF de chaque statut
        ofs = []
        for statut in [1, 2, 3]:
            for test_of in loader.ofs:
                if test_of.statut_num == statut:
                    ofs.append(test_of)
                    break

        assert len(ofs) >= 3, "Pas assez d'OFs pour tester"

        manager = AllocationManager(loader, checker)

        # Allouer
        results = manager.allocate_stock(ofs)

        # Verifier que tous les OF ont un resultat
        for of in ofs:
            assert of.num_of in results

    def test_sort_ofs_by_priority(self, loader, checker):
        """Test le tri des OF par priorite."""
        manager = AllocationManager(loader, checker)

        # Prendre quelques OF de chaque statut
        ofs = []
        for statut in [1, 2, 3]:
            for test_of in loader.ofs:
                if test_of.statut_num == statut:
                    ofs.append(test_of)
                    if len([o for o in ofs if o.statut_num == statut]) >= 2:
                        break

        assert len(ofs) >= 3, "Pas assez d'OFs pour tester"

        # Trier
        sorted_ofs = manager._sort_ofs_by_priority(ofs, StockState({}))

        # Verifier que les FERMES (statut 1) sont avant les PLANIFIES/SUGGERES
        ferme_indices = [i for i, of in enumerate(sorted_ofs) if of.statut_num == 1]
        other_indices = [i for i, of in enumerate(sorted_ofs) if of.statut_num in (2, 3)]

        if ferme_indices and other_indices:
            assert max(ferme_indices) < min(other_indices)

    def test_calculate_allocations(self, loader, checker):
        """Test le calcul des allocations."""
        # Trouver un OF avec une nomenclature
        of = next(
            (test_of for test_of in loader.ofs
             if loader.get_nomenclature(test_of.article) is not None),
            None
        )

        assert of is not None, "Aucun OF avec nomenclature trouve"

        manager = AllocationManager(loader, checker)

        stock_state = StockState({"COMP_X": 1000})

        # Calculer les allocations
        allocations = manager._calculate_allocations(of, stock_state)

        assert isinstance(allocations, dict)
        # Verifier que les quantites sont positives
        for article, qte in allocations.items():
            assert qte > 0

    def test_allocate_depletes_stock(self, loader, checker):
        """Test que l'allocation decremente le stock."""
        manager = AllocationManager(loader, checker)

        # Prendre un OF SUGGERE simple
        of = next((of for of in loader.ofs if of.statut_num == 3), None)

        assert of is not None, "Aucun OF SUGGERE trouve"

        # Creer un stock virtuel limite
        initial_stock = {"COMP_X": 100}
        stock_state = StockState(initial_stock)

        initial_available = stock_state.get_available("COMP_X")

        # Calculer et allouer
        allocations = manager._calculate_allocations(of, stock_state)

        if allocations and "COMP_X" in allocations:
            stock_state.allocate(of.num_of, allocations)

            # Verifier que le stock a diminue
            final_available = stock_state.get_available("COMP_X")
            assert final_available < initial_available
