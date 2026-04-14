"""Construction des OF candidats pour le scheduler AUTORESEARCH."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from .bom_graph import TRACKED_BDH, BomGraph
from .models import CandidateOF


@dataclass(frozen=True)
class DemandMatch:
    """Reference de besoin client rattachee a un OF ou article."""

    due_date: date
    order_numbers: tuple[str, ...]
    quantity: int
    due_buckets: tuple[tuple[date, int], ...] = ()


def _build_demand_indexes(loader, horizon_end: date) -> tuple[dict[str, DemandMatch], dict[str, DemandMatch]]:
    by_of: dict[str, list] = defaultdict(list)
    by_article: dict[str, list] = defaultdict(list)

    for besoin in loader.commandes_clients:
        if not besoin.est_commande() or besoin.qte_restante <= 0:
            continue
        if besoin.date_expedition_demandee > horizon_end:
            continue
        by_article[besoin.article].append(besoin)
        if besoin.of_contremarque:
            by_of[besoin.of_contremarque].append(besoin)

    def collapse(entries: dict[str, list]) -> dict[str, DemandMatch]:
        collapsed: dict[str, DemandMatch] = {}
        for key, besoins in entries.items():
            sorted_besoins = sorted(besoins, key=lambda item: (item.date_expedition_demandee, item.num_commande))
            due = sorted_besoins[0].date_expedition_demandee
            numbers = tuple(item.num_commande for item in sorted_besoins)
            quantity = sum(item.qte_restante for item in sorted_besoins)
            due_buckets = tuple((item.date_expedition_demandee, item.qte_restante) for item in sorted_besoins)
            collapsed[key] = DemandMatch(
                due_date=due,
                order_numbers=numbers,
                quantity=quantity,
                due_buckets=due_buckets,
            )
        return collapsed

    return collapse(by_of), collapse(by_article)


def _make_candidate(loader, bom_graph: BomGraph, of, line: str, demand: DemandMatch | None, kind: str) -> CandidateOF | None:
    gamme = loader.get_gamme(of.article)
    if not gamme:
        return None

    charge_hours = gamme.calculate_hours(of.qte_restante, line)
    if charge_hours <= 0:
        return None

    tracked_bdh_qty = bom_graph.tracked_component_qty(of.article, of.qte_restante)
    return CandidateOF(
        num_of=of.num_of,
        article=of.article,
        description=of.description,
        line=line,
        due_date=demand.due_date if demand else of.date_fin,
        charge_hours=round(charge_hours, 3),
        quantity=of.qte_restante,
        tracked_bdh_qty=tracked_bdh_qty,
        related_orders=list(demand.order_numbers) if demand else [],
        kind=kind,
    )




def _coverage_due_date(demand: DemandMatch, covered_before: int, qty: int) -> date:
    """Retourne l'echeance du bloc de demande couvert par cet OF."""
    if not demand.due_buckets:
        return demand.due_date

    target = covered_before + qty
    cumulative = 0
    selected_due = demand.due_date
    for due_date, bucket_qty in demand.due_buckets:
        cumulative += bucket_qty
        selected_due = due_date
        if cumulative >= target:
            break
    return selected_due

def build_candidates(loader, bom_graph: BomGraph, horizon_end: date) -> list[CandidateOF]:
    """Construit les OF cibles PP_830 / PP_153 a planifier.

    Regle cle de bootstrap : on ne retient pas tous les OF d'un article demande.
    On ne garde que la couverture minimale necessaire pour satisfaire la demande
    sur l'horizon, plus les OF BDH de buffer potentiels sur PP_153.
    """
    demand_by_of, demand_by_article = _build_demand_indexes(loader, horizon_end)
    active_ofs = [of for of in loader.ofs if of.qte_restante > 0 and of.statut_num in (1, 2, 3)]

    by_article: dict[str, list] = defaultdict(list)
    by_num = {}
    for of in active_ofs:
        line = bom_graph.primary_line(of.article)
        if line is None:
            continue
        if of.date_fin > horizon_end and of.num_of not in demand_by_of:
            continue
        by_article[of.article].append((of, line))
        by_num[of.num_of] = (of, line)

    candidates: list[CandidateOF] = []
    selected_nums: set[str] = set()

    # 1. Couvrir d'abord les OF explicitement lies aux commandes MTS.
    for num_of, demand in demand_by_of.items():
        entry = by_num.get(num_of)
        if not entry:
            continue
        of, line = entry
        candidate = _make_candidate(loader, bom_graph, of, line, demand, kind="direct")
        if candidate is not None:
            candidates.append(candidate)
            selected_nums.add(num_of)

    # 2. Pour les commandes article-niveau, ne garder que le minimum d'OFs necessaires.
    for article, demand in demand_by_article.items():
        pool = []
        for of, line in by_article.get(article, []):
            if of.num_of in selected_nums:
                continue
            pool.append((of, line))

        if not pool:
            continue

        pool.sort(key=lambda item: (item[0].date_fin, 0 if item[0].is_ferme() else 1, item[0].num_of))
        covered_qty = 0
        for of, line in pool:
            due_for_slice = _coverage_due_date(demand, covered_qty, of.qte_restante)
            sliced_demand = DemandMatch(
                due_date=due_for_slice,
                order_numbers=demand.order_numbers,
                quantity=min(of.qte_restante, max(demand.quantity - covered_qty, 0)),
                due_buckets=demand.due_buckets,
            )
            candidate = _make_candidate(loader, bom_graph, of, line, sliced_demand, kind="direct")
            if candidate is None:
                continue
            candidates.append(candidate)
            selected_nums.add(of.num_of)
            covered_qty += of.qte_restante
            if covered_qty >= demand.quantity:
                break

    # 3. Ajouter les OF BDH sur PP_153 comme leviers de reconstitution tampon, sans en abuser.
    for tracked in TRACKED_BDH:
        pool = []
        for of, line in by_article.get(tracked, []):
            if line != "PP_153" or of.num_of in selected_nums:
                continue
            pool.append(of)
        pool.sort(key=lambda of: (of.date_fin, 0 if of.is_ferme() else 1, of.num_of))
        for of in pool[:8]:
            candidate = _make_candidate(loader, bom_graph, of, "PP_153", None, kind="buffer")
            if candidate is not None:
                candidates.append(candidate)
                selected_nums.add(of.num_of)

    candidates.sort(key=lambda item: (item.due_date, item.kind != "buffer", item.charge_hours, item.num_of))
    return candidates
