from __future__ import annotations

from suivi_commandes.domain.models import OrderLine
from suivi_commandes.domain.models import RetardCause, CauseType
from suivi_commandes.domain.ports import StockProvider
from suivi_commandes.domain.ports import OfMatcher
from suivi_commandes.domain.ports import BomNavigator


def analyze_retard_cause(
    line: OrderLine,
    stock_provider: StockProvider,
    of_matcher: OfMatcher,
    bom_navigator: BomNavigator,
) -> RetardCause | None:
    """Analyse la cause d'un retard — retourne un objet structuré.

    Remplace l'ancienne get_retard_cause() qui retournait une string.
    L'appelant doit s'assurer que la ligne est en Retard Prod.
    """
    # Article acheté
    if not line.is_fabrique:
        dispo = stock_provider.get_available_stock(line.article)
        if dispo > 0:
            return RetardCause(
                type_cause=CauseType.STOCK_DISPONIBLE_NON_ALLOUE,
                message="Stock disponible — non alloué",
            )
        return RetardCause(
            type_cause=CauseType.ATTENTE_RECEPTION_FOURNISSEUR,
            message="Attente réception fournisseur",
        )

    # Article fabriqué → chercher l'OF
    of = of_matcher.find_matching_of(
        line.num_commande, line.article, line.type_commande
    )

    if of is None:
        return RetardCause(
            type_cause=CauseType.AUCUN_OF_PLANIFIE,
            message="Aucun OF planifié",
        )

    own_allocs = of_matcher.get_allocations(of.num_of)
    shortages = bom_navigator.get_component_shortages(
        line.article, line.qte_restante, own_allocs
    )

    # Filtrer epsilon
    shortages = {art: qty for art, qty in shortages.items() if qty > 0.001}

    if shortages:
        return RetardCause(
            type_cause=CauseType.RUPTURE_COMPOSANTS,
            composants=dict(shortages),
            message="",
        )

    return None
