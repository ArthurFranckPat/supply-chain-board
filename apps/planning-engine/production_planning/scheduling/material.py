from collections import defaultdict
from datetime import date
from typing import Optional

from ..availability import AvailabilityKernel
from ..domain_rules import is_firm_of_status
from ..orders.allocation import StockState
from ..feasibility.recursive import RecursiveChecker
from ..planning.calendar import previous_workday
from .buffer_config import BUFFER_THRESHOLDS
from .diagnostics import (
    extract_blocking_components as _extract_blocking_components,
    format_buffer_shortage_reason as _format_buffer_shortage_reason,
    format_feasibility_cause as _format_feasibility_cause,
)
from .models import CandidateOF


def build_material_stock_state(loader) -> StockState:
    """Initialise l'état de stock virtuel pour les composants."""
    availability = AvailabilityKernel(loader)
    initial_stock = {}
    for article in loader.stocks:
        initial_stock[article] = availability.available_without_receptions(article)
    return StockState(initial_stock)


def build_receptions_by_day(loader) -> dict[date, list[tuple[str, float]]]:
    """Indexe les réceptions fournisseurs par jour."""
    receptions_by_day: dict[date, list[tuple[str, float]]] = defaultdict(list)
    for reception in loader.receptions:
        receptions_by_day[reception.date_reception_prevue].append(
            (reception.article, float(reception.quantite_restante))
        )
    return receptions_by_day


def apply_receptions_for_day(material_state: StockState, receptions_by_day, day: date) -> None:
    """Ajoute au stock virtuel les réceptions disponibles ce jour."""
    for article, quantity in receptions_by_day.get(day, []):
        material_state.add_supply(article, quantity)


def reserve_candidate_components(loader, checker, candidate, day: date, material_state: StockState) -> None:
    """Réserve virtuellement les composants consommés par un OF planifié.

    REGLE METIER : si un composant est déjà alloué à cet OF dans l'ERP,
    il ne doit pas être réservé à nouveau. Seul le besoin net (besoin - déjà alloué)
    est réservé virtuellement. Cela s'applique composant par composant, pas
    de manière tout-ou-rien.
    """
    # Quantités déjà allouées dans l'ERP pour cet OF
    own_allocations: dict[str, float] = defaultdict(float)
    for allocation in loader.get_allocations_of(candidate.num_of):
        own_allocations[allocation.article] += float(allocation.qte_allouee)

    allocations = _collect_component_reservations(
        loader,
        checker,
        candidate.article,
        candidate.quantity,
        day,
        material_state,
    )
    if allocations:
        # Ne réserver que le besoin net (besoin total - déjà alloué ERP)
        net_allocations = {}
        for art, qty in allocations.items():
            already = float(own_allocations.get(art, 0.0))
            if qty > already:
                net_allocations[art] = qty - already

        # Ne réserver que les composants en rupture réelle : stock < 1× besoin
        scarce = {
            art: qty for art, qty in net_allocations.items()
            if material_state.get_available(art) < qty
        }
        if scarce:
            material_state.allocate(candidate.num_of, scarce)


def availability_status(
    checker,
    loader,
    candidate,
    day: date,
    material_state: Optional[StockState] = None,
    *,
    immediate_components: bool = False,
    immediate_reference_day: Optional[date] = None,
) -> tuple[str, str]:
    availability = AvailabilityKernel(loader)
    # FERME OF (statut 1) : déjà lancé en production.
    # Les achats étaient validés à l'affermissement, les fabriqués manquants
    # ne bloquent pas (on lance des sous-OFs). Jamais bloqué.
    is_ferme = is_firm_of_status(getattr(candidate, "statut_num", 3))
    if is_ferme:
        return "comfortable", ""

    date_j2 = previous_workday(day, 2)
    date_j1 = previous_workday(day, 1)
    date_j0 = day
    has_existing_allocations = _candidate_has_existing_allocations(loader, candidate)
    effective_check_day = immediate_reference_day or day if immediate_components else day
    runtime_checker = (
        RecursiveChecker(
            loader,
            use_receptions=not immediate_components,
            check_date=effective_check_day,
            stock_state=material_state,
        )
        if material_state is not None
        else checker
    )

    if immediate_components:
        immediate_day = immediate_reference_day or day
        result = runtime_checker._check_article_recursive(
            article=candidate.article,
            qte_besoin=candidate.quantity,
            date_besoin=immediate_day,
            depth=0,
            of_parent_est_ferme=has_existing_allocations,
            num_of_parent=candidate.num_of,
        )
        if result.feasible:
            return "tight", ""
        if availability.available_without_receptions(candidate.article) >= candidate.quantity:
            return "tight", ""
        return "blocked", format_feasibility_cause(result)

    for status, need_date in (
        ("comfortable", date_j2),
        ("comfortable", date_j1),
        ("tight", date_j0),
    ):
        result = runtime_checker._check_article_recursive(
            article=candidate.article,
            qte_besoin=candidate.quantity,
            date_besoin=need_date,
            depth=0,
            of_parent_est_ferme=has_existing_allocations,
            num_of_parent=candidate.num_of,
        )
        if result.feasible:
            return status, ""

    if availability.available_without_receptions(candidate.article) >= candidate.quantity:
        return "tight", ""
    return "blocked", format_feasibility_cause(result)


def tracked_bdh_requirements(loader, article: str, quantity: float, seen: Optional[set[str]] = None) -> dict[str, float]:
    return _collect_recursive_requirements(
        loader,
        article,
        quantity,
        seen=seen,
        tracked_articles=set(BUFFER_THRESHOLDS),
    )


