"""Évalue l'ordonnancement réel avec les mêmes KPIs que le scheduler algorithmique.

Lit les données de production réelle depuis "quantité produites par article.csv",
reconstruit le matching commande→OF, calcule charge via gammes, puis applique
les mêmes formules de score que src/scheduler/engine.py.
"""

import csv
import os
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

from src.loaders import DataLoader
from src.planning.charge_calculator import calculate_article_charge
from src.orders.matching import CommandeOFMatcher
from src.models.besoin_client import TypeCommande
from src.planning.calendar import build_workdays, next_workday
from src.planning.weights import load_weights


# ── Paramètres identiques au scheduler ──────────────────────────────
REFERENCE_DATE = date(2026, 3, 23)
PLANNING_WORKDAYS = 5
DEMAND_CALENDAR_DAYS = 15
WEEK_START = date(2026, 3, 23)
WEEK_END = date(2026, 3, 27)
REALITY_CSV = os.environ.get('ORDO_PRODUCTION_PROFILE', '')


# ── Data classes pour les résultats réels ────────────────────────────
@dataclass
class RealAssignment:
    """Un OF tel qu'il a été réellement produit."""
    article: str
    description: str
    poste_charge: str
    production_day: date
    quantity: float
    charge_hours: float = 0.0
    num_of: str = ""
    due_date: date | None = None
    scheduled_day: date | None = None  # alias pour production_day (API identique)


@dataclass
class RealDaySchedule:
    line: str
    day: date
    assignments: list[RealAssignment] = field(default_factory=list)

    @property
    def total_hours(self) -> float:
        return round(sum(a.charge_hours for a in self.assignments), 3)


