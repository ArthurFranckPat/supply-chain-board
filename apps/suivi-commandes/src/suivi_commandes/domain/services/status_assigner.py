"""Assignation de statut métier aux lignes de commande.

Logique pure — sans pandas, sans dépendance ERP.

Règles :
- besoin_net <= 0                           → A Expédier
- MTS fabriqué (pas d'allocation virtuelle) → Retard Prod si date passée
                                              et pas en zone expé, sinon RAS
- MTS achat / MTO / NOR :
    - couvert par stock virtuel             → Allocation à faire
    - non couvert + date passée + pas zone  → Retard Prod
    - sinon                                 → RAS
- Harmonisation front : RAS + alerte CQ     → Allocation à faire
  sauf pour MTS fabriqué (où l'allocation n'est pas le bon levier métier).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from ..models import OrderLine, Status, TypeCommande
from ..ports import StockProvider, StockBreakdown
from ..models import RetardCause

logger = logging.getLogger(__name__)


# ── Résultat ─────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class StatusAssignment:
    """Résultat de l'assignation de statut pour une ligne de commande."""
    line: OrderLine
    status: Status
    besoin_net: float = 0.0
    qte_allouee_virtuelle: float = 0.0
    qte_allouee_virtuelle_stricte: float = 0.0
    qte_allouee_virtuelle_cq: float = 0.0
    utilise_stock_sous_cq: bool = False
    alerte_cq_statut: bool = False
    cause: RetardCause | None = None


# ── Pool de stock virtuel ────────────────────────────────────────────


@dataclass
class StockPools:
    """Budget de stock virtuel consommé ligne par ligne."""
    strict: dict[str, float] = field(default_factory=dict)
    cq: dict[str, float] = field(default_factory=dict)
    signal_strict: dict[str, float] = field(default_factory=dict)
    signal_cq: dict[str, float] = field(default_factory=dict)


# ── API publique ─────────────────────────────────────────────────────


def assign_statuses(
    lines: list[OrderLine],
    stock_provider: StockProvider,
    reference_date: Optional[date] = None,
) -> list[StatusAssignment]:
    ref = reference_date or date.today()
    sorted_lines = _sort_by_priority(lines)
    pools = _init_stock_pools(sorted_lines, stock_provider)

    assignments = [
        _assign_one_line(line, pools, ref)
        for line in sorted_lines
    ]

    return _restore_original_order(assignments, lines)


# ── Sous-services internes ───────────────────────────────────────────


def _sort_by_priority(lines: list[OrderLine]) -> list[OrderLine]:
    """Tri prioritaire pour l'allocation séquentielle (dates d'expédition d'abord)."""
    def _key(line: OrderLine) -> tuple:
        return (
            line.date_expedition or date.max,
            line.date_liv_prevue or date.max,
            line.num_commande,
        )
    return sorted(lines, key=_key)


def _init_stock_pools(
    lines: list[OrderLine],
    stock_provider: StockProvider,
) -> StockPools:
    """Initialise les pools de stock virtuel (strict + CQ) et leur projection signal."""
    pools = StockPools()

    for line in lines:
        if line.article in pools.strict:
            continue

        breakdown = _get_breakdown(line.article, stock_provider)
        strict = min(max(0.0, float(breakdown.available_strict)), max(0.0, float(breakdown.available_total)))
        cq = min(max(0.0, float(breakdown.available_qc)), max(0.0, float(breakdown.available_total)) - strict)

        pools.strict[line.article] = strict
        pools.cq[line.article] = cq
        pools.signal_strict[line.article] = strict
        pools.signal_cq[line.article] = cq

    return pools


def _get_breakdown(article: str, stock_provider: StockProvider) -> StockBreakdown:
    """Tente get_stock_breakdown, fallback sur un breakdown simplifié."""
    try:
        return stock_provider.get_stock_breakdown(article)
    except (AttributeError, NotImplementedError) as e:
        logger.debug(
            "[status-assign] get_stock_breakdown non implémenté pour article=%s, fallback : %s",
            article, e,
        )
        total = max(0.0, float(stock_provider.get_available_stock(article)))
        return StockBreakdown(available_total=total, available_strict=total, available_qc=0.0)


