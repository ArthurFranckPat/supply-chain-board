from __future__ import annotations

from datetime import date

from suivi_commandes.domain.models import OrderLine, TypeCommande, Status
from suivi_commandes.domain.stock_port import StockProvider, StockBreakdown
from suivi_commandes.domain.status_assigner import assign_statuses


class FakeStockProvider(StockProvider):
    """StockProvider de test — pas de DataLoader, pas de pandas."""

    def __init__(
        self,
        stocks: dict[str, float] | None = None,
        breakdowns: dict[str, StockBreakdown] | None = None,
    ) -> None:
        self._stocks = stocks or {}
        self._breakdowns = breakdowns or {}

    def get_available_stock(self, article: str) -> float:
        breakdown = self._breakdowns.get(article)
        if breakdown is not None:
            return breakdown.available_total
        return self._stocks.get(article, 0.0)

    def get_stock_breakdown(self, article: str) -> StockBreakdown:
        breakdown = self._breakdowns.get(article)
        if breakdown is not None:
            return breakdown
        total = max(0.0, self._stocks.get(article, 0.0))
        return StockBreakdown(available_total=total, available_strict=total, available_qc=0.0)


def test_besoin_nul_est_a_expedier():
    line = OrderLine(
        num_commande="CMD-001",
        article="A-001",
        type_commande=TypeCommande.MTO,
        date_expedition=date(2026, 1, 10),
        qte_restante=0,
        qte_allouee=0,
    )
    provider = FakeStockProvider({})
    result = assign_statuses([line], provider, reference_date=date(2026, 1, 15))

    assert len(result) == 1
    assert result[0].status == Status.A_EXPEDIER


def test_a_expedier_peut_signaler_cq_si_qte_allouee_repose_sur_stock_cq():
    line = OrderLine(
        num_commande="CMD-001B",
        article="A-001B",
        type_commande=TypeCommande.MTS,
        date_expedition=date(2026, 1, 10),
        qte_restante=4,
        qte_allouee=4,
    )
    provider = FakeStockProvider(
        breakdowns={
            "A-001B": StockBreakdown(
                available_total=4.0,
                available_strict=1.0,
                available_qc=3.0,
            )
        }
    )

    result = assign_statuses([line], provider, reference_date=date(2026, 1, 15))

    assert result[0].status == Status.A_EXPEDIER
    assert result[0].alerte_cq_statut is True


def test_mto_couvert_par_stock_est_allocation_a_faire():
    line = OrderLine(
        num_commande="CMD-002",
        article="A-002",
        type_commande=TypeCommande.MTO,
        date_expedition=date(2026, 1, 20),
        qte_restante=10,
        qte_allouee=0,
    )
    provider = FakeStockProvider({"A-002": 100})
    result = assign_statuses([line], provider, reference_date=date(2026, 1, 15))

    assert result[0].status == Status.ALLOCATION_A_FAIRE


def test_mto_non_couvert_date_passee_est_retard_prod():
    line = OrderLine(
        num_commande="CMD-003",
        article="A-003",
        type_commande=TypeCommande.MTO,
        date_expedition=date(2026, 1, 5),
        qte_restante=10,
        qte_allouee=0,
    )
    provider = FakeStockProvider({"A-003": 0})
    result = assign_statuses([line], provider, reference_date=date(2026, 1, 15))

    assert result[0].status == Status.RETARD_PROD


def test_mts_achete_avec_stock_est_allocation_a_faire():
    """A2183/AR2601220 — MTS acheté, stock disponible, date dépassée.
    Avant : Retard Prod / Attente réception fournisseur
    Après : Allocation à faire
    """
    line = OrderLine(
        num_commande="AR2601220",
        article="A2183",
        type_commande=TypeCommande.MTS,
        date_expedition=date(2026, 1, 10),
        qte_restante=10,
        qte_allouee=0,
        is_fabrique=False,
    )
    provider = FakeStockProvider({"A2183": 100})
    result = assign_statuses([line], provider, reference_date=date(2026, 1, 20))

    assert result[0].status == Status.ALLOCATION_A_FAIRE


def test_mts_achete_sans_stock_date_passee_est_retard_prod():
    line = OrderLine(
        num_commande="AR2601221",
        article="A2184",
        type_commande=TypeCommande.MTS,
        date_expedition=date(2026, 1, 10),
        qte_restante=10,
        qte_allouee=0,
        is_fabrique=False,
    )
    provider = FakeStockProvider({"A2184": 0})
    result = assign_statuses([line], provider, reference_date=date(2026, 1, 20))

    assert result[0].status == Status.RETARD_PROD


def test_mts_fabrique_hard_pegged_est_ras():
    line = OrderLine(
        num_commande="CMD-004",
        article="A-004",
        type_commande=TypeCommande.MTS,
        date_expedition=date(2026, 1, 20),
        qte_restante=10,
        qte_allouee=0,
        is_fabrique=True,
        is_hard_pegged=True,
    )
    provider = FakeStockProvider({})
    result = assign_statuses([line], provider, reference_date=date(2026, 1, 15))

    assert result[0].status == Status.RAS