# ── Chargement des données réelles ───────────────────────────────────
def load_real_production(csv_path: str = REALITY_CSV) -> list[RealAssignment]:
    """Charge les productions réelles de la semaine cible."""
    assignments: list[RealAssignment] = []
    p = Path(csv_path)
    if not p.exists():
        print(f"⚠️  Fichier introuvable : {csv_path}")
        return assignments

    with open(p, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            date_str = row.get("Date", "").strip()
            try:
                dt = datetime.strptime(date_str, "%d/%m/%Y").date()
            except ValueError:
                continue

            article = row.get("Article", "").strip()
            poste = row.get("Poste de charge", "").strip()
            desc = row.get("Description", "").strip()
            cols = list(row.values())
            try:
                qte = float(cols[7].replace(",", ".").strip())
            except (ValueError, IndexError):
                continue

            assignments.append(RealAssignment(
                article=article,
                description=desc,
                poste_charge=poste,
                production_day=dt,
                quantity=qte,
                scheduled_day=dt,  # Pour API identique
            ))
    return assignments


def filter_week(assignments: list[RealAssignment]) -> list[RealAssignment]:
    return [a for a in assignments if WEEK_START <= a.production_day <= WEEK_END]


# ── Calcul de charge via gammes (même logique que le scheduler) ──────
def compute_charge_hours(assignments: list[RealAssignment], loader) -> None:
    for a in assignments:
        charge_map = calculate_article_charge(a.article, int(a.quantity), loader)
        a.charge_hours = round(charge_map.get(a.poste_charge, 0.0), 3)


# ── Association OF réel → commande ───────────────────────────────────
def match_real_to_commands(
    real_by_article_day: dict[tuple[str, date], list[RealAssignment]],
    loader,
    workdays: list[date],
    demand_horizon_end: date,
) -> tuple[
    dict[str, date],               # of_num → production_day
    list,                           # matching_results
    dict[str, list[RealAssignment]],  # article → real assignments
]:
    """Utilise le même matcher que le scheduler pour associer les productions
    réelles aux commandes clients.

    Retourne :
    - real_planned_by_of : {num_of: production_day} — équivalent de planned_by_of
    - matching_results   : résultats du CommandeOFMatcher
    - real_by_article    : {article: [assignments]}
    """
    # Construire le même périmètre de commandes que le scheduler
    target_lines = _build_target_line_articles(loader)
    commandes = []
    for besoin in loader.commandes_clients:
        if besoin.qte_restante <= 0:
            continue
        if besoin.date_expedition_demandee > demand_horizon_end:
            continue
        if not _is_in_scope(besoin, loader, target_lines):
            continue
        if besoin.type_commande in (TypeCommande.MTS, TypeCommande.MTO):
            if not besoin.est_commande():
                continue
        elif besoin.type_commande == TypeCommande.NOR:
            if not (besoin.est_commande() or besoin.est_prevision()):
                continue
        commandes.append(besoin)

    commandes.sort(key=lambda b: (b.date_expedition_demandee, b.date_commande or date.max, b.num_commande))

    matcher = CommandeOFMatcher(loader, date_tolerance_days=30)
    matching_results = matcher.match_commandes(commandes)

    # Construire la map : of_num → date de production réelle
    real_by_article: dict[str, list[RealAssignment]] = defaultdict(list)
    for a_list in real_by_article_day.values():
        for a in a_list:
            real_by_article[a.article].append(a)

    real_planned_by_of: dict[str, date] = {}
    for result in matching_results:
        if result.of is None:
            continue
        of_article = result.of.article
        # Trouver la production réelle la plus proche de l'échéance
        candidates_real = real_by_article.get(of_article, [])
        if candidates_real:
            # Prendre le jour de production le plus tôt dans la semaine
            best = min(candidates_real, key=lambda x: x.production_day)
            real_planned_by_of[result.of.num_of] = best.production_day

    return real_planned_by_of, matching_results, real_by_article


def _build_target_line_articles(loader) -> dict[str, set[str]]:
    target_lines = {}
    lines_config = sorted(
        {op.poste_charge for gamme in loader.gammes.values() for op in gamme.operations}
    )
    for line in lines_config:
        target_lines[line] = set()
    for article, gamme in loader.gammes.items():
        for op in gamme.operations:
            if op.poste_charge in target_lines:
                target_lines[op.poste_charge].add(article)
    return target_lines


def _is_in_scope(besoin, loader, target_lines) -> bool:
    if any(besoin.article in articles for articles in target_lines.values()):
        return True
    if besoin.of_contremarque:
        linked_of = loader.get_of_by_num(besoin.of_contremarque)
        if linked_of and any(linked_of.article in articles for articles in target_lines.values()):
            return True
    return False


# ── KPIs — mêmes formules que engine.py ──────────────────────────────

def compute_service_rate(
    matching_results,
    planned_by_of: dict[str, date],
    evaluation_horizon_end: date,
) -> tuple[float, int, int]:
    """Taux de service = commandes servies à temps / total commandes dans l'horizon."""
    relevant = [
        r for r in matching_results
        if r.commande.date_expedition_demandee <= evaluation_horizon_end
    ]
    total = len(relevant)
    served = 0
    for r in relevant:
        if r.of is None:
            if "stock complet" in r.matching_method.lower():
                served += 1
            continue
        prod_day = planned_by_of.get(r.of.num_of)
        if prod_day and prod_day <= r.commande.date_expedition_demandee:
            served += 1
    return (served / total) if total else 0.0, served, total


def compute_open_rate(
    day_plans: dict[str, list[RealDaySchedule]],
) -> float:
    """Taux d'ouverture = heures planifiées / capacité des jours ouverts."""
    planned_hours = sum(
        plan.total_hours
        for plans in day_plans.values()
        for plan in plans
    )
    available_hours = sum(
        max(7.0, plan.total_hours)
        for plans in day_plans.values()
        for plan in plans
        if plan.total_hours > 0
    )
    return (planned_hours / available_hours) if available_hours else 0.0


def compute_deviations(
    assignments_by_line_day: dict[str, dict[date, list[RealAssignment]]],
) -> int:
    """Compte les deviations = OF produits alors qu'un OF plus urgent attend.

    Même logique que _mark_candidate_deviation : on marque une deviation
    quand un OF avec une due_date plus tardive est produit avant un OF
    plus urgent non produit.
    """
    deviations = 0
    # Pour chaque ligne, trier les OF produits par jour et vérifier l'ordre des due_dates
    for line, by_day in assignments_by_line_day.items():
        # Collecter tous les OF de la semaine avec leur due_date
        all_produced = []
        for day, assigns in by_day.items():
            for a in assigns:
                if a.due_date:
                    all_produced.append((day, a.due_date, a))
        # Non trivial à calculer sans les OF non produits — on utilise la même
        # logique simplifiée que le scheduler : deviation si production_day > due_date
        for day, due, a in all_produced:
            if day > due:
                deviations += 1
    return deviations


def compute_changements_serie(
    day_plans: dict[str, list[RealDaySchedule]],
) -> int:
    """Compte les changements de série (changement d'article entre 2 OF consécutifs)."""
    count = 0
    for plans in day_plans.values():
        for plan in plans:
            for i in range(1, len(plan.assignments)):
                if plan.assignments[i].article != plan.assignments[i - 1].article:
                    count += 1
    return count


def compute_jit_count(assignments: list[RealAssignment]) -> int:
    """Compte les OF produits le jour exact de l'échéance (Just-In-Time)."""
    return sum(1 for a in assignments if a.due_date and a.production_day == a.due_date)


# ── Enrichissement avec due_date ─────────────────────────────────────
def enrich_with_due_dates(
    assignments: list[RealAssignment],
    loader,
    workdays: list[date],
    demand_horizon_end: date,
) -> None:
    """Assigne la due_date à chaque production réelle via le matching commande→OF."""
    target_lines = _build_target_line_articles(loader)

    # Collecter les commandes dans l'horizon
    commandes = []
    for b in loader.commandes_clients:
        if b.qte_restante <= 0:
            continue
        if b.date_expedition_demandee > demand_horizon_end:
            continue
        if not _is_in_scope(b, loader, target_lines):
            continue
        if b.type_commande in (TypeCommande.MTS, TypeCommande.MTO):
            if not b.est_commande():
                continue
        elif b.type_commande == TypeCommande.NOR:
            if not (b.est_commande() or b.est_prevision()):
                continue
        commandes.append(b)

    # Pour chaque article, trouver la commande la plus proche
    article_due_dates: dict[str, date] = {}
    for b in commandes:
        art = b.article
        if art not in article_due_dates or b.date_expedition_demandee < article_due_dates[art]:
            article_due_dates[art] = b.date_expedition_demandee

    for a in assignments:
        if a.article in article_due_dates:
            a.due_date = article_due_dates[a.article]


def enrich_with_of_nums(
    assignments: list[RealAssignment],
    loader,
) -> None:
    """Assigne le num_of le plus probable via les OF existants."""
    for a in assignments:
        ofs = [
            o for o in loader.ofs
            if o.article == a.article and o.qte_restante > 0 and o.statut_num in (1, 2, 3)
        ]
        if ofs:
            # Prendre l'OF dont la quantité est la plus proche
            best = min(ofs, key=lambda o: abs(o.qte_restante - a.quantity))
            a.num_of = best.num_of


# ── Main ─────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("  ÉVALUATION DE L'ORDONNANCEMENT RÉEL")
    print(f"  Semaine {WEEK_START.strftime('%d/%m/%Y')} → {WEEK_END.strftime('%d/%m/%Y')}")
    print("=" * 70)

    # Charger les données
    loader = DataLoader.from_extractions()
    loader.load_all()
    print(f"✅ Données chargées : {len(loader.articles)} articles, {len(loader.ofs)} OF, {len(loader.commandes_clients)} commandes\n")

    # Charger la production réelle
    all_real = load_real_production()
    week_real = filter_week(all_real)
    print(f"📊 Productions réelles cette semaine : {len(week_real)} entrées")
    print(f"   Articles distincts : {len(set(a.article for a in week_real))}")
    print(f"   Postes actifs      : {len(set(a.poste_charge for a in week_real))}")
    print(f"   Quantité totale    : {sum(a.quantity for a in week_real):.0f}")

    # Calculer les charges via gammes
    compute_charge_hours(week_real, loader)
    week_real = [a for a in week_real if a.charge_hours > 0]
    print(f"   Entrées avec charge > 0 : {len(week_real)}")

    # Paramètres du scheduler
    workdays = build_workdays(REFERENCE_DATE, PLANNING_WORKDAYS)
    demand_horizon_end = REFERENCE_DATE + timedelta(days=DEMAND_CALENDAR_DAYS)
    planning_horizon_end = next_workday(workdays[-1])

    # Enrichir avec due_dates et num_of
    enrich_with_due_dates(week_real, loader, workdays, demand_horizon_end)
    enrich_with_of_nums(week_real, loader)

    # Construire day_plans (même structure que le scheduler)
    all_lines = sorted(set(a.poste_charge for a in week_real))
    day_plans: dict[str, list[RealDaySchedule]] = {}
    for line in all_lines:
        line_days = {}
        for a in week_real:
            if a.poste_charge == line:
                if a.production_day not in line_days:
                    line_days[a.production_day] = RealDaySchedule(line=line, day=a.production_day)
                line_days[a.production_day].assignments.append(a)
        if line_days:
            day_plans[line] = [line_days.get(d, RealDaySchedule(line=line, day=d)) for d in workdays if d in line_days]

    # Construire planned_by_of (réel)
    real_planned_by_of: dict[str, date] = {}
    for a in week_real:
        if a.num_of and a.production_day:
            real_planned_by_of[a.num_of] = a.production_day

    # Matching commande→OF pour le taux de service
    matcher = CommandeOFMatcher(loader, date_tolerance_days=30)
    target_lines = _build_target_line_articles(loader)

    commandes = []
    for b in loader.commandes_clients:
        if b.qte_restante <= 0:
            continue
        if b.date_expedition_demandee > demand_horizon_end:
            continue
        if not _is_in_scope(b, loader, target_lines):
            continue
        if b.type_commande in (TypeCommande.MTS, TypeCommande.MTO):
            if not b.est_commande():
                continue
        elif b.type_commande == TypeCommande.NOR:
            if not (b.est_commande() or b.est_prevision()):
                continue
        commandes.append(b)
    commandes.sort(key=lambda b: (b.date_expedition_demandee, b.date_commande or date.max, b.num_commande))
    matching_results = matcher.match_commandes(commandes)

    # ── Calcul des KPIs ──────────────────────────────────────────────
    weights = load_weights("config/weights.json")

    # Taux de service
    taux_service, served, total_cmd = compute_service_rate(
        matching_results, real_planned_by_of, planning_horizon_end,
    )

    # Taux d'ouverture
    taux_ouverture = compute_open_rate(day_plans)

    # Deviations
    assignments_by_line_day: dict[str, dict[date, list[RealAssignment]]] = defaultdict(lambda: defaultdict(list))
    for a in week_real:
        assignments_by_line_day[a.poste_charge][a.production_day].append(a)
    nb_deviations = compute_deviations(assignments_by_line_day)

    # Changements de série
    nb_changements_serie = compute_changements_serie(day_plans)

    # JIT
    nb_jit = compute_jit_count(week_real)

    # Score
    deviation_penalty = min(1.0, nb_deviations / max(1, len(week_real)))
    jit_penalty = min(1.0, nb_jit / max(1, len(week_real)))
    score = (
        taux_service * weights["w1"]
        + taux_ouverture * weights["w2"]
        - deviation_penalty * weights["w3"]
        - jit_penalty * weights.get("w4", 0.1)
    )

    # ── Affichage ────────────────────────────────────────────────────
    print(f"\n{'='*70}")
    print(f"  KPIs RÉELS")
    print(f"{'='*70}")
    print(f"  Taux de service  : {taux_service:.3f}  ({served}/{total_cmd} commandes servies)")
    print(f"  Taux d'ouverture : {taux_ouverture:.3f}")
    print(f"  Déviations       : {nb_deviations}")
    print(f"  JIT (jour=jour)  : {nb_jit}")
    print(f"  Changements série: {nb_changements_serie}")
    print(f"  SCORE            : {score:.3f}")

    # Heatmap poste × jour
    heatmap: dict[str, dict[date, float]] = defaultdict(lambda: defaultdict(float))
    jours_set: set[date] = set()
    for line, plans in day_plans.items():
        for plan in plans:
            for a in plan.assignments:
                heatmap[a.poste_charge][a.production_day] += a.charge_hours
                jours_set.add(a.production_day)

    jours = sorted(jours_set)
    lignes_actives = sorted(heatmap.keys())

    sep = "  " + "-" * (10 + len(jours) * 9 + 10)
    header = f"{'Poste':>10}"
    for j in jours:
        header += f"  {j.strftime('%d/%m'):>5}"
    header += f"  |{'Total':>7}"
    print(f"\n{header}")
    print(sep)
    for line in lignes_actives:
        row = f"{line:>10}"
        total_line = 0.0
        for j in jours:
            h = heatmap[line].get(j, 0.0)
            total_line += h
            row += "      -" if h == 0 else f"  {h:>5.1f}"
        row += f"  |{total_line:>6.1f}h"
        print(row)
    print(sep)
    row = f"{'TOTAL':>10}"
    grand_total = 0.0
    for j in jours:
        t = sum(heatmap[l].get(j, 0.0) for l in lignes_actives)
        row += f"  {t:>5.1f}"
        grand_total += t
    row += f"  |{grand_total:>6.1f}h"
    print(row)

    # ── Focus PP_830 ─────────────────────────────────────────────────
    pp830_assigns = [a for a in week_real if a.poste_charge == "PP_830"]
    if pp830_assigns:
        print(f"\n{'='*70}")
        print(f"  FOCUS PP_830 — Production réelle")
        print(f"{'='*70}")
        print(f"  {len(pp830_assigns)} OF, {sum(a.quantity for a in pp830_assigns):.0f} unités, "
              f"{sum(a.charge_hours for a in pp830_assigns):.1f}h")

        for j in jours:
            day_assigns = sorted(
                [a for a in pp830_assigns if a.production_day == j],
                key=lambda x: x.charge_hours,
                reverse=True,
            )
            if day_assigns:
                total_h = sum(a.charge_hours for a in day_assigns)
                total_q = sum(a.quantity for a in day_assigns)
                print(f"\n  {j.strftime('%d/%m')} — {len(day_assigns)} OF, {total_h:.1f}h, {total_q:.0f}u")
                for a in day_assigns:
                    due_str = a.due_date.strftime("%d/%m") if a.due_date else "?"
                    dev_mark = " ← RETARD" if a.due_date and a.production_day > a.due_date else ""
                    jit_mark = " ← JIT" if a.due_date and a.production_day == a.due_date else ""
                    print(f"    {a.article:<14} {a.quantity:>6.0f}u {a.charge_hours:>5.2f}h | due={due_str}{dev_mark}{jit_mark}")

    return {
        "score": round(score, 3),
        "taux_service": round(taux_service, 3),
        "taux_ouverture": round(taux_ouverture, 3),
        "nb_deviations": nb_deviations,
        "nb_jit": nb_jit,
        "nb_changements_serie": nb_changements_serie,
        "nb_of": len(week_real),
        "total_quantite": sum(a.quantity for a in week_real),
    }


if __name__ == "__main__":
    main()
