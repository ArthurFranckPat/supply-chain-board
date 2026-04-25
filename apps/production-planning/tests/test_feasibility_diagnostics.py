from production_planning.feasibility.diagnostics import (
    alert_no_feasible_date,
    alert_order_line_not_found,
    alert_purchase_supply_insufficient,
)


def test_alert_no_feasible_date():
    assert alert_no_feasible_date(60) == "Aucune date feasible trouvee dans 60 jours"


def test_alert_order_line_not_found():
    assert (
        alert_order_line_not_found("CMD-1", "ART-42")
        == "Commande CMD-1 / article ART-42 non trouvee"
    )


def test_alert_purchase_supply_insufficient():
    assert alert_purchase_supply_insufficient() == "Stock et receptions insuffisants meme a horizon max"