def tracked_kanban_requirements(loader, article: str, quantity: float, kanban_articles: set[str], seen: Optional[set[str]] = None) -> dict[str, float]:
    """Recursively computes kanban component requirements for an article."""
    return _collect_recursive_requirements(
        loader,
        article,
        quantity,
        seen=seen,
        tracked_articles=kanban_articles,
        include_root=True,
    )


def format_feasibility_cause(result) -> str:
    """Rend une cause métier lisible à partir du résultat du checker."""
    return _format_feasibility_cause(result)


def extract_blocking_components(reason: str) -> str:
    """Extrait la liste des composants bloquants depuis une cause formatée."""
    return _extract_blocking_components(reason)


def compute_direct_component_shortages(loader, candidate, material_state: Optional[StockState] = None) -> str:
    """Calcule les ruptures directes de la nomenclature du candidat."""
    availability = AvailabilityKernel(loader)
    nomenclature = loader.get_nomenclature(candidate.article)
    if nomenclature is None:
        return ""

    # Réintègre les allocations déjà réservées à cet OF : elles sont comptées
    # dans STOCK_ALLOUE et doivent couvrir son besoin propre.
    own_allocations_by_article: dict[str, float] = defaultdict(float)
    for allocation in loader.get_allocations_of(candidate.num_of):
        own_allocations_by_article[allocation.article] += float(allocation.qte_allouee)

    shortages: list[tuple[str, float]] = []
    for composant in nomenclature.composants:
        required_qty = float(composant.qte_requise(candidate.quantity))
        allocated_to_candidate = own_allocations_by_article.get(composant.article_composant, 0.0)
        # Si la réservation ERP couvre déjà le besoin de cet OF, on ne le marque pas en rupture.
        if allocated_to_candidate >= required_qty - 1e-9:
            continue

        if material_state is not None:
            available_qty = float(material_state.get_available(composant.article_composant))
        else:
            available_qty = availability.available_without_receptions(
                composant.article_composant
            )

        free_pool_qty = max(0.0, available_qty)
        missing_qty = required_qty - allocated_to_candidate - free_pool_qty
        if missing_qty > 1e-9:
            shortages.append((composant.article_composant, missing_qty))

    if not shortages:
        return ""

    def _fmt_qty(value: float) -> str:
        rounded = round(value, 3)
        if abs(rounded - round(rounded)) < 1e-9:
            return str(int(round(rounded)))
        return str(rounded)

    return ", ".join(
        f"{article} x{_fmt_qty(missing)}"
        for article, missing in sorted(shortages)
    )


def format_buffer_shortage_reason(requirements: dict[str, float], projected_buffer: dict[str, float]) -> str:
    """Explique quel stock tampon BDH manque réellement."""
    return _format_buffer_shortage_reason(requirements, projected_buffer)


def _candidate_has_existing_allocations(loader, candidate: CandidateOF) -> bool:
    """Retourne True si l'OF possède déjà des allocations ERP."""
    return bool(loader.get_allocations_of(candidate.num_of))


def _collect_recursive_requirements(
    loader,
    article: str,
    quantity: float,
    *,
    tracked_articles: set[str],
    seen: Optional[set[str]] = None,
    include_root: bool = False,
) -> dict[str, float]:
    """Collect tracked component requirements through the recursive BOM."""
    seen = seen or set()
    if article in seen:
        return {}
    seen.add(article)

    requirements: dict[str, float] = defaultdict(float)
    if include_root and article in tracked_articles:
        requirements[article] += quantity

    nomenclature = loader.get_nomenclature(article)
    if nomenclature is None:
        return dict(requirements)

    for composant in nomenclature.composants:
        comp_qty = composant.qte_requise(quantity)
        child_article = composant.article_composant
        if child_article in tracked_articles:
            requirements[child_article] += comp_qty
            continue
        nested = _collect_recursive_requirements(
            loader,
            child_article,
            comp_qty,
            tracked_articles=tracked_articles,
            seen=seen.copy(),
        )
        for nested_article, nested_qty in nested.items():
            requirements[nested_article] += nested_qty

    return dict(requirements)


def _collect_component_reservations(
    loader,
    checker,
    article: str,
    quantity: float,
    day: date,
    material_state: StockState,
    seen: Optional[set[str]] = None,
) -> dict[str, float]:
    seen = seen or set()
    if article in seen:
        return {}
    seen.add(article)

    nomenclature = loader.get_nomenclature(article)
    if nomenclature is None:
        return {}

    phantom_variant_exclusions = checker.get_phantom_sibling_variant_exclusions(nomenclature)
    allocations: dict[str, float] = defaultdict(float)
    for composant in nomenclature.composants:
        if composant.article_composant in phantom_variant_exclusions:
            continue

        qte_composant = composant.qte_requise(quantity)
        article_code = composant.article_composant

        if checker._is_component_treated_as_purchase(article_code, composant.is_achete(), composant.is_fabrique()):
            if checker.is_phantom_article(article_code):
                options = [(article_code, 1.0)] + [
                    option for option in checker.get_phantom_variants(article_code)
                    if option[0] != article_code
                ]
                for variant_article, qte_lien in options:
                    variant_qty = qte_lien * qte_composant
                    if material_state.get_available(variant_article) >= variant_qty:
                        allocations[variant_article] += variant_qty
                        break
            else:
                allocations[article_code] += qte_composant
            continue

        if composant.is_fabrique():
            if material_state.get_available(article_code) >= qte_composant:
                allocations[article_code] += qte_composant
            else:
                nested = _collect_component_reservations(
                    loader,
                    checker,
                    article_code,
                    qte_composant,
                    day,
                    material_state,
                    seen.copy(),
                )
                for nested_article, nested_qty in nested.items():
                    allocations[nested_article] += nested_qty

    return dict(allocations)
