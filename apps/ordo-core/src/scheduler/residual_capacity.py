"""
residual_capacity.py
Calcul de la capacite residuelle d'une journee en comparant
le run precedent avec l'etat actuel de l'ERP.
"""

from datetime import date
from typing import Optional


def compute_consumed_capacity(
    previous_run_id: str,
    reference_date: date,
    loader,
    db_module,
) -> dict[tuple[str, date], float]:
    """
    Compare les affectations du run precedent avec l'ERP actuel.

    Retourne {(line, day): heures_consommees} pour reference_date uniquement.
    Un OF est considere consomme si :
      - absent de l'ERP (supprime ou archive)
      - present avec qte_restante == 0
    """
    assignments = db_module.get_assignments_for_day(previous_run_id, reference_date)
    if not assignments:
        return {}

    consumed: dict[tuple[str, date], float] = {}

    for a in assignments:
        line = a["line"]
        charge_h = a["charge_h"] or 0.0
        num_of = a["num_of"]

        of = loader.get_of_by_num(num_of)
        if of is None or of.qte_restante <= 0:
            key = (line, reference_date)
            consumed[key] = consumed.get(key, 0.0) + charge_h

    return consumed
