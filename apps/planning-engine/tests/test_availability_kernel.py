from datetime import date
from types import SimpleNamespace

from planning_engine.availability import AvailabilityKernel
from planning_engine.models.reception import Reception
from planning_engine.models.stock import Stock
from planning_engine.orders.allocation import StockState


def _make_loader(*, stocks=None, receptions=None):
    stocks = stocks or {}
    receptions = receptions or {}
    return SimpleNamespace(
        get_stock=lambda code: stocks.get(code),
        get_receptions=lambda code: receptions.get(code, []),
    )


def test_snapshot_includes_receptions_up_to_date_inclusive():
    loader = _make_loader(
        stocks={"C1": Stock("C1", stock_physique=10, stock_alloue=2, stock_bloque=0)},
        receptions={
            "C1": [
                Reception("PO-1", "C1", "F1", 5, date(2026, 4, 10)),
                Reception("PO-2", "C1", "F1", 3, date(2026, 4, 12)),
            ]
        },
    )
    kernel = AvailabilityKernel(loader)

    snap = kernel.snapshot("C1", date(2026, 4, 10), use_receptions=True)

    assert snap.available_without_receptions == 8.0
    assert snap.receptions_until_date == 5.0
    assert snap.available_at_date == 13.0
    assert snap.earliest_reception == date(2026, 4, 10)


def test_snapshot_can_ignore_receptions():
    loader = _make_loader(
        stocks={"C1": Stock("C1", stock_physique=10, stock_alloue=2, stock_bloque=0)},
        receptions={
            "C1": [
                Reception("PO-1", "C1", "F1", 5, date(2026, 4, 10)),
            ]
        },
    )
    kernel = AvailabilityKernel(loader)

    snap = kernel.snapshot("C1", date(2026, 4, 10), use_receptions=False)

    assert snap.available_without_receptions == 8.0
    assert snap.receptions_until_date == 0.0
    assert snap.available_at_date == 8.0


def test_shortage_considers_reserved_quantity():
    loader = _make_loader(
        stocks={"C1": Stock("C1", stock_physique=20, stock_alloue=0, stock_bloque=0)},
    )
    kernel = AvailabilityKernel(loader)

    shortage = kernel.shortage_at_date(
        "C1",
        quantity_needed=30,
        target_date=date(2026, 4, 10),
        use_receptions=False,
        reserved_quantity=4,
    )

    assert shortage == 6.0


def test_earliest_supply_coverage_returns_before_after_quantities():
    loader = _make_loader(
        stocks={"C1": Stock("C1", stock_physique=5, stock_alloue=0, stock_bloque=0)},
        receptions={
            "C1": [
                Reception("PO-1", "C1", "F1", 3, date(2026, 4, 10)),
                Reception("PO-2", "C1", "F1", 4, date(2026, 4, 12)),
            ]
        },
    )
    kernel = AvailabilityKernel(loader)

    coverage = kernel.earliest_supply_coverage("C1", quantity_needed=9)

    assert coverage is not None
    assert coverage.date == date(2026, 4, 12)
    assert coverage.available_before == 8.0
    assert coverage.available_after == 12.0


def test_available_without_receptions_uses_virtual_stock_state_when_provided():
    loader = _make_loader(
        stocks={"C1": Stock("C1", stock_physique=50, stock_alloue=0, stock_bloque=0)},
    )
    kernel = AvailabilityKernel(loader)
    state = StockState({"C1": 12.5})

    available = kernel.available_without_receptions("C1", stock_state=state)

    assert available == 12.5
