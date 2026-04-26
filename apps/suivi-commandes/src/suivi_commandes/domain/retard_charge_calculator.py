from __future__ import annotations

from collections import defaultdict

from suivi_commandes.domain.models import Status
from suivi_commandes.domain.status_assigner import StatusAssignment
from suivi_commandes.domain.cause import CauseType
from suivi_commandes.domain.bom_port import BomNavigator
from suivi_commandes.domain.charge_port import ChargeCalculatorPort


def compute_retard_charge(
    assignments: list[StatusAssignment],
    bom_navigator: BomNavigator,
    charge_calculator: ChargeCalculatorPort,
) -> dict[str, dict[str, str | float]]:
    """Calcule les heures cumulées de retard par poste de charge.

    Domaine pur — ne dépend pas de pandas, de DataLoader, ni de production_planning.

    Parameters
    ----------
    assignments : list[StatusAssignment]
        Lignes déjà assignées en statut (filtrer Retard Prod en amont ou laisser le filtre ici)
    bom_navigator : BomNavigator
        Pour déterminer si la rupture est dans un sous-ensemble
    charge_calculator : ChargeCalculatorPort
        Pour le calcul de charge directe ou récursive

    Returns
    -------
    dict[str, dict]
        {poste_charge: {"heures": float, "libelle": str}}
    """
    charge_by_poste: dict[str, float] = defaultdict(float)
    libelle_by_poste: dict[str, str] = {}

    for assignment in assignments:
        if assignment.status != Status.RETARD_PROD:
            continue

        line = assignment.line
        article = line.article
        qte = line.qte_restante
        if not article or qte <= 0:
            continue

        # Déterminer si charge récursive
        is_recursive = False
        if assignment.cause is not None and assignment.cause.type_cause == CauseType.RUPTURE_COMPOSANTS:
            # Vérifier si le premier composant en rupture est dans un sous-ensemble
            if assignment.cause.composants:
                first_comp = next(iter(assignment.cause.composants))
                is_recursive = bom_navigator.is_component_in_subassembly(first_comp, article)

        try:
            if is_recursive:
                charge_map = charge_calculator.calculate_recursive_charge(article, qte)
            else:
                charge_map = charge_calculator.calculate_direct_charge(article, qte)
        except Exception:
            continue

        for poste, hours in charge_map.items():
            if charge_calculator.is_valid_poste(poste) and hours > 0:
                charge_by_poste[poste] += hours
                if poste not in libelle_by_poste:
                    libelle_by_poste[poste] = charge_calculator.get_poste_libelle(poste)

    return {
        poste: {"heures": round(hours, 2), "libelle": libelle_by_poste.get(poste, "")}
        for poste, hours in sorted(charge_by_poste.items())
    }
