"""Calcul des KPIs AUTORESEARCH."""

from __future__ import annotations

import json
from pathlib import Path

from .capacity import MAX_DAY_HOURS, TARGET_LINES, is_line_open
from .models import CandidateOF

DEFAULT_WEIGHTS = {
    "w1": 0.7,
    "w2": 0.2,
    "w3": 0.1,
}


def load_weights(path: str | Path) -> dict[str, float]:
    """Charge les poids et les renormalise si besoin."""
    file_path = Path(path)
    if not file_path.exists():
        return DEFAULT_WEIGHTS.copy()

    with file_path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    weights = {
        "w1": float(data.get("w1", DEFAULT_WEIGHTS["w1"])),
        "w2": float(data.get("w2", DEFAULT_WEIGHTS["w2"])),
        "w3": float(data.get("w3", DEFAULT_WEIGHTS["w3"])),
    }
    total = sum(weights.values())
    if total <= 0:
        return DEFAULT_WEIGHTS.copy()
    return {key: value / total for key, value in weights.items()}


from typing import List, Dict, Any
from collections import defaultdict

def compute_kpis(scheduled_ofs: List[Any], loader: Any = None) -> Dict[str, float]:
    """Calcule les KPIs du planning généré."""
    
    nb_total = len(scheduled_ofs)
    if nb_total == 0:
        return {"taux_service": 0.0, "taux_ouverture": 0.0, "nb_deviations": 0, "nb_jit": 0, "kanban_imbalance": 0}

    nb_en_retard = 0
    total_heures = 0.0
    nb_deviations = 0
    nb_jit = 0

    # Kanban Tracking pour KPI
    kanban_articles = {"11028877", "11033880", "1133919"}
    kanban_daily_conso = defaultdict(lambda: {a: 0.0 for a in kanban_articles})

    for of in scheduled_ofs:
        # Un OF bloque rupture n'est pas reellement realise -> exclure des KPIs
        if getattr(of, 'blocking_components', ''):
            continue
        # Taux de service
        if of.scheduled_day and of.scheduled_day > of.due_date:
            nb_en_retard += 1
            
        # Just-in-Time
        if of.scheduled_day and of.scheduled_day == of.due_date:
            nb_jit += 1
            
        # Taux d'ouverture
        total_heures += of.charge_hours
        
        # Déviations
        if of.deviations > 0:
            nb_deviations += 1
            
        # Conso Kanban
        if of.scheduled_day and loader:
            cand_nom = loader.get_nomenclature(of.article)
            if cand_nom:
                for comp in cand_nom.composants:
                    if comp.article_composant in kanban_articles:
                        kanban_daily_conso[of.scheduled_day][comp.article_composant] += comp.qte_requise(of.quantity)

    taux_service = 1.0 - (nb_en_retard / nb_total)
    
    # Calcul du taux d'ouverture machine sur 5 jours
    heures_dispo = 5 * 14.0 * 2  # 5 jours * 14h * 2 lignes
    taux_ouverture = total_heures / heures_dispo
    
    # Calcul de l'imbalance Kanban
    kanban_imbalance = 0
    for day, consos in kanban_daily_conso.items():
        vals = list(consos.values())
        if sum(vals) > 0:
            # On calcule l'écart-type simplifié ou la différence max-min
            diff = max(vals) - min(vals)
            if diff > 500:  # Si la différence dépasse 500 pièces par jour
                kanban_imbalance += diff / 1000.0

    return {
        "taux_service": round(taux_service, 3),
        "taux_ouverture": round(taux_ouverture, 3),
        "nb_deviations": nb_deviations,
        "nb_jit": nb_jit,
        "kanban_imbalance": round(kanban_imbalance, 3)
    }

def compute_score(kpis: Dict[str, float], weights: Dict[str, float] = None) -> float:
    """Calcule le score global d'un planning pour l'Autoresearch."""
    if weights is None:
        weights = {"w1": 0.85, "w2": 0.1, "w3": 0.05, "w4": 0.1, "w5": 0.05}
        
    w1 = weights.get("w1", 0.85) # Taux de service
    w2 = weights.get("w2", 0.1)  # Taux ouverture
    w3 = weights.get("w3", 0.05) # Pénalité déviations
    w4 = weights.get("w4", 0.1)  # Pénalité Just-in-Time
    w5 = weights.get("w5", 0.05) # Pénalité Kanban imbalance
    
    score = (w1 * kpis["taux_service"]) + (w2 * kpis["taux_ouverture"])
    
    # Pénalités (plus il y en a, plus ça baisse le score)
    penalty = (kpis["nb_deviations"] * w3) + (kpis["nb_jit"] * w4) + (kpis["kanban_imbalance"] * w5)
    
    return round(score - penalty, 3)
