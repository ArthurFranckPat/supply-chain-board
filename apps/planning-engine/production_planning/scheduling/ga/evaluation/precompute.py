"""Pré-calcul des structures partagées pour accélérer l'évaluation AG.

Calculé une seule fois par run :
- bom_flat : nomenclature aplatie (récursive) en composants ACHAT
- available_by_day : disponibilité cumulée par article et par jour
- charge_by_of : charge de chaque OF par ligne
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Any

from production_planning.orders.allocation import StockState


@dataclass
class PrecomputedData:
    """Structures pré-calculées pour l'évaluation AG."""

    # Pour chaque OF : {article_achat: qty_totale} (nomenclature aplatie)
    bom_flat: dict[str, dict[str, float]]

    # Pour chaque article ACHAT : {date: cum_qty} (stock initial + réceptions)
    available_by_day: dict[str, dict[date, float]]

    # Charge de chaque OF
    charge_by_of: dict[str, float]

    # Stock initial
    initial_stock: dict[str, float]

    # Réceptions par jour
    receptions_by_day: dict[date, list[tuple[str, float]]]


def _flatten_bom(
    loader: Any,
    article: str,
    quantity: float,
    depth: int = 0,
    max_depth: int = 10,
) -> dict[str, float]:
    """Aplatit récursivement une nomenclature en composants ACHAT.

    Args:
        loader: DataLoader.
        article: Article racine.
        quantity: Quantité demandée.
        depth: Profondeur courante (protection recursion).
        max_depth: Profondeur max.

    Returns:
        Dict {article_achat: quantité_totale}.
    """
    if depth >= max_depth:
        return {article: quantity}

    nomenclature = loader.get_nomenclature(article)
    if nomenclature is None or not nomenclature.composants:
        return {article: quantity}

    result: dict[str, float] = defaultdict(float)
    for composant in nomenclature.composants:
        child_article = composant.article_composant
        child_qty = composant.qte_requise(quantity)

        # Déterminer si c'est un composant achat ou fabriqué
        child_nom = loader.get_nomenclature(child_article)
        is_purchase = composant.is_achete() if hasattr(composant, "is_achete") else (child_nom is None or not child_nom.composants)

        if is_purchase:
            result[child_article] += child_qty
        else:
            # Recursion pour les fabriqués
            sub = _flatten_bom(loader, child_article, child_qty, depth + 1, max_depth)
            for art, qty in sub.items():
                result[art] += qty

    return dict(result)


def _build_available_by_day(
    initial_stock: dict[str, float],
    receptions_by_day: dict[date, list[tuple[str, float]]],
    workdays: list[date],
) -> dict[str, dict[date, float]]:
    """Construit la disponibilité cumulée par article et par jour.

    Args:
        initial_stock: Stock initial par article.
        receptions_by_day: Réceptions fournisseurs indexées par jour.
        workdays: Jours ouvrés de l'horizon.

    Returns:
        Dict {article: {day: cum_qty}}.
    """
    result: dict[str, dict[date, float]] = defaultdict(dict)
    all_articles = set(initial_stock.keys())
    for day_recs in receptions_by_day.values():
        for art, _ in day_recs:
            all_articles.add(art)

    for article in all_articles:
        cum = initial_stock.get(article, 0.0)
        for day in sorted(workdays):
            for rec_art, rec_qty in receptions_by_day.get(day, []):
                if rec_art == article:
                    cum += rec_qty
            result[article][day] = cum

    return dict(result)


def precompute(
    loader: Any,
    candidates: list[Any],
    workdays: list[date],
    receptions_by_day: dict[date, list[tuple[str, float]]],
    material_state: StockState | None = None,
) -> PrecomputedData:
    """Pré-calcule toutes les structures partagées pour un run AG.

    Args:
        loader: DataLoader.
        candidates: OF candidats.
        workdays: Jours ouvrés.
        receptions_by_day: Réceptions indexées par jour.
        material_state: État de stock virtuel (optionnel).

    Returns:
        PrecomputedData avec toutes les structures.
    """
    # Stock initial
    if material_state is not None:
        initial_stock = dict(material_state.initial_stock)
    else:
        from production_planning.availability import AvailabilityKernel
        availability = AvailabilityKernel(loader)
        initial_stock = {}
        for article in loader.stocks:
            initial_stock[article] = availability.available_without_receptions(article)

    # BOM aplatie pour chaque OF
    bom_flat: dict[str, dict[str, float]] = {}
    for candidate in candidates:
        bom_flat[candidate.num_of] = _flatten_bom(
            loader, candidate.article, candidate.quantity
        )

    # Disponibilité cumulée par jour
    available_by_day = _build_available_by_day(
        initial_stock, receptions_by_day, workdays
    )

    # Charge par OF
    charge_by_of = {c.num_of: c.charge_hours for c in candidates}

    return PrecomputedData(
        bom_flat=bom_flat,
        available_by_day=available_by_day,
        charge_by_of=charge_by_of,
        initial_stock=initial_stock,
        receptions_by_day=receptions_by_day,
    )
