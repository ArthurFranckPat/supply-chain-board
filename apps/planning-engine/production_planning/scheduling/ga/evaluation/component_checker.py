"""Vérification des composants pour l'AG — deux stratégies.

Stratégie 1 (full) : délègue au RecursiveChecker existant.
Stratégie 2 (approximate) : vérifie via PrecomputedData.bom_flat + available_by_day,
sans récursion à chaque appel.

Le ApproximateChecker peut être plus permissif (faux positifs autorisés)
mais jamais plus restrictif (pas de faux négatifs).
"""

from __future__ import annotations

from typing import Any, Protocol

from production_planning.orders.allocation import StockState
from .precompute import PrecomputedData


class GAComponentChecker(Protocol):
    """Protocole pour les checkers de composants AG."""

    def evaluate(
        self,
        candidate: Any,
        day: Any,
        stock_state: StockState,
    ) -> tuple[bool, str, str]:
        """Évalue la faisabilité d'un OF à un jour donné.

        Returns:
            (feasible, reason, blocking_components_csv)
        """
        ...

    def reserve(
        self,
        candidate: Any,
        day: Any,
        stock_state: StockState,
    ) -> None:
        """Réserve virtuellement les composants consommés."""
        ...


class FullRecursiveChecker:
    """Délègue au RecursiveChecker existant. Stratégie 1 du doc §4.5."""

    def __init__(self, checker: Any):
        """Initialise le checker.

        Args:
            checker: RecursiveChecker existant du V1.
        """
        self.checker = checker

    def evaluate(
        self,
        candidate: Any,
        day: Any,
        stock_state: StockState,
    ) -> tuple[bool, str, str]:
        """Évalue via le RecursiveChecker._check_article_recursive.

        Args:
            candidate: CandidateOF à évaluer.
            day: Date de planification.
            stock_state: État de stock virtuel.

        Returns:
            (feasible, reason, blocking_components_csv)
        """
        from production_planning.feasibility.recursive import RecursiveChecker

        # Créer un checker runtime avec le stock_state
        runtime_checker = RecursiveChecker(
            self.checker.data_loader,
            use_receptions=True,
            check_date=day,
            stock_state=stock_state,
        )

        result = runtime_checker._check_article_recursive(
            article=candidate.article,
            qte_besoin=candidate.quantity,
            date_besoin=day,
            depth=0,
            of_parent_est_ferme=getattr(candidate, "statut_num", 3) == 1,
            num_of_parent=candidate.num_of,
        )

        feasible = result.feasible
        if feasible:
            return True, "", ""

        # Formater les composants manquants
        blocking = ", ".join(
            f"{art}({qty:.2f})"
            for art, qty in result.missing_components.items()
        )
        reason = f"Composants manquants: {blocking}"
        return False, reason, blocking

    def reserve(
        self,
        candidate: Any,
        day: Any,
        stock_state: StockState,
    ) -> None:
        """Réserve les composants via le mécanisme existant.

        Args:
            candidate: CandidateOF planifié.
            day: Date de planification.
            stock_state: État de stock virtuel.
        """
        from production_planning.scheduling.material import reserve_candidate_components
        reserve_candidate_components(
            self.checker.data_loader,
            self.checker,
            candidate,
            day,
            stock_state,
        )


class ApproximateChecker:
    """Vérifie via PrecomputedData sans récursion à chaque appel.

    Stratégie 2 du doc §4.5. Peut être plus permissif (faux positifs autorisés)
    mais jamais plus restrictif (pas de faux négatifs).
    """

    def __init__(self, precomputed: PrecomputedData):
        """Initialise le checker approximatif.

        Args:
            precomputed: Données pré-calculées (BOM aplatie + dispo).
        """
        self.precomputed = precomputed

    def evaluate(
        self,
        candidate: Any,
        day: Any,
        stock_state: StockState,
    ) -> tuple[bool, str, str]:
        """Vérifie la faisabilité via la BOM aplatie.

        Compare les composants requis avec la disponibilité cumulée
        jusqu'au jour de planification.

        Args:
            candidate: CandidateOF à évaluer.
            day: Date de planification.
            stock_state: État de stock virtuel (utilisé pour dispo réelle).

        Returns:
            (feasible, reason, blocking_components_csv)
        """
        bom = self.precomputed.bom_flat.get(candidate.num_of, {})
        if not bom:
            # Pas de BOM → toujours faisable
            return True, "", ""

        missing: list[str] = []
        for article, required_qty in bom.items():
            # Disponibilité via stock_state (plus précis que precomputed)
            available = stock_state.get_available(article)
            if available < required_qty:
                missing.append(f"{article}({required_qty - available:.2f})")

        if missing:
            blocking = ", ".join(missing)
            reason = f"Composants manquants: {blocking}"
            return False, reason, blocking

        return True, "", ""

    def reserve(
        self,
        candidate: Any,
        day: Any,
        stock_state: StockState,
    ) -> None:
        """Réserve les composants via le stock_state.

        Args:
            candidate: CandidateOF planifié.
            day: Date de planification (non utilisé par ApproximateChecker).
            stock_state: État de stock virtuel.
        """
        bom = self.precomputed.bom_flat.get(candidate.num_of, {})
        if not bom:
            return

        # Réserver uniquement les composants en rupture réelle
        scarce = {
            art: qty
            for art, qty in bom.items()
            if stock_state.get_available(art) < qty
        }
        if scarce:
            stock_state.allocate(candidate.num_of, scarce)
