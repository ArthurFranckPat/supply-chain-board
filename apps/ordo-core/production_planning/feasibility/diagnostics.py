"""Business-facing diagnostic messages for feasibility workflows."""


def alert_no_feasible_date(max_horizon_days: int) -> str:
    return f"Aucune date feasible trouvee dans {max_horizon_days} jours"


def alert_order_line_not_found(num_commande: str, article: str) -> str:
    return f"Commande {num_commande} / article {article} non trouvee"


def alert_purchase_supply_insufficient() -> str:
    return "Stock et receptions insuffisants meme a horizon max"
