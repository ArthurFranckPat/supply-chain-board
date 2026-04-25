"""Feasibility analysis service.

Provides three core operations:
1. check() - Can we produce article X by date D?
2. promise_date() - What is the earliest feasible date?
3. reschedule() - What happens if we move this order?
"""

from __future__ import annotations

import logging
import time
from datetime import date, timedelta
from typing import Optional

from ..availability import AvailabilityKernel
from ..domain_rules import is_purchase_article
from ..planning.charge_calculator import calculate_article_charge
from ..planning.calendar_config import CalendarConfig, next_workday, is_workday
from ..planning.capacity_config import CapacityConfig
from .diagnostics import (
    alert_no_feasible_date,
    alert_order_line_not_found,
    alert_purchase_supply_insufficient,
)
from .feasibility_models import (
    AffectedOrder,
    BOMNode,
    CapacityImpact,
    ComponentDelta,
    ComponentGap,
    FeasibilityResultV2,
)
from .feasibility_simulation import SimulationContext

logger = logging.getLogger(__name__)


class FeasibilityService:
    """Feasibility analysis service.

    Parameters
    ----------
    loader : DataLoader
        Loaded ERP data
    calendar_config : CalendarConfig, optional
        Working day calendar (holidays, manual offs)
    capacity_config : CapacityConfig, optional
        Workstation capacity configuration
    """

    def __init__(
        self,
        loader,
        calendar_config: Optional[CalendarConfig] = None,
        capacity_config: Optional[CapacityConfig] = None,
    ):
        self.loader = loader
        self.availability = AvailabilityKernel(loader)
        self.calendar_config = calendar_config
        self.capacity_config = capacity_config

    def _make_simulation_context(self, reference_date: date) -> SimulationContext:
        """Create a simulation context bound to the current service settings."""
        return SimulationContext(
            self.loader,
            reference_date,
            self.calendar_config,
            self.capacity_config,
        )

    def _run_component_check(
        self,
        article: str,
        quantity: float,
        target_date: date,
        *,
        use_receptions: bool,
        reference_date: Optional[date] = None,
    ):
        """Run the recursive component check in a fresh simulation context."""
        ctx = self._make_simulation_context(reference_date or target_date)
        if use_receptions:
            ctx.apply_receptions_until(target_date)
        checker = ctx.create_checker(check_date=target_date, use_receptions=use_receptions)
        result = checker._check_article_recursive(
            article=article,
            qte_besoin=quantity,
            date_besoin=target_date,
            depth=0,
            of_parent_est_ferme=False,
            num_of_parent=None,
        )
        return ctx, checker, result

    # ── UC3: Check feasibility at a specific date ──────────────────────

    def check(
        self,
        article: str,
        quantity: int,
        desired_date: date,
        *,
        use_receptions: bool = True,
        check_capacity: bool = True,
        depth_mode: str = "full",
    ) -> FeasibilityResultV2:
        """Check if article+qty is producible by desired_date.

        Returns a FeasibilityResultV2 with component gaps, capacity impacts,
        and the actual feasible_date (which may differ from desired_date).
        """
        t0 = time.monotonic()
        art = self.loader.get_article(article)
        description = art.description if art else article

        # Articles ACHAT: no production needed, just check stock/receptions
        if is_purchase_article(art):
            return self._check_purchase_article(
                article, quantity, desired_date, description, t0, use_receptions=use_receptions
            )

        # ── Component check via RecursiveChecker ──
        ctx, _checker, component_result = self._run_component_check(
            article,
            quantity,
            desired_date,
            use_receptions=use_receptions,
            reference_date=date.today(),
        )

        # Enrich missing components
        component_gaps = self._enrich_component_gaps(
            component_result.missing_components, desired_date, use_receptions=use_receptions
        )

        # ── Build BOM tree ──
        bom_tree = self._build_bom_tree(article, quantity, desired_date, depth_mode, use_receptions=use_receptions)

        # ── Capacity check ──
        capacity_impacts: list[CapacityImpact] = []
        capacity_feasible = True
        if check_capacity and component_result.feasible:
            capacity_impacts, capacity_feasible = self._check_capacity(
                ctx, article, quantity, desired_date
            )

        feasible = component_result.feasible and capacity_feasible
        feasible_date = desired_date if feasible else None

        # If not feasible, try to find the earliest feasible date
        if not feasible:
            earliest = self._find_earliest_feasible_date(
                article, quantity, desired_date, max_horizon_days=60, use_receptions=use_receptions
            )
            if earliest is not None:
                feasible_date = earliest

        elapsed_ms = int((time.monotonic() - t0) * 1000)

        return FeasibilityResultV2(
            feasible=feasible,
            article=article,
            description=description,
            quantity=quantity,
            feasible_date=feasible_date.isoformat() if feasible_date else None,
            desired_date=desired_date.isoformat(),
            component_gaps=component_gaps,
            capacity_impacts=capacity_impacts,
            bom_tree=bom_tree,
            depth_mode=depth_mode,
            alerts=component_result.alerts,
            computation_ms=elapsed_ms,
        )

    # ── UC2: Find earliest feasible date ───────────────────────────────

    def promise_date(
        self,
        article: str,
        quantity: int,
        *,
        max_horizon_days: int = 60,
    ) -> FeasibilityResultV2:
        """Find the earliest feasible date for article+qty."""
        t0 = time.monotonic()
        art = self.loader.get_article(article)
        description = art.description if art else article

        # Articles ACHAT: answer is stock or next reception
        if is_purchase_article(art):
            return self._promise_date_purchase(article, quantity, description, t0)

        # Walk forward through workdays
        today = date.today()
        start = next_workday(today - timedelta(days=1), self.calendar_config)
        earliest = self._find_earliest_feasible_date(
            article, quantity, start, max_horizon_days=max_horizon_days
        )

        elapsed_ms = int((time.monotonic() - t0) * 1000)

        if earliest is None:
            return FeasibilityResultV2(
                feasible=False,
                article=article,
                description=description,
                quantity=quantity,
                feasible_date=None,
                alerts=[alert_no_feasible_date(max_horizon_days)],
                computation_ms=elapsed_ms,
            )

        # Run a full check at the found date for detailed results
        result = self.check(article, quantity, earliest)
        result.computation_ms = elapsed_ms
        return result

    # ── UC1: Reschedule an existing order ──────────────────────────────

    def reschedule(
        self,
        num_commande: str,
        article: str,
        new_date: date,
        *,
        new_quantity: Optional[int] = None,
        depth_mode: str = "full",
        use_receptions: bool = True,
    ) -> FeasibilityResultV2:
        """Simulate moving/changing an order and analyze component + capacity impacts."""
        t0 = time.monotonic()

        # Find the BesoinClient
        besoin = self._find_besoin(num_commande, article)
        if besoin is None:
            art = self.loader.get_article(article)
            return FeasibilityResultV2(
                feasible=False,
                article=article,
                description=art.description if art else article,
                quantity=0,
                alerts=[alert_order_line_not_found(num_commande, article)],
                computation_ms=int((time.monotonic() - t0) * 1000),
            )

        original_date = besoin.date_expedition_demandee
        original_quantity = besoin.qte_restante
        effective_quantity = new_quantity if new_quantity is not None else original_quantity

        # Run check at new params for components + capacity
        result = self.check(
            article, effective_quantity, new_date,
            use_receptions=use_receptions, depth_mode=depth_mode,
        )
        result.desired_date = new_date.isoformat()

        # Compute component deltas (before vs after)
        component_deltas = self._compute_component_deltas(
            article, original_quantity, original_date,
            effective_quantity, new_date, use_receptions=use_receptions,
        )
        result.component_deltas = component_deltas

        # Store original context
        result.original_date = original_date.isoformat() if original_date else None
        result.original_quantity = original_quantity
        result.quantity = effective_quantity

        # Analyze impact on other orders
        affected_orders = self._analyze_ripple_effect(
            article, effective_quantity, original_date, new_date
        )
        result.affected_orders = affected_orders

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        result.computation_ms = elapsed_ms
        return result

    # ── Article search ─────────────────────────────────────────────────

    def search_articles(self, query: str, limit: int = 20) -> list[dict]:
        """Search articles by code or description for autocomplete."""
        q = query.upper()
        results = []
        for code, art in self.loader.articles.items():
            if q in code.upper() or q in (art.description or "").upper():
                results.append({
                    "code": art.code,
                    "description": art.description,
                    "type_appro": art.type_appro,
                })
                if len(results) >= limit:
                    break
        return results

    def search_orders(self, query: str, limit: int = 30) -> list[dict]:
        """Search orders by num_commande or article.

        Returns matching BesoinClient lines with key info for selection.
        Only returns firm orders (COMMANDE nature) with remaining quantity > 0.
        """
        q = query.upper().strip()
        if not q:
            return []

        results = []
        seen = set()
        for besoin in self.loader.commandes_clients:
            if besoin.qte_restante <= 0:
                continue
            # Match by num_commande or article code or article description
            if not (q in besoin.num_commande.upper()
                    or q in besoin.article.upper()
                    or q in (besoin.description or "").upper()
                    or q in (besoin.nom_client or "").upper()):
                continue

            key = (besoin.num_commande, besoin.article)
            if key in seen:
                continue
            seen.add(key)

            results.append({
                "num_commande": besoin.num_commande,
                "article": besoin.article,
                "description": besoin.description,
                "client": besoin.nom_client,
                "type_commande": besoin.type_commande.value,
                "quantity": besoin.qte_restante,
                "quantity_ordered": besoin.qte_commandee,
                "quantity_allocated": besoin.qte_allouee,
                "date_expedition": besoin.date_expedition_demandee.isoformat() if besoin.date_expedition_demandee else None,
                "nature": besoin.nature_besoin.value,
                "categorie": besoin.categorie,
            })
            if len(results) >= limit:
                break
        return results

    # ── Private helpers ────────────────────────────────────────────────

    def _check_purchase_article(
        self, article: str, quantity: int, desired_date: date,
        description: str, t0: float,
        *,
        use_receptions: bool = True,
    ) -> FeasibilityResultV2:
        """Handle ACHAT articles: just stock + receptions, no capacity."""
        snapshot = self.availability.snapshot(
            article,
            desired_date,
            use_receptions=use_receptions,
        )
        total_available = snapshot.available_at_date
        earliest_reception = snapshot.earliest_reception
        gap = self.availability.net_shortage(quantity, total_available)
        feasible = gap == 0

        feasible_date = desired_date if feasible else None
        if not feasible and earliest_reception:
            feasible_date = self.availability.earliest_supply_date(article, quantity)

        component_gaps = []
        if gap > 0:
            component_gaps.append(ComponentGap(
                article=article,
                description=description,
                quantity_needed=quantity,
                quantity_available=total_available,
                quantity_gap=gap,
                earliest_reception=earliest_reception.isoformat() if earliest_reception else None,
                is_purchase=True,
            ))

        elapsed_ms = int((time.monotonic() - t0) * 1000)
        return FeasibilityResultV2(
            feasible=feasible,
            article=article,
            description=description,
            quantity=quantity,
            feasible_date=feasible_date.isoformat() if feasible_date else None,
            desired_date=desired_date.isoformat(),
            component_gaps=component_gaps,
            computation_ms=elapsed_ms,
        )

    def _promise_date_purchase(
        self, article: str, quantity: int, description: str, t0: float,
    ) -> FeasibilityResultV2:
        """Find earliest date for ACHAT article: stock or first sufficient reception."""
        stock_dispo = self.availability.available_without_receptions(article)

        if stock_dispo >= quantity:
            today = date.today()
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            return FeasibilityResultV2(
                feasible=True,
                article=article,
                description=description,
                quantity=quantity,
                feasible_date=today.isoformat(),
                computation_ms=elapsed_ms,
            )

        coverage = self.availability.earliest_supply_coverage(article, quantity)
        if coverage is not None:
            elapsed_ms = int((time.monotonic() - t0) * 1000)
            return FeasibilityResultV2(
                feasible=True,
                article=article,
                description=description,
                quantity=quantity,
                feasible_date=coverage.date.isoformat(),
                component_gaps=[ComponentGap(
                    article=article,
                    description=description,
                    quantity_needed=quantity,
                    quantity_available=coverage.available_before,
                    quantity_gap=max(0, quantity - coverage.available_before),
                    earliest_reception=coverage.date.isoformat(),
                    is_purchase=True,
                )],
                computation_ms=elapsed_ms,
            )

        # Not enough even with all receptions
        elapsed_ms = int((time.monotonic() - t0) * 1000)
        return FeasibilityResultV2(
            feasible=False,
            article=article,
            description=description,
            quantity=quantity,
            alerts=[alert_purchase_supply_insufficient()],
            computation_ms=elapsed_ms,
        )

    def _build_bom_tree(
        self,
        article: str,
        quantity: float,
        check_date: date,
        depth_mode: str = "full",
        use_receptions: bool = True,
        _depth: int = 0,
    ) -> list[BOMNode]:
        """Build the full BOM tree with stock status for each node."""
        nom = self.loader.get_nomenclature(article)
        if nom is None:
            return []

        nodes: list[BOMNode] = []
        for composant in nom.composants:
            comp_code = composant.article_composant
            qte = composant.qte_requise(quantity)

            # Stock info
            stock = self.loader.get_stock(comp_code)
            stock_dispo = self.availability.available_at_date(
                comp_code,
                check_date,
                use_receptions=use_receptions,
            )
            earliest_recv = self.availability.earliest_reception_date(comp_code)

            art = self.loader.get_article(comp_code)
            is_purchase = is_purchase_article(art) or composant.is_achete()

            gap = max(0, qte - stock_dispo)
            if stock is None:
                status = "no_stock_data"
            elif gap > 0:
                status = "shortage"
            else:
                status = "ok"

            node = BOMNode(
                article=comp_code,
                description=composant.designation_composant,
                is_purchase=is_purchase,
                quantity_needed=round(qte, 2),
                quantity_per_unit=composant.qte_lien,
                stock_available=round(stock_dispo, 2),
                stock_gap=round(gap, 2),
                status=status,
                earliest_reception=earliest_recv.isoformat() if earliest_recv else None,
            )

            # Recurse into fabricated sub-assemblies if full mode
            if not is_purchase and depth_mode == "full":
                node.children = self._build_bom_tree(
                    comp_code, qte,
                    check_date, depth_mode, use_receptions, _depth + 1,
                )

            nodes.append(node)

        return nodes

    def _enrich_component_gaps(
        self,
        missing_components: dict[str, float],
        desired_date: date,
        *,
        use_receptions: bool = True,
    ) -> list[ComponentGap]:
        """Enrich missing components with metadata."""
        gaps = []
        for article_code, qty_needed in missing_components.items():
            art = self.loader.get_article(article_code)
            available_qty = self.availability.available_at_date(
                article_code,
                desired_date,
                use_receptions=use_receptions,
            )
            earliest_recv = self.availability.earliest_reception_date(article_code)

            gaps.append(ComponentGap(
                article=article_code,
                description=art.description if art else article_code,
                quantity_needed=qty_needed,
                quantity_available=available_qty,
                quantity_gap=self.availability.net_shortage(qty_needed, available_qty),
                earliest_reception=earliest_recv.isoformat() if earliest_recv else None,
                is_purchase=is_purchase_article(art) or art is None,
            ))
        return gaps

    def _check_capacity(
        self, ctx: SimulationContext, article: str, quantity: int, desired_date: date,
    ) -> tuple[list[CapacityImpact], bool]:
        """Check capacity for article+qty finishing by desired_date.

        Returns (impacts, feasible).
        """
        charge_map = calculate_article_charge(article, quantity, self.loader)
        if not charge_map:
            return [], True

        impacts = []
        feasible = True
        production_day = desired_date

        # Find the production day (working backward from desired_date)
        if not ctx.is_workday(production_day):
            from ..planning.calendar_config import previous_workday as prev_wd
            production_day = prev_wd(production_day, 1, self.calendar_config)

        for poste, hours_required in charge_map.items():
            if self.capacity_config is None:
                continue

            # Get capacity config for label
            poste_cfg = self.capacity_config.postes.get(poste)
            poste_label = poste_cfg.label if poste_cfg else poste

            available = ctx.get_available_capacity(poste, production_day)
            remaining = max(0.0, available - hours_required)
            utilization = round((hours_required / max(available, 0.01)) * 100, 1) if available > 0 else 100.0

            impacts.append(CapacityImpact(
                poste_charge=poste,
                poste_label=poste_label,
                hours_required=round(hours_required, 2),
                hours_available=round(available, 2),
                hours_remaining=round(remaining, 2),
                utilization_pct=utilization,
            ))

            if hours_required > available:
                feasible = False

        return impacts, feasible

    def _find_earliest_feasible_date(
        self,
        article: str,
        quantity: int,
        start_date: date,
        max_horizon_days: int = 60,
        *,
        use_receptions: bool = True,
    ) -> Optional[date]:
        """Walk forward through workdays to find earliest feasible date."""
        ctx = self._make_simulation_context(start_date)

        candidate = start_date
        end_date = start_date + timedelta(days=max_horizon_days)

        while candidate <= end_date:
            if not is_workday(candidate, self.calendar_config):
                candidate += timedelta(days=1)
                continue

            # Apply receptions up to this day
            if use_receptions:
                ctx.apply_receptions_until(candidate)

            # Check components
            checker = ctx.create_checker(check_date=candidate, use_receptions=use_receptions)
            result = checker._check_article_recursive(
                article=article,
                qte_besoin=quantity,
                date_besoin=candidate,
                depth=0,
                of_parent_est_ferme=False,
                num_of_parent=None,
            )

            if result.feasible:
                # Check capacity
                _, cap_ok = self._check_capacity(ctx, article, quantity, candidate)
                if cap_ok:
                    return candidate

            # Skip-ahead optimization: jump to next reception date for missing components
            if use_receptions and result.missing_components:
                next_supply = self._earliest_supply_date(result.missing_components, ctx)
                if next_supply and next_supply > candidate:
                    candidate = next_supply
                    continue

            candidate = next_workday(candidate, self.calendar_config)

        return None

    def _earliest_supply_date(
        self, missing_components: dict[str, int], ctx: SimulationContext,
    ) -> Optional[date]:
        """Find the earliest date any missing component gets a reception."""
        _ = ctx  # kept for API compatibility with callers
        earliest: Optional[date] = None
        for article_code in missing_components:
            recv_date = self.availability.earliest_reception_date(article_code)
            if recv_date is not None and (earliest is None or recv_date < earliest):
                earliest = recv_date
        return earliest

    def _compute_component_deltas(
        self,
        article: str,
        original_qty: int,
        original_date: Optional[date],
        new_qty: int,
        new_date: date,
        *,
        use_receptions: bool = True,
    ) -> list[ComponentDelta]:
        """Compare component needs at original params vs new params.

        Runs RecursiveChecker at both sets of parameters, collects
        missing_components from each, and builds a delta comparison.
        """
        # Baseline: original date + quantity
        baseline_missing: dict[str, int] = {}
        if original_date is not None:
            try:
                _ctx_orig, _checker_orig, orig_result = self._run_component_check(
                    article,
                    original_qty,
                    original_date,
                    use_receptions=use_receptions,
                    reference_date=original_date,
                )
                baseline_missing = orig_result.missing_components
            except Exception as exc:
                logger.warning(
                    "Component check failed for baseline (article=%s, qty=%s, date=%s): %s",
                    article, original_qty, original_date, exc,
                )

        # Simulated: new date + quantity
        simulated_missing: dict[str, int] = {}
        try:
            _ctx_new, _checker_new, new_result = self._run_component_check(
                article,
                new_qty,
                new_date,
                use_receptions=use_receptions,
                reference_date=new_date,
            )
            simulated_missing = new_result.missing_components
        except Exception as exc:
            logger.warning(
                "Component check failed for simulated (article=%s, qty=%s, date=%s): %s",
                article, new_qty, new_date, exc,
            )

        # Build unified component set
        all_components = set(baseline_missing.keys()) | set(simulated_missing.keys())
        if not all_components:
            return []

        deltas: list[ComponentDelta] = []
        for comp_code in sorted(all_components):
            art = self.loader.get_article(comp_code)
            description = art.description if art else comp_code
            is_purchase = is_purchase_article(art) or art is None

            orig_needed = baseline_missing.get(comp_code, 0)
            sim_needed = simulated_missing.get(comp_code, 0)

            # Get stock/reception info for context
            available_qty = self.availability.available_at_date(
                comp_code,
                new_date,
                use_receptions=use_receptions,
            )
            earliest_recv = self.availability.earliest_reception_date(comp_code)

            orig_gap = self.availability.net_shortage(orig_needed, available_qty)
            sim_gap = self.availability.net_shortage(sim_needed, available_qty)
            delta_needed = sim_needed - orig_needed
            delta_gap = sim_gap - orig_gap

            # Determine status
            if orig_needed == 0 and sim_needed > 0:
                status = "new_gap"
            elif orig_needed > 0 and sim_needed == 0:
                status = "resolved"
            elif sim_gap > orig_gap:
                status = "worse"
            elif sim_gap < orig_gap:
                status = "better"
            else:
                status = "unchanged"

            deltas.append(ComponentDelta(
                article=comp_code,
                description=description,
                is_purchase=is_purchase,
                original_needed=orig_needed,
                original_available=available_qty,
                original_gap=orig_gap,
                simulated_needed=sim_needed,
                simulated_available=available_qty,
                simulated_gap=sim_gap,
                delta_needed=delta_needed,
                delta_gap=delta_gap,
                status=status,
                earliest_reception=earliest_recv.isoformat() if earliest_recv else None,
            ))

        return deltas

    def _find_besoin(self, num_commande: str, article: str):
        """Find a BesoinClient by num_commande and article."""
        for besoin in self.loader.commandes_clients:
            if besoin.num_commande == num_commande and besoin.article == article:
                return besoin
        return None

    def _analyze_ripple_effect(
        self, article: str, quantity: int,
        original_date: date, new_date: date,
    ) -> list[AffectedOrder]:
        """Identify orders affected by rescheduling.

        Finds OFs sharing the same workstations at the new date,
        checks if capacity would be exceeded, and identifies their client orders.
        """
        if self.capacity_config is None:
            return []

        charge_map = calculate_article_charge(article, quantity, self.loader)
        if not charge_map:
            return []

        # Index OFs by start date once to avoid O(n) scan per poste
        from collections import defaultdict
        ofs_by_start_date: dict[date, list] = defaultdict(list)
        for of in self.loader.ofs:
            if of.qte_restante > 0 and of.date_debut is not None:
                ofs_by_start_date[of.date_debut].append(of)

        affected: list[AffectedOrder] = []

        # Find the production day at the new date
        if not is_workday(new_date, self.calendar_config):
            prod_day = self._prev_workday(new_date)
        else:
            prod_day = new_date

        # Check each poste for overload
        for poste, hours_new in charge_map.items():
            poste_cfg = self.capacity_config.postes.get(poste)
            if poste_cfg is None:
                continue

            max_cap = poste_cfg.default_hours

            # Sum existing OF charge on that day/poste
            existing_hours = 0.0
            competing_ofs = []
            for of in ofs_by_start_date.get(prod_day, []):
                of_charge = calculate_article_charge(of.article, of.qte_restante, self.loader)
                if poste in of_charge:
                    existing_hours += of_charge[poste]
                    competing_ofs.append(of)

            # Would adding this production exceed capacity?
            if existing_hours + hours_new > max_cap:
                # Find client orders linked to competing OFs
                for of in competing_ofs:
                    for besoin in self.loader.commandes_clients:
                        if (
                            besoin.of_contremarque == of.num_of
                            or besoin.article == of.article
                        ) and besoin.qte_restante > 0:
                            affected.append(AffectedOrder(
                                num_commande=besoin.num_commande,
                                client=besoin.nom_client,
                                article=besoin.article,
                                quantity=besoin.qte_restante,
                                original_date=besoin.date_expedition_demandee.isoformat() if besoin.date_expedition_demandee else "",
                                impact="delayed",
                            ))

        # Deduplicate
        seen = set()
        unique = []
        for order in affected:
            key = (order.num_commande, order.article)
            if key not in seen:
                seen.add(key)
                unique.append(order)

        return unique

    def _prev_workday(self, day: date) -> date:
        """Get previous working day."""
        from ..planning.calendar_config import previous_workday as prev_wd
        return prev_wd(day, 1, self.calendar_config)