def test_mts_fabrique_sans_hard_pegging_date_passee_est_retard():
    line = OrderLine(
        num_commande="CMD-005",
        article="A-005",
        type_commande=TypeCommande.MTS,
        date_expedition=date(2026, 1, 5),
        qte_restante=10,
        qte_allouee=0,
        is_fabrique=True,
        is_hard_pegged=False,
    )
    provider = FakeStockProvider({})
    result = assign_statuses([line], provider, reference_date=date(2026, 1, 15))

    assert result[0].status == Status.RETARD_PROD


def test_allocation_virtuelle_sequentielle_partage_stock():
    """Deux lignes pour le même article : le stock est consommé séquentiellement."""
    line1 = OrderLine(
        num_commande="CMD-006",
        article="A-006",
        type_commande=TypeCommande.MTO,
        date_expedition=date(2026, 1, 10),
        qte_restante=8,
        qte_allouee=0,
    )
    line2 = OrderLine(
        num_commande="CMD-007",
        article="A-006",
        type_commande=TypeCommande.MTO,
        date_expedition=date(2026, 1, 11),
        qte_restante=5,
        qte_allouee=0,
    )
    provider = FakeStockProvider({"A-006": 10})
    result = assign_statuses([line1, line2], provider, reference_date=date(2026, 1, 15))

    # line1 consomme 8 → reste 2 → couverte
    assert result[0].status == Status.ALLOCATION_A_FAIRE
    # line2 consomme 2 → manque 3 → non couverte + date passée → Retard Prod
    assert result[1].status == Status.RETARD_PROD


def test_allocation_virtuelle_marque_utilisation_stock_cq():
    line = OrderLine(
        num_commande="CMD-008",
        article="A-008",
        type_commande=TypeCommande.MTO,
        date_expedition=date(2026, 1, 20),
        qte_restante=10,
        qte_allouee=0,
    )
    provider = FakeStockProvider(
        breakdowns={
            "A-008": StockBreakdown(
                available_total=15.0,
                available_strict=5.0,
                available_qc=10.0,
            )
        }
    )

    result = assign_statuses([line], provider, reference_date=date(2026, 1, 15))

    assert result[0].status == Status.ALLOCATION_A_FAIRE
    assert result[0].qte_allouee_virtuelle == 10
    assert result[0].qte_allouee_virtuelle_stricte == 5
    assert result[0].qte_allouee_virtuelle_cq == 5
    assert result[0].utilise_stock_sous_cq is True


def test_allocation_virtuelle_consomme_strict_puis_cq_sequentiellement():
    line1 = OrderLine(
        num_commande="CMD-009",
        article="A-009",
        type_commande=TypeCommande.MTO,
        date_expedition=date(2026, 1, 20),
        qte_restante=8,
        qte_allouee=0,
    )
    line2 = OrderLine(
        num_commande="CMD-010",
        article="A-009",
        type_commande=TypeCommande.MTO,
        date_expedition=date(2026, 1, 21),
        qte_restante=4,
        qte_allouee=0,
    )
    provider = FakeStockProvider(
        breakdowns={
            "A-009": StockBreakdown(
                available_total=13.0,
                available_strict=8.0,
                available_qc=5.0,
            )
        }
    )

    result = assign_statuses([line1, line2], provider, reference_date=date(2026, 1, 15))

    assert result[0].utilise_stock_sous_cq is False
    assert result[0].qte_allouee_virtuelle_stricte == 8
    assert result[0].qte_allouee_virtuelle_cq == 0

    assert result[1].utilise_stock_sous_cq is True
    assert result[1].qte_allouee_virtuelle_stricte == 0
    assert result[1].qte_allouee_virtuelle_cq == 4


def test_mts_fabrique_avec_allocation_commande_remonte_signal_cq():
    """MTS fabriqué: le signal CQ dépend de la qté allouée à la commande."""
    line = OrderLine(
        num_commande="AR2601626",
        article="BDH2239AL",
        type_commande=TypeCommande.MTS,
        date_expedition=date(2026, 1, 20),
        qte_restante=6,
        qte_allouee=6,
        is_fabrique=True,
        is_hard_pegged=True,
    )
    provider = FakeStockProvider(
        breakdowns={
            "BDH2239AL": StockBreakdown(
                available_total=6.0,
                available_strict=2.0,
                available_qc=4.0,
            )
        }
    )

    result = assign_statuses([line], provider, reference_date=date(2026, 1, 15))

    assert result[0].status == Status.A_EXPEDIER
    assert result[0].utilise_stock_sous_cq is False
    assert result[0].alerte_cq_statut is True
    assert result[0].qte_allouee_virtuelle == 0


def test_mts_fabrique_sans_allocation_commande_ne_remonte_pas_signal_cq():
    """MTS fabriqué non alloué: pas de flag CQ tant que la commande n'est pas allouée."""
    line = OrderLine(
        num_commande="AR2601840",
        article="BDH2237AL",
        type_commande=TypeCommande.MTS,
        date_expedition=date(2026, 5, 7),
        qte_restante=384,
        qte_allouee=0,
        is_fabrique=True,
        is_hard_pegged=False,
    )
    provider = FakeStockProvider(
        breakdowns={
            "BDH2237AL": StockBreakdown(
                available_total=425.0,
                available_strict=41.0,
                available_qc=384.0,
            )
        }
    )

    result = assign_statuses([line], provider, reference_date=date(2026, 4, 26))

    assert result[0].status == Status.RAS
    assert result[0].alerte_cq_statut is False
