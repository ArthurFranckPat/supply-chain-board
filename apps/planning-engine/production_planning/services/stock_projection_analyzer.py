"""Projection d'evolution du stock article par article.

Integrates:
- Besoins clients (commandes + prévisions) as exits
- Réceptions fournisseurs confirmées as entries
- Productions OF (statut 1 Ferme + 3 Suggéré) as entries
- Simulated replenishment orders triggered by lot_eco threshold
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from collections import defaultdict
from typing import Optional

from ..loaders import DataLoader


@dataclass
class WeeklyEntry:
    """Une semaine de projection."""
    week_start: date          # Monday of the week
    week_label: str           # "S+1" or "13 avr."
    projected_stock: float    # Stock after all movements
    client_exits: float       # Total client need this week (qty positive = exit)
    supplier_receptions: float  # Confirmed supplier deliveries
    production_entries: float   # OF completions
    simulated_replenishment: float  # Simulated purchase orders triggered
    is_below_threshold: bool  # Stock below lot_eco threshold
    cumul_exits: float        # Cumulative exits for context


@dataclass
class ProjectionResult:
    """Resultat complet de projection pour un article."""
    article: str
    description: str
    stock_initial: float
    lot_eco: int
    lot_optimal: int
    delai_reappro_jours: int
    demande_hebdo: float
    threshold: float
    horizon_weeks: int
    weeks: list[WeeklyEntry]
    rupture_week: Optional[int]  # S+1-based week number where stock first goes negative


def _iso_week_monday(d: date) -> date:
    """Return Monday of the ISO week containing date d."""
    return d - timedelta(days=d.weekday())


def _week_label(week_start: date, today: date) -> str:
    """Label like 'S+1', 'S+3', or '13 avr.' for past/near weeks."""
    days_ahead = (week_start - today).days
    if 0 <= days_ahead < 7:
        return "S+1"
    elif 7 <= days_ahead < 14:
        return "S+2"
    elif 14 <= days_ahead < 21:
        return "S+3"
    elif 21 <= days_ahead < 28:
        return "S+4"
    else:
        return week_start.strftime("%d %b")


class StockProjectionService:
    """Calcule la projection de stock semaine par semaine."""

    def __init__(
        self,
        loader: DataLoader,
        horizon_weeks: int = 26,
    ) -> None:
        self._loader = loader
        self._horizon_weeks = horizon_weeks

    def project(
        self,
        article: str,
        stock_initial: float,
        lot_eco: int,
        lot_optimal: int,
        delai_reappro_jours: int,
        demande_hebdo: float,
    ) -> ProjectionResult:
        today = date.today()
        threshold = lot_eco * 0.3  # Trigger replenishment at 30% of lot_eco

        # --- Build weekly event maps ---
        weekly_client_exits: dict[date, float] = defaultdict(float)
        weekly_supplier_entries: dict[date, float] = defaultdict(float)
        weekly_production_entries: dict[date, float] = defaultdict(float)

        # Client needs (only future dates, only positive qty)
        for bc in self._loader.commandes_clients:
            if bc.article != article:
                continue
            if bc.qte_restante <= 0:
                continue
            d = bc.date_expedition_demandee
            if d is None or d < today:
                continue
            week_mon = _iso_week_monday(d)
            weekly_client_exits[week_mon] += float(bc.qte_restante)

        # Confirmed supplier receptions (only future dates, only positive qty)
        for rec in self._loader.get_receptions(article):
            if rec.quantite_restante <= 0:
                continue
            d = rec.date_reception_prevue
            if d is None or d < today:
                continue
            week_mon = _iso_week_monday(d)
            weekly_supplier_entries[week_mon] += float(rec.quantite_restante)

        # Production OF completions (only future dates, only positive qty)
        for of in self._loader.ofs:
            if of.article != article:
                continue
            if of.qte_restante <= 0:
                continue
            d = of.date_fin
            if d is None or d < today:
                continue
            week_mon = _iso_week_monday(d)
            weekly_production_entries[week_mon] += float(of.qte_restante)

        # --- Simulate week by week ---
        weeks: list[WeeklyEntry] = []
        current_stock = stock_initial
        rupture_week: Optional[int] = None
        cumul_exits = 0.0
        pending_replenishment: Optional[tuple[date, float]] = None  # (delivery_date, qty)

        for week_num in range(1, self._horizon_weeks + 1):
            week_start = today + timedelta(weeks=week_num - 1)
            week_start = _iso_week_monday(week_start)

            # Check if a simulated replenishment arrives this week
            replenishment_this_week = 0.0
            if pending_replenishment is not None:
                delivery_date, qty = pending_replenishment
                if week_start >= _iso_week_monday(delivery_date):
                    replenishment_this_week = qty
                    current_stock += qty
                    pending_replenishment = None

            # Add confirmed entries
            supplier_recv = weekly_supplier_entries.get(week_start, 0.0)
            production_in = weekly_production_entries.get(week_start, 0.0)
            current_stock += supplier_recv + production_in

            # Subtract client exits
            client_out = weekly_client_exits.get(week_start, 0.0)
            cumul_exits += client_out
            current_stock -= client_out

            # Check if we need to trigger a simulated replenishment
            if pending_replenishment is None and current_stock <= threshold and lot_optimal > 0:
                # Order now, arrives after lead time
                delivery_date = week_start + timedelta(days=delai_reappro_jours)
                pending_replenishment = (delivery_date, float(lot_optimal))

            is_below = current_stock < 0 or (current_stock < threshold and client_out > 0)
            if rupture_week is None and current_stock < 0:
                rupture_week = week_num

            weeks.append(WeeklyEntry(
                week_start=week_start,
                week_label=_week_label(week_start, today),
                projected_stock=round(current_stock, 2),
                client_exits=round(client_out, 2),
                supplier_receptions=round(supplier_recv, 2),
                production_entries=round(production_in, 2),
                simulated_replenishment=round(replenishment_this_week, 2),
                is_below_threshold=is_below,
                cumul_exits=round(cumul_exits, 2),
            ))

        article_obj = self._loader.get_article(article)
        desc = article_obj.description if article_obj else article

        return ProjectionResult(
            article=article,
            description=desc,
            stock_initial=stock_initial,
            lot_eco=lot_eco,
            lot_optimal=lot_optimal,
            delai_reappro_jours=delai_reappro_jours,
            demande_hebdo=demande_hebdo,
            threshold=threshold,
            horizon_weeks=self._horizon_weeks,
            weeks=weeks,
            rupture_week=rupture_week,
        )