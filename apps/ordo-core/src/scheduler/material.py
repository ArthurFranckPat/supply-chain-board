from collections import defaultdict
from datetime import date
from typing import Optional

from src.algorithms.allocation import StockState
from src.checkers.recursive import RecursiveChecker
from .calendar import previous_workday
from .models import CandidateOF


# We import BUFFER_THRESHOLDS from a central place, or pass it. 
# Let's pass it or define it in material.py if it relates to materials.
# Since it's about buffer stock, it can stay here or be passed.
BUFFER_THRESHOLDS = {
    "BDH2216AL": 673,
    "BDH2231AL": 598,
    "BDH2251AL": 598,
}


def build_material_stock_state(loader) -> StockState:
    """Initialise l'état de stock virtuel pour les composants."""
    initial_stock = {}
    for article, stock in loader.stocks.items():
        initial_stock[article] = stock.disponible()
    return StockState(initial_stock)


def build_receptions_by_day(loader) -> dict[date, list[tuple[str, int]]]:
    """Indexe les réceptions fournisseurs par jour."""
    receptions_by_day: dict[date, list[tuple[str, int]]] = defaultdict(list)
    for reception in loader.receptions:
        receptions_by_day[reception.date_reception_prevue].append(
            (reception.article, reception.quantite_restante)
        )
    return receptions_by_day


def apply_receptions_for_day(material_state: StockState, receptions_by_day, day: date) -> None:
    """Ajoute au stock virtuel les réceptions disponibles ce jour."""
    for article, quantity in receptions_by_day.get(day, []):
        material_state.add_supply(article, quantity)


def reserve_candidate_components(loader, checker, candidate, day: date, material_state: StockState) -> None:
    """Réserve virtuellement les composants consommés par un OF planifié.

    La réservation est limitée aux composants真正ement sous tension :
    uniquement les composants ACHAT dont le stock est inférieur à 2× le besoin.
    Les composants FABRICATION sont exclus (l'atelier peut les produire).
    """
    if _candidate_has_existing_allocations(loader, candidate):
        return

    allocations = _collect_component_reservations(
        loader,
        checker,
        candidate.article,
        candidate.quantity,
        day,
        material_state,
    )
    if allocations:
        # Ne réserver que les composants en rupture réelle : stock < 1× besoin
        scarce = {
            art: qty for art, qty in allocations.items()
            if material_state.get_available(art) < qty
        }
        if scarce:
            material_state.allocate(candidate.num_of, scarce)


def availability_status(checker, loader, candidate, day: date, material_state: Optional[StockState] = None) -> tuple[str, str]:
    date_j2 = previous_workday(day, 2)
    date_j1 = previous_workday(day, 1)
    date_j0 = day
    has_existing_allocations = _candidate_has_existing_allocations(loader, candidate)
    runtime_checker = (
        RecursiveChecker(
            loader,
            use_receptions=True,
            check_date=day,
            stock_state=material_state,
        )
        if material_state is not None
        else checker
    )

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

    stock = loader.get_stock(candidate.article)
    if stock and stock.disponible() >= candidate.quantity:
        return "tight", ""
    return "blocked", format_feasibility_cause(result)


def tracked_bdh_requirements(loader, article: str, quantity: int, seen: Optional[set[str]] = None) -> dict[str, float]:
    seen = seen or set()
    if article in seen:
        return {}
    seen.add(article)

    requirements: dict[str, float] = defaultdict(float)
    nomenclature = loader.get_nomenclature(article)
    if nomenclature is None:
        return {}

    for composant in nomenclature.composants:
        comp_qty = composant.qte_lien * quantity
        if composant.article_composant in BUFFER_THRESHOLDS:
            requirements[composant.article_composant] += comp_qty
        elif composant.is_fabrique():
            nested = tracked_bdh_requirements(
                loader,
                composant.article_composant,
                int(comp_qty),
                seen.copy(),
            )
            for nested_article, nested_qty in nested.items():
                requirements[nested_article] += nested_qty

    return dict(requirements)


def tracked_kanban_requirements(loader, article: str, quantity: int, kanban_articles: set[str], seen: Optional[set[str]] = None) -> dict[str, float]:
    """Recursively computes kanban component requirements for an article."""
    seen = seen or set()
    if article in seen:
        return {}
    seen.add(article)

    requirements: dict[str, float] = defaultdict(float)
    
    if article in kanban_articles:
        requirements[article] += quantity
        
    nomenclature = loader.get_nomenclature(article)
    if nomenclature is None:
        return requirements

    for composant in nomenclature.composants:
        comp_qty = composant.qte_lien * quantity
        if composant.article_composant in kanban_articles:
            requirements[composant.article_composant] += comp_qty
        else:
            nested = tracked_kanban_requirements(
                loader,
                composant.article_composant,
                int(comp_qty),
                kanban_articles,
                seen.copy(),
            )
            for nested_article, nested_qty in nested.items():
                requirements[nested_article] += nested_qty

    return dict(requirements)


def format_feasibility_cause(result) -> str:
    """Rend une cause métier lisible à partir du résultat du checker."""
    details: list[str] = []
    if getattr(result, 'missing_components', None):
        missing = ', '.join(
            f"{article} x{quantity}"
            for article, quantity in sorted(result.missing_components.items())
        )
        details.append(f"composants indisponibles: {missing}")
    if getattr(result, 'alerts', None):
        details.extend(result.alerts[:3])
    if not details:
        return "composants indisponibles"
    return ' | '.join(details)


def format_buffer_shortage_reason(requirements: dict[str, float], projected_buffer: dict[str, float]) -> str:
    """Explique quel stock tampon BDH manque réellement."""
    shortages = []
    for article, required_qty in sorted(requirements.items()):
        available_qty = projected_buffer.get(article, 0.0)
        if available_qty < required_qty:
            shortages.append(
                f"{article} besoin={round(required_qty, 3)} dispo={round(available_qty, 3)}"
            )
    if not shortages:
        return "stock tampon BDH insuffisant"
    return "stock tampon BDH insuffisant: " + ', '.join(shortages)


def _candidate_has_existing_allocations(loader, candidate: CandidateOF) -> bool:
    """Retourne True si l'OF possède déjà des allocations ERP."""
    return bool(loader.get_allocations_of(candidate.num_of))


def _collect_component_reservations(
    loader,
    checker,
    article: str,
    quantity: int,
    day: date,
    material_state: StockState,
    seen: Optional[set[str]] = None,
) -> dict[str, int]:
    seen = seen or set()
    if article in seen:
        return {}
    seen.add(article)

    nomenclature = loader.get_nomenclature(article)
    if nomenclature is None:
        return {}

    phantom_variant_exclusions = checker._get_phantom_sibling_variant_exclusions(nomenclature)
    allocations: dict[str, int] = defaultdict(int)
    for composant in nomenclature.composants:
        if composant.article_composant in phantom_variant_exclusions:
            continue

        qte_composant = int(composant.qte_lien * quantity)
        article_code = composant.article_composant

        if checker._is_component_treated_as_purchase(article_code, composant.is_achete(), composant.is_fabrique()):
            if checker._is_phantom_article(article_code):
                options = [(article_code, 1.0)] + [
                    option for option in checker._get_phantom_variants(article_code)
                    if option[0] != article_code
                ]
                for variant_article, qte_lien in options:
                    variant_qty = int(qte_lien * qte_composant)
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
