"""Outil 3 : Détection automatique des goulots d'étranglement.

Analyse la heatmap de charge et génère des alertes sur les postes
en saturation, avec identification des OFs les plus contributeurs.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional

from ...loaders.data_loader import DataLoader
from ...algorithms.charge_calculator import calculate_weekly_charge_heatmap, calculate_article_charge


# Seuils de charge (fraction de la capacité nominale)
SEUIL_SATURE = 1.00   # >= 100 %
SEUIL_TENSION = 0.85  # >= 85 %
SEUIL_SOUS_CHARGE = 0.60  # < 60 %

# Capacité nominale par défaut (1 poste × 7h/j × 5j = 35h/semaine)
CAPACITE_NOMINALE_DEFAULT = 35.0


@dataclass
class BottleneckAlert:
    """Alerte goulot pour un poste et une semaine donnés.

    Attributes
    ----------
    poste : str
        Code du poste de charge (PP_xxx)
    libelle : str
        Libellé du poste
    semaine : str
        Label de semaine : BACKLOG | EN_COURS | S+1 | S+2 ...
    charge_heures : float
        Charge calculée en heures
    capacite_heures : float
        Capacité nominale retenue
    taux_charge : float
        charge_heures / capacite_heures
    statut : str
        SATURE | TENSION | NORMAL | SOUS_CHARGE
    top_ofs : List[str]
        OFs les plus contributeurs sur ce poste × semaine
    suggestion : str
        Recommandation textuelle
    """

    poste: str
    libelle: str
    semaine: str
    charge_heures: float
    capacite_heures: float
    taux_charge: float
    statut: str
    top_ofs: List[str] = field(default_factory=list)
    suggestion: str = ""


def detect_bottlenecks(
    loader: DataLoader,
    reference_date: date = None,
    num_weeks: int = 4,
    capacite_par_poste: Optional[Dict[str, float]] = None,
    capacite_defaut: float = CAPACITE_NOMINALE_DEFAULT,
    semaines_cibles: Optional[List[str]] = None,
) -> List[BottleneckAlert]:
    """Détecte les postes de charge en saturation ou sous-charge.

    Parameters
    ----------
    loader : DataLoader
        DataLoader avec accès aux données
    reference_date : date, optional
        Date de référence (défaut : aujourd'hui)
    num_weeks : int
        Nombre de semaines à analyser (défaut : 4)
    capacite_par_poste : Dict[str, float], optional
        Capacité nominale en heures par poste (défaut : 35h pour tous)
    capacite_defaut : float
        Capacité nominale appliquée si le poste n'est pas dans capacite_par_poste
    semaines_cibles : List[str], optional
        Si fourni, ne retourne les alertes que pour ces semaines (ex: ["S+1", "S+2"])

    Returns
    -------
    List[BottleneckAlert]
        Alertes triées par statut (SATURÉ en premier), puis taux décroissant
    """
    if reference_date is None:
        reference_date = date.today()
    if capacite_par_poste is None:
        capacite_par_poste = {}

    besoins = [b for b in loader.commandes_clients if b.qte_restante > 0]
    heatmap = calculate_weekly_charge_heatmap(besoins, loader, num_weeks)

    # Index des OFs actifs par article pour trouver les top contributeurs
    ofs_actifs = [of for of in loader.ofs if of.qte_restante > 0]

    alerts: List[BottleneckAlert] = []

    for poste_data in heatmap:
        poste = poste_data.poste_charge
        libelle = poste_data.libelle_poste
        capacite = capacite_par_poste.get(poste, capacite_defaut)

        for semaine, charge_h in poste_data.charges.items():
            if semaines_cibles and semaine not in semaines_cibles:
                continue
            if charge_h <= 0:
                continue

            taux = charge_h / capacite if capacite > 0 else 0.0

            if taux >= SEUIL_SATURE:
                statut = "SATURE"
            elif taux >= SEUIL_TENSION:
                statut = "TENSION"
            elif taux < SEUIL_SOUS_CHARGE:
                statut = "SOUS_CHARGE"
            else:
                statut = "NORMAL"

            if statut == "NORMAL":
                continue  # Ne pas remonter les postes OK

            # Identifier les OFs les plus contributeurs sur ce poste
            top_ofs = _find_top_ofs_for_poste(poste, ofs_actifs, loader, top_n=3)

            suggestion = _build_suggestion(statut, poste, taux, capacite, top_ofs)

            alerts.append(BottleneckAlert(
                poste=poste,
                libelle=libelle,
                semaine=semaine,
                charge_heures=round(charge_h, 2),
                capacite_heures=capacite,
                taux_charge=round(taux, 3),
                statut=statut,
                top_ofs=top_ofs,
                suggestion=suggestion,
            ))

    # Tri : SATURÉ > TENSION > SOUS_CHARGE, puis taux décroissant
    ordre_statut = {"SATURE": 0, "TENSION": 1, "SOUS_CHARGE": 2}
    alerts.sort(key=lambda a: (ordre_statut.get(a.statut, 9), -a.taux_charge))
    return alerts


def _find_top_ofs_for_poste(
    poste: str,
    ofs_actifs: list,
    loader: DataLoader,
    top_n: int = 3,
) -> List[str]:
    """Retourne les N OFs dont la charge sur ce poste est la plus élevée."""
    contributions: List[tuple[str, float]] = []
    for of in ofs_actifs:
        charge = calculate_article_charge(of.article, of.qte_restante, loader)
        h = charge.get(poste, 0.0)
        if h > 0:
            contributions.append((of.num_of, h))

    contributions.sort(key=lambda x: x[1], reverse=True)
    return [num_of for num_of, _ in contributions[:top_n]]


def _build_suggestion(
    statut: str,
    poste: str,
    taux: float,
    capacite: float,
    top_ofs: List[str],
) -> str:
    pct = round(taux * 100)
    if statut == "SATURE":
        surplus_h = round((taux - 1.0) * capacite, 1)
        ofs_str = f" OFs à décaler : {', '.join(top_ofs)}" if top_ofs else ""
        return (
            f"{poste} saturé à {pct}% (+{surplus_h}h au-dessus capacité)."
            f" Envisagez 3×8 ou décalage OFs S+2/S+3.{ofs_str}"
        )
    if statut == "TENSION":
        return (
            f"{poste} en tension à {pct}% — surveillez les aléas de production."
        )
    if statut == "SOUS_CHARGE":
        manque_h = round((SEUIL_TENSION - taux) * capacite, 1)
        return (
            f"{poste} sous-chargé à {pct}% (manque ~{manque_h}h)."
            f" Avancez des OFs S+2/S+3 pour équilibrer."
        )
    return ""
