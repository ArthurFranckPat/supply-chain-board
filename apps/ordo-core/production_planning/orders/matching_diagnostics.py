"""Diagnostic message helpers for commande/OF matching."""


def method_mts_hard_pegging() -> str:
    return "MTS hard pegging"


def alert_mts_missing_hard_pegging(article: str) -> str:
    return f"Commande MTS sans OF hard-peggé pour {article}"


def alert_mts_non_univoque(linked_count: int, num_commande: str) -> str:
    return (
        f"Hard pegging non univoque: {linked_count} OF liés trouvés pour {num_commande}"
    )


def alert_mts_partial_cover(of_num: str, allocated_qty: int, needed_qty: int) -> str:
    return (
        f"OF hard-peggé {of_num} couvre partiellement la commande: "
        f"{allocated_qty}/{needed_qty}"
    )


def method_nor_mto_stock_complete() -> str:
    return "NOR/MTO (stock complet)"


def method_purchase_article() -> str:
    return "Article acheté"


def alert_purchase_article_supply(stock_allocated: int, net_need: int) -> str:
    return (
        f"Article ACHAT - Stock alloué: {stock_allocated}, "
        f"Besoin net: {net_need} (approvisionnement requis)"
    )


def method_none() -> str:
    return "Aucun"


def alert_no_of_found(stock_allocated: int, net_need: int, article: str) -> str:
    return (
        f"Stock alloué: {stock_allocated}, "
        f"Besoin net: {net_need}, "
        f"Aucun OF trouvé (affermi ou suggéré) pour {article}"
    )


def method_nor_mto_cumulative(stock_allocated: int, of_details: str) -> str:
    return f"NOR/MTO cumulatif (stock: {stock_allocated} + OFs: {of_details})"


def alert_partial_of_coverage(allocated_qty: int, needed_qty: int, article: str) -> str:
    return (
        f"Couverture partielle OF: {allocated_qty}/{needed_qty} "
        f"pour {article}"
    )
