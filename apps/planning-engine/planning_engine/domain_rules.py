"""Centralized business rules for production planning domain decisions."""

from __future__ import annotations

from typing import Any

from .models.besoin_client import BesoinClient, TypeCommande


def is_firm_of_status(statut_num: int | None) -> bool:
    """True when OF status corresponds to FERME."""
    return int(statut_num or 0) == 1


def is_plannable_of_status(statut_num: int | None) -> bool:
    """True when OF status can be considered by matching/scheduling."""
    return int(statut_num or 0) in (1, 2, 3)


def is_purchase_article(article: Any) -> bool:
    """True when article should be treated as ACHAT."""
    if article is None:
        return False
    is_achat = getattr(article, "is_achat", None)
    if callable(is_achat):
        return bool(is_achat())

    type_appro = str(getattr(article, "type_appro", "") or "").upper()
    return "ACHAT" in type_appro


def is_subcontracted_article(article: Any) -> bool:
    """True when article category indicates subcontracting."""
    categorie = str(getattr(article, "categorie", "") or "").upper()
    return categorie.startswith("ST")


def is_component_treated_as_purchase(
    article: Any,
    *,
    component_is_achete: bool,
    component_is_fabrique: bool,
) -> bool:
    """Decision rule for ACHAT-like component flow."""
    if is_purchase_article(article):
        return True
    if component_is_achete:
        return True
    if not component_is_fabrique:
        return False
    return is_subcontracted_article(article)


def should_include_besoin_for_scheduler(besoin: BesoinClient) -> bool:
    """Filter business demand scope by command type and need nature."""
    if besoin.type_commande in (TypeCommande.MTS, TypeCommande.MTO):
        return besoin.est_commande()
    if besoin.type_commande == TypeCommande.NOR:
        return besoin.est_commande() or besoin.est_prevision()
    return False


def order_priority_key(besoin: BesoinClient) -> tuple[int, object, object]:
    """Global demand priority key used by matching and scheduling."""
    return (
        0 if besoin.est_commande() else 1,
        besoin.date_expedition_demandee,
        besoin.date_commande or besoin.date_expedition_demandee,
    )
