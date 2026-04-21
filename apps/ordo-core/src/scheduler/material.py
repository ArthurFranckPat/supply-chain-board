from collections import defaultdict
from datetime import date
from typing import Optional

from ..algorithms.allocation import StockState
from ..checkers.recursive import RecursiveChecker
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
            already = int(own_allocations.get(art, 0.0))
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
    # FERME OF (statut 1) : déjà lancé en production.
    # Les achats étaient validés à l'affermissement, les fabriqués manquants
    # ne bloquent pas (on lance des sous-OFs). Jamais bloqué.
    is_ferme = getattr(candidate, 'statut_num', 3) == 1
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
        stock = loader.get_stock(candidate.article)
        if stock and stock.disponible() >= candidate.quantity:
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
        comp_qty = composant.qte_requise(quantity)
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
        comp_qty = composant.qte_requise(quantity)
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


def extract_blocking_components(reason: str) -> str:
    """Extrait la liste des composants bloquants depuis une cause formatée."""
    if not reason:
        return ""

    for part in reason.split("|"):
        chunk = part.strip()
        if chunk.lower().startswith("composants indisponibles:"):
            return chunk.split(":", 1)[1].strip()
        if chunk.lower() == "composants indisponibles":
            return "non détaillé"
    return ""


def compute_direct_component_shortages(loader, candidate, material_state: Optional[StockState] = None) -> str:
    """Calcule les ruptures directes de la nomenclature du candidat."""
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
        required_qty = float(composant.qte_requise(int(candidate.quantity)))
        allocated_to_candidate = own_allocations_by_article.get(composant.article_composant, 0.0)
        # Si la réservation ERP couvre déjà le besoin de cet OF, on ne le marque pas en rupture.
        if allocated_to_candidate >= required_qty - 1e-9:
            continue

        if material_state is not None:
            available_qty = float(material_state.get_available(composant.article_composant))
        else:
            stock = loader.get_stock(composant.article_composant)
            available_qty = float(stock.disponible()) if stock is not None else 0.0

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

        qte_composant = composant.qte_requise(quantity)
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
