from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from typing import Optional

from .models import OrderLine, Status, TypeCommande
from .stock_port import StockProvider, StockBreakdown
from .cause import RetardCause

logger = logging.getLogger(__name__)


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


def assign_statuses(
    lines: list[OrderLine],
    stock_provider: StockProvider,
    reference_date: Optional[date] = None,
) -> list[StatusAssignment]:
    """Assigne un statut métier à chaque ligne de commande.

    Logique pure, sans pandas, sans dépendance au format SUIVCDE.

    Règles :
    - besoin_net <= 0                           → A Expédier
    - MTS fabriqué (pas d'allocation virtuelle) → Retard Prod si date passée et pas en zone expé, sinon RAS
      + signal CQ de statut basé sur la qté déjà allouée à la commande (pas sur un besoin virtuel).
    - MTS achat / MTO / NOR :
        - couvert par stock virtuel             → Allocation à faire
        - non couvert + date passée + pas zone  → Retard Prod
        - sinon                                 → RAS
    - Harmonisation front : RAS + alerte CQ     → Allocation à faire
      sauf pour MTS fabriqué (où l'allocation n'est pas le bon levier métier).
    """
    ref = reference_date or date.today()

    # Tri prioritaire pour l'allocation séquentielle
    def _sort_key(line: OrderLine) -> tuple:
        return (
            line.date_expedition or date.max,
            line.date_liv_prevue or date.max,
            line.num_commande,
        )

    sorted_lines = sorted(lines, key=_sort_key)

    # Stock virtuel par article (décomposé strict / CQ)
    stock_virtuel_strict: dict[str, float] = {}
    stock_virtuel_cq: dict[str, float] = {}

    def _default_breakdown(article: str) -> StockBreakdown:
        total = max(0.0, float(stock_provider.get_available_stock(article)))
        return StockBreakdown(
            available_total=total,
            available_strict=total,
            available_qc=0.0,
        )

    for line in sorted_lines:
        if line.article in stock_virtuel_strict:
            continue
        try:
            breakdown = stock_provider.get_stock_breakdown(line.article)
        except (AttributeError, NotImplementedError) as e:
            logger.debug(
                "[status-assign] StockProvider.get_stock_breakdown non implémenté pour article=%s, fallback : %s",
                line.article, e,
            )
            breakdown = _default_breakdown(line.article)

        strict = max(0.0, float(breakdown.available_strict))
        cq = max(0.0, float(breakdown.available_qc))
        total = max(0.0, float(breakdown.available_total))

        # Garde une décomposition cohérente avec le total allocable.
        strict = min(strict, total)
        cq = min(cq, total - strict)

        stock_virtuel_strict[line.article] = strict
        stock_virtuel_cq[line.article] = cq

    # Projection dédiée au signal front CQ (contrôle de statut), indépendante
    # de l'allocation réelle pour ne pas impacter les statuts existants.
    stock_signal_strict = dict(stock_virtuel_strict)
    stock_signal_cq = dict(stock_virtuel_cq)

    def _consume_for_cq_signal(article: str, quantity: float) -> tuple[float, float]:
        qty = max(0.0, float(quantity))
        strict_used = min(qty, stock_signal_strict.get(article, 0.0))
        stock_signal_strict[article] -= strict_used
        manque = qty - strict_used
        cq_used = min(manque, stock_signal_cq.get(article, 0.0))
        stock_signal_cq[article] -= cq_used
        return strict_used, cq_used

    assignments: list[StatusAssignment] = []

    for line in sorted_lines:
        besoin = line.besoin_net()

        # Signal CQ pour le front (contrôle statut).
        # Pour MTS fabriqué, on s'appuie uniquement sur l'allocation déjà portée
        # par la commande (qte_allouee) afin d'éviter de "ré-allouer" virtuellement
        # du stock déjà réservé à d'autres commandes du même article.
        if line.type_commande == TypeCommande.MTS and line.is_fabrique:
            qte_signal = min(max(0.0, float(line.qte_restante)), max(0.0, float(line.qte_allouee)))
        else:
            # - besoin > 0 : quantité à sécuriser pour couvrir le besoin net.
            # - besoin <= 0 : quantité déjà allouée à expédier.
            qte_signal = (
                besoin
                if besoin > 0
                else min(max(0.0, float(line.qte_restante)), max(0.0, float(line.qte_allouee)))
            )

        _, qte_signal_cq = _consume_for_cq_signal(line.article, qte_signal)

        if besoin <= 0:
            assignments.append(
                StatusAssignment(
                    line=line,
                    status=Status.A_EXPEDIER,
                    besoin_net=besoin,
                    alerte_cq_statut=qte_signal_cq > 0,
                )
            )
            continue

        # MTS fabriqué : pas d'allocation virtuelle, hard-pegging uniquement
        if line.type_commande == TypeCommande.MTS and line.is_fabrique:
            if line.is_retard(ref):
                status = Status.RETARD_PROD
            else:
                status = Status.RAS
            assignments.append(
                StatusAssignment(
                    line=line,
                    status=status,
                    besoin_net=besoin,
                    alerte_cq_statut=qte_signal_cq > 0,
                )
            )
            continue

        # MTS achat / MTO / NOR : allocation virtuelle
        qte_allouee_stricte = min(besoin, stock_virtuel_strict.get(line.article, 0.0))
        stock_virtuel_strict[line.article] -= qte_allouee_stricte

        manque_apres_strict = besoin - qte_allouee_stricte
        qte_allouee_cq = min(manque_apres_strict, stock_virtuel_cq.get(line.article, 0.0))
        stock_virtuel_cq[line.article] -= qte_allouee_cq

        qte_allouee_virt = qte_allouee_stricte + qte_allouee_cq
        couvert = qte_allouee_virt >= besoin

        if couvert:
            status = Status.ALLOCATION_A_FAIRE
        elif line.is_retard(ref):
            status = Status.RETARD_PROD
        else:
            status = Status.RAS

        if status == Status.RAS and qte_signal_cq > 0:
            status = Status.ALLOCATION_A_FAIRE

        assignments.append(
            StatusAssignment(
                line=line,
                status=status,
                besoin_net=besoin,
                qte_allouee_virtuelle=qte_allouee_virt,
                qte_allouee_virtuelle_stricte=qte_allouee_stricte,
                qte_allouee_virtuelle_cq=qte_allouee_cq,
                utilise_stock_sous_cq=qte_allouee_cq > 0,
                alerte_cq_statut=qte_signal_cq > 0,
            )
        )

    # Restaurer l'ordre original (par num_commande / article stable)
    # On trie par l'ordre d'entrée en utilisant l'identité des objets
    order_map = {id(line): i for i, line in enumerate(lines)}
    assignments.sort(key=lambda a: order_map.get(id(a.line), 0))

    return assignments
