"""Outil 4 : Simulation d'impact sur la charge hebdomadaire.

Simule l'ajout ou le retrait d'OFs sur la charge sans modifier
l'état réel des données. Retourne le delta de charge par poste et par semaine.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional

from ...loaders.data_loader import DataLoader
from ...algorithms.charge_calculator import (
    calculate_weekly_charge_heatmap,
    calculate_article_charge,
    get_week_info,
)

# Capacité nominale par défaut (35h/semaine)
CAPACITE_NOMINALE_DEFAULT = 35.0
SEUIL_SATURE = 1.00
SEUIL_TENSION = 0.85


@dataclass
class SimulationResult:
    """Résultat d'une simulation de charge.

    Attributes
    ----------
    baseline : Dict[str, Dict[str, float]]
        Charge actuelle par poste → semaine → heures
    simulated : Dict[str, Dict[str, float]]
        Charge simulée (après ajout des OFs) par poste → semaine → heures
    delta : Dict[str, Dict[str, float]]
        Différence simulée - baseline par poste → semaine → heures
    ofs_simules : List[str]
        Numéros des OFs ajoutés à la simulation
    bottlenecks_created : List[str]
        Postes qui passent en saturation (>= 100%) suite à la simulation
    bottlenecks_resolved : List[str]
        Postes qui sortent de sous-charge suite à la simulation
    recommendation : str
        Synthèse textuelle de l'impact
    """

    baseline: Dict[str, Dict[str, float]]
    simulated: Dict[str, Dict[str, float]]
    delta: Dict[str, Dict[str, float]]
    ofs_simules: List[str]
    bottlenecks_created: List[str] = field(default_factory=list)
    bottlenecks_resolved: List[str] = field(default_factory=list)
    recommendation: str = ""


def simulate_schedule_impact(
    loader: DataLoader,
    of_nums: List[str],
    reference_date: date = None,
    num_weeks: int = 4,
    capacite_par_poste: Optional[Dict[str, float]] = None,
    capacite_defaut: float = CAPACITE_NOMINALE_DEFAULT,
) -> SimulationResult:
    """Simule l'impact de l'ajout d'OFs sur la charge hebdomadaire.

    Ne modifie pas les données réelles — calcule uniquement un scénario.

    Parameters
    ----------
    loader : DataLoader
        DataLoader avec accès aux données
    of_nums : List[str]
        Numéros des OFs à simuler (doivent exister dans loader.ofs)
    reference_date : date, optional
        Date de référence (défaut : aujourd'hui)
    num_weeks : int
        Nombre de semaines de la heatmap (défaut : 4)
    capacite_par_poste : Dict[str, float], optional
        Capacité nominale en heures par poste
    capacite_defaut : float
        Capacité nominale par défaut si poste absent du dictionnaire

    Returns
    -------
    SimulationResult
        Baseline, simulation, delta et recommandation
    """
    if reference_date is None:
        reference_date = date.today()
    if capacite_par_poste is None:
        capacite_par_poste = {}

    # --- Baseline : heatmap actuelle ---
    besoins = [b for b in loader.commandes_clients if b.qte_restante > 0]
    heatmap = calculate_weekly_charge_heatmap(besoins, loader, num_weeks)

    baseline: Dict[str, Dict[str, float]] = {}
    for poste_data in heatmap:
        baseline[poste_data.poste_charge] = dict(poste_data.charges)

    # --- Charge additionnelle des OFs simulés ---
    additional: Dict[str, Dict[str, float]] = {}  # poste → semaine → heures

    ofs_simules_trouves: List[str] = []
    for num_of in of_nums:
        of = loader.get_of_by_num(num_of)
        if of is None or of.qte_restante <= 0:
            continue
        ofs_simules_trouves.append(num_of)

        charge = calculate_article_charge(of.article, of.qte_restante, loader)
        week_info = get_week_info(of.date_fin, reference_date)
        semaine = week_info["week_label"]

        for poste, heures in charge.items():
            additional.setdefault(poste, {})
            additional[poste][semaine] = additional[poste].get(semaine, 0.0) + heures

    # --- Calcul de la simulation = baseline + additional ---
    all_postes = set(baseline.keys()) | set(additional.keys())
    all_semaines: set[str] = set()
    for charges in baseline.values():
        all_semaines.update(charges.keys())
    for charges in additional.values():
        all_semaines.update(charges.keys())

    simulated: Dict[str, Dict[str, float]] = {}
    delta: Dict[str, Dict[str, float]] = {}

    for poste in all_postes:
        simulated[poste] = {}
        delta[poste] = {}
        for semaine in all_semaines:
            base_h = baseline.get(poste, {}).get(semaine, 0.0)
            add_h = additional.get(poste, {}).get(semaine, 0.0)
            sim_h = base_h + add_h
            simulated[poste][semaine] = round(sim_h, 2)
            delta[poste][semaine] = round(add_h, 2)

    # --- Analyser les changements de statut ---
    bottlenecks_created: List[str] = []
    bottlenecks_resolved: List[str] = []

    for poste in all_postes:
        cap = capacite_par_poste.get(poste, capacite_defaut)
        for semaine in all_semaines:
            base_h = baseline.get(poste, {}).get(semaine, 0.0)
            sim_h = simulated[poste].get(semaine, 0.0)
            base_taux = base_h / cap if cap > 0 else 0
            sim_taux = sim_h / cap if cap > 0 else 0

            key = f"{poste}/{semaine}"
            if base_taux < SEUIL_SATURE <= sim_taux:
                bottlenecks_created.append(key)
            if base_taux < 0.60 and sim_taux >= 0.60:
                bottlenecks_resolved.append(key)

    recommendation = _build_recommendation(
        ofs_simules_trouves, of_nums, additional, bottlenecks_created, bottlenecks_resolved
    )

    return SimulationResult(
        baseline=baseline,
        simulated=simulated,
        delta=delta,
        ofs_simules=ofs_simules_trouves,
        bottlenecks_created=bottlenecks_created,
        bottlenecks_resolved=bottlenecks_resolved,
        recommendation=recommendation,
    )


def _build_recommendation(
    ofs_trouves: List[str],
    ofs_demandes: List[str],
    additional: Dict[str, Dict[str, float]],
    created: List[str],
    resolved: List[str],
) -> str:
    lines = []

    ofs_manquants = set(ofs_demandes) - set(ofs_trouves)
    if ofs_manquants:
        lines.append(f"OFs introuvables ou sans quantité restante : {', '.join(ofs_manquants)}")

    total_heures = sum(
        h for semaines in additional.values() for h in semaines.values()
    )
    lines.append(f"Charge additionnelle : {round(total_heures, 1)}h répartie sur {len(additional)} poste(s).")

    if created:
        lines.append(f"Attention — {len(created)} poste(s)/semaine passeraient en saturation : {', '.join(created[:5])}")
    if resolved:
        lines.append(f"Positif — {len(resolved)} poste(s)/semaine sortiraient de sous-charge : {', '.join(resolved[:5])}")
    if not created and not resolved:
        lines.append("Aucun changement de statut de poste détecté.")

    return " ".join(lines)
