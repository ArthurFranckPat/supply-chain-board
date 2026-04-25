from datetime import date
from types import SimpleNamespace

from planning_engine.scheduling.models import CandidateOF
from planning_engine.scheduling.reporting import build_order_rows


def _commande(
    num_commande: str = "CMD-1",
    article: str = "A1",
    due_date: date = date(2026, 4, 20),
    quantity: int = 10,
):
    return SimpleNamespace(
        num_commande=num_commande,
        article=article,
        date_expedition_demandee=due_date,
        qte_restante=quantity,
    )


def _result(
    commande,
    *,
    allocations=None,
    primary_of=None,
    remaining_uncovered_qty: int = 0,
    alertes=None,
    matching_method: str = "NOR/MTO",
):
    return SimpleNamespace(
        commande=commande,
        of_allocations=allocations or [],
        of=primary_of,
        remaining_uncovered_qty=remaining_uncovered_qty,
        alertes=alertes or [],
        matching_method=matching_method,
    )


def _candidate(num_of: str, article: str = "A1", reason: str = "") -> CandidateOF:
    return CandidateOF(
        num_of=num_of,
        article=article,
        description=f"OF {num_of}",
        line="PP_830",
        due_date=date(2026, 4, 20),
        quantity=10.0,
        charge_hours=2.5,
        reason=reason,
    )


def test_build_order_rows_uses_alerts_for_uncovered_remainder():
    commande = _commande()
    result = _result(
        commande,
        remaining_uncovered_qty=4,
        alertes=["Rupture C1", "Capacité saturée"],
    )

    rows = build_order_rows(
        [result],
        planned_by_of={},
        candidate_by_of={},
        loader=object(),
        checker=object(),
        availability_status_fn=lambda *_args: ("tight", ""),
    )

    assert len(rows) == 1
    assert rows[0]["statut"] == "Non couverte"
    assert rows[0]["cause"] == "Rupture C1 | Capacité saturée"


def test_build_order_rows_marks_stock_complete_without_of():
    commande = _commande(num_commande="CMD-STOCK")
    result = _result(
        commande,
        primary_of=None,
        matching_method="NOR/MTO (stock complet)",
    )

    rows = build_order_rows(
        [result],
        planned_by_of={},
        candidate_by_of={},
        loader=object(),
        checker=object(),
        availability_status_fn=lambda *_args: ("tight", ""),
    )

    assert rows[0]["statut"] == "Servie sur stock"
    assert rows[0]["cause"] == "stock complet"


def test_build_order_rows_reuses_blocked_reason_for_late_order():
    due = date(2026, 4, 20)
    planned = date(2026, 4, 22)
    commande = _commande(num_commande="CMD-LATE", due_date=due)
    of = SimpleNamespace(num_of="OF-1", article="A1")
    allocation = SimpleNamespace(of=of)
    result = _result(commande, allocations=[allocation], primary_of=of)
    candidate = _candidate("OF-1")

    rows = build_order_rows(
        [result],
        planned_by_of={"OF-1": planned},
        candidate_by_of={"OF-1": candidate},
        loader=object(),
        checker=object(),
        availability_status_fn=lambda *_args: ("blocked", "composants indisponibles: C1 x2"),
    )

    assert rows[0]["statut"] == "Servie en retard"
    assert rows[0]["cause"] == "composants indisponibles: C1 x2"