def _consume_signal(pools: StockPools, article: str, quantity: float) -> float:
    """Consomme le budget signal et retourne la part CQ utilisée."""
    qty = max(0.0, float(quantity))
    strict_used = min(qty, pools.signal_strict.get(article, 0.0))
    pools.signal_strict[article] = pools.signal_strict.get(article, 0.0) - strict_used
    manque = qty - strict_used
    cq_used = min(manque, pools.signal_cq.get(article, 0.0))
    pools.signal_cq[article] = pools.signal_cq.get(article, 0.0) - cq_used
    return cq_used


def _compute_signal_quantity(line: OrderLine, besoin: float) -> float:
    """Quantité à projeter dans le signal CQ."""
    if line.type_commande == TypeCommande.MTS and line.is_fabrique:
        # MTS fabriqué : s'appuie sur l'allocation déjà portée par la commande
        return min(max(0.0, float(line.qte_restante)), max(0.0, float(line.qte_allouee)))
    # Autres : besoin à sécuriser, ou quantité déjà allouée si besoin ≤ 0
    return besoin if besoin > 0 else min(max(0.0, float(line.qte_restante)), max(0.0, float(line.qte_allouee)))


def _assign_one_line(line: OrderLine, pools: StockPools, ref: date) -> StatusAssignment:
    """Assigne un statut à une ligne unique et consomme les pools de stock."""
    besoin = line.besoin_net()

    # Signal CQ (projection dédiée, indépendante de l'allocation réelle)
    qte_signal = _compute_signal_quantity(line, besoin)
    qte_signal_cq = _consume_signal(pools, line.article, qte_signal)

    # ── Cas 1 : rien à faire → A Expédier ──
    if besoin <= 0:
        return StatusAssignment(
            line=line, status=Status.A_EXPEDIER,
            besoin_net=besoin, alerte_cq_statut=qte_signal_cq > 0,
        )

    # ── Cas 2 : MTS fabriqué — pas d'allocation virtuelle ──
    if line.type_commande == TypeCommande.MTS and line.is_fabrique:
        return StatusAssignment(
            line=line,
            status=Status.RETARD_PROD if line.is_retard(ref) else Status.RAS,
            besoin_net=besoin, alerte_cq_statut=qte_signal_cq > 0,
        )

    # ── Cas 3 : MTS achat / MTO / NOR — allocation virtuelle ──
    qte_stricte = min(besoin, pools.strict.get(line.article, 0.0))
    pools.strict[line.article] -= qte_stricte

    manque = besoin - qte_stricte
    qte_cq = min(manque, pools.cq.get(line.article, 0.0))
    pools.cq[line.article] -= qte_cq

    qte_virt = qte_stricte + qte_cq
    couvert = qte_virt >= besoin

    if couvert:
        status = Status.ALLOCATION_A_FAIRE
    elif line.is_retard(ref):
        status = Status.RETARD_PROD
    else:
        status = Status.RAS

    # Harmonisation front : RAS + alerte CQ → Allocation à faire
    if status == Status.RAS and qte_signal_cq > 0:
        status = Status.ALLOCATION_A_FAIRE

    return StatusAssignment(
        line=line,
        status=status,
        besoin_net=besoin,
        qte_allouee_virtuelle=qte_virt,
        qte_allouee_virtuelle_stricte=qte_stricte,
        qte_allouee_virtuelle_cq=qte_cq,
        utilise_stock_sous_cq=qte_cq > 0,
        alerte_cq_statut=qte_signal_cq > 0,
    )


def _restore_original_order(
    assignments: list[StatusAssignment],
    original_lines: list[OrderLine],
) -> list[StatusAssignment]:
    """Restaure l'ordre d'entrée en utilisant l'identité des objets."""
    order_map = {id(line): i for i, line in enumerate(original_lines)}
    return sorted(assignments, key=lambda a: order_map.get(id(a.line), 0))
