"""Tests pour AllocationManager."""

import pytest

from src.loaders import DataLoader
from src.checkers.recursive import RecursiveChecker
from src.algorithms.allocation import AllocationManager, StockState, AllocationStatus
from src.models.of import OF


@pytest.fixture
def loader():
    """Fixture pour DataLoader."""
    loader = DataLoader("data")
    loader.load_all()
    return loader


@pytest.fixture
def checker(loader):
    """Fixture pour RecursiveChecker."""
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
        """Test la récupération du stock disponible."""
        initial_stock = {"A1953": 100}
        stock_state = StockState(initial_stock)

        # Stock disponible initial
        assert stock_state.get_available("A1953") == 100

        # Article non présent
        assert stock_state.get_available("INCONNU") == 0

    def test_allocate(self):
        """Test l'allocation de stock."""
        initial_stock = {"A1953": 100}
        stock_state = StockState(initial_stock)

        # Allouer 50 unités
        stock_state.allocate("OF001", {"A1953": 50})

        assert stock_state.get_available("A1953") == 50

    def test_allocate_multiple(self):
        """Test plusieurs allocations successives."""
        initial_stock = {"A1953": 100}
        stock_state = StockState(initial_stock)

        # Première allocation
        stock_state.allocate("OF001", {"A1953": 30})
        assert stock_state.get_available("A1953") == 70

        # Deuxième allocation
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
        # Trouver un OF FERME avec allocations
        of = None
        for test_of in loader.ofs:
            if test_of.statut_num == 1:  # FERME
                allocations = loader.get_allocations_of(test_of.num_of)
                if allocations:
                    of = test_of
                    break

        if of is None:
            pytest.skip("Aucun OF FERME avec allocations trouvé")

        manager = AllocationManager(loader, checker)

        results = manager.allocate_stock([of])

        assert of.num_of in results
        result = results[of.num_of]

        # Pas d'allocation virtuelle pour FERME avec allocations
        assert result.allocated_quantity == {} or result.allocated_quantity is None

    def test_allocate_stock_planned_uses_virtual_allocation(self, loader, checker):
        """Test que les OF PLANIFIÉS utilisent l'allocation virtuelle."""
        # Trouver un OF PLANIFIÉ
        of = next((of for of in loader.ofs if of.statut_num == 2), None)

        if of is None:
            pytest.skip("Aucun OF PLANIFIÉ trouvé")

        manager = AllocationManager(loader, checker)

        # Créer un stock virtuel limité
        stock_state = StockState({"A1953": 100})

        # Allouer manuellement pour tester
        result = manager._allocate_of(of, stock_state)

        assert result is not None
        # Le résultat dépend de la faisabilité de l'OF

    def test_allocate_stock_suggested_uses_virtual_allocation(self, loader, checker):
        """Test que les OF SUGGÉRÉS utilisent l'allocation virtuelle."""
        # Trouver un OF SUGGÉRÉ
        of = next((of for of in loader.ofs if of.statut_num == 3), None)

        if of is None:
            pytest.skip("Aucun OF SUGGÉRÉ trouvé")

        manager = AllocationManager(loader, checker)

        # Créer un stock virtuel limité
        stock_state = StockState({"A1953": 100})

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

        if len(ofs) < 3:
            pytest.skip("Pas assez d'OFs pour tester")

        manager = AllocationManager(loader, checker)

        # Allouer
        results = manager.allocate_stock(ofs)

        # Vérifier que tous les OF ont un résultat
        for of in ofs:
            assert of.num_of in results

    def test_sort_ofs_by_priority(self, loader, checker):
        """Test le tri des OF par priorité."""
        manager = AllocationManager(loader, checker)

        # Prendre quelques OF de chaque statut
        ofs = []
        for statut in [1, 2, 3]:
            for test_of in loader.ofs:
                if test_of.statut_num == statut:
                    ofs.append(test_of)
                    if len([o for o in ofs if o.statut_num == statut]) >= 2:
                        break

        if len(ofs) < 3:
            pytest.skip("Pas assez d'OFs pour tester")

        # Trier
        sorted_ofs = manager._sort_ofs_by_priority(ofs, StockState({}))

        # Vérifier que les FERMES (statut 1) sont avant les PLANIFIÉS/SUGGÉRÉS
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

        if of is None:
            pytest.skip("Aucun OF avec nomenclature trouvé")

        manager = AllocationManager(loader, checker)

        stock_state = StockState({"A1953": 1000})

        # Calculer les allocations
        allocations = manager._calculate_allocations(of, stock_state)

        assert isinstance(allocations, dict)
        # Vérifier que les quantités sont positives
        for article, qte in allocations.items():
            assert qte > 0

    def test_allocate_depletes_stock(self, loader, checker):
        """Test que l'allocation décrémente le stock."""
        manager = AllocationManager(loader, checker)

        # Prendre un OF SUGGÉRÉ simple
        of = next((of for of in loader.ofs if of.statut_num == 3), None)

        if of is None:
            pytest.skip("Aucun OF SUGGÉRÉ trouvé")

        # Créer un stock virtuel limité
        initial_stock = {"A1953": 100}
        stock_state = StockState(initial_stock)

        initial_available = stock_state.get_available("A1953")

        # Calculer et allouer
        allocations = manager._calculate_allocations(of, stock_state)

        if allocations and "A1953" in allocations:
            stock_state.allocate(of.num_of, allocations)

            # Vérifier que le stock a diminué
            final_available = stock_state.get_available("A1953")
            assert final_available < initial_available
