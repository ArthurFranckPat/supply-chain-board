"""Outil 6 : KPIs de taux de service.

Calcule les indicateurs clés de performance de l'ordonnancement :
taux de service global et par client, retards, utilisation des postes.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List

from ...loaders.data_loader import DataLoader
from ...algorithms.charge_calculator import calculate_weekly_charge_heatmap

CAPACITE_NOMINALE_DEFAULT = 35.0


@dataclass
class ClientKPI:
    """KPIs de service pour un client.

    Attributes
    ----------
    nom_client : str
        Nom du client
    nb_commandes_total : int
        Nombre de commandes actives
    nb_commandes_servies : int
        Commandes soldées (qte_restante == 0)
    nb_commandes_en_retard : int
        Commandes dont la date d'expédition est dépassée et qte_restante > 0
    taux_service : float
        nb_commandes_servies / nb_commandes_total (0.0 → 1.0)
    """

    nom_client: str
    nb_commandes_total: int
    nb_commandes_servies: int
    nb_commandes_en_retard: int
    taux_service: float


@dataclass
class ServiceRateKPIs:
    """KPIs globaux de taux de service.

    Attributes
    ----------
    taux_service_global : float
        Taux de service toutes commandes confondues (0.0 → 1.0)
    kpis_par_client : List[ClientKPI]
        KPIs détaillés par client, triés par taux de service croissant
    nb_commandes_total : int
        Nombre total de commandes actives
    nb_commandes_servies : int
        Commandes avec allocation complète
    nb_commandes_en_retard : int
        Commandes dont l'expédition est dépassée
    commandes_en_retard : List[str]
        Numéros des commandes en retard
    ofs_affermis_actifs : int
        OFs fermes avec quantité restante > 0
    ofs_suggeres_actifs : int
        OFs suggérés avec quantité restante > 0
    utilisation_postes_s1 : Dict[str, float]
        Taux d'utilisation par poste sur S+1 (charge / capacité nominale)
    date_calcul : date
        Date du calcul
    """

    taux_service_global: float
    kpis_par_client: List[ClientKPI]
    nb_commandes_total: int
    nb_commandes_servies: int
    nb_commandes_en_retard: int
    commandes_en_retard: List[str]
    ofs_affermis_actifs: int
    ofs_suggeres_actifs: int
    utilisation_postes_s1: Dict[str, float]
    date_calcul: date = field(default_factory=date.today)


def get_service_rate_kpis(
    loader: DataLoader,
    reference_date: date = None,
    capacite_par_poste: Dict[str, float] = None,
    capacite_defaut: float = CAPACITE_NOMINALE_DEFAULT,
) -> ServiceRateKPIs:
    """Calcule les KPIs de taux de service.

    Parameters
    ----------
    loader : DataLoader
        DataLoader avec accès aux données
    reference_date : date, optional
        Date de référence (défaut : aujourd'hui)
    capacite_par_poste : Dict[str, float], optional
        Capacité nominale en heures par poste (défaut : 35h pour tous)
    capacite_defaut : float
        Capacité nominale par défaut

    Returns
    -------
    ServiceRateKPIs
        Ensemble des KPIs calculés
    """
    if reference_date is None:
        reference_date = date.today()
    if capacite_par_poste is None:
        capacite_par_poste = {}

    # Filtrer uniquement les commandes réelles actives
    commandes = [
        c for c in loader.commandes_clients
        if c.est_commande() and c.qte_commandee > 0
    ]

    # --- KPIs globaux commandes ---
    nb_total = len(commandes)
    nb_servies = sum(1 for c in commandes if c.qte_restante == 0)
    retards = [
        c for c in commandes
        if c.date_expedition_demandee < reference_date and c.qte_restante > 0
    ]
    nb_retards = len(retards)
    commandes_en_retard_nums = [c.num_commande for c in retards]

    taux_global = nb_servies / nb_total if nb_total > 0 else 0.0

    # --- KPIs par client ---
    from collections import defaultdict
    by_client: dict[str, list] = defaultdict(list)
    for c in commandes:
        by_client[c.nom_client].append(c)

    kpis_par_client: List[ClientKPI] = []
    for nom_client, cmds in by_client.items():
        n_total = len(cmds)
        n_servies = sum(1 for c in cmds if c.qte_restante == 0)
        n_retards = sum(
            1 for c in cmds
            if c.date_expedition_demandee < reference_date and c.qte_restante > 0
        )
        kpis_par_client.append(ClientKPI(
            nom_client=nom_client,
            nb_commandes_total=n_total,
            nb_commandes_servies=n_servies,
            nb_commandes_en_retard=n_retards,
            taux_service=round(n_servies / n_total, 3) if n_total > 0 else 0.0,
        ))

    # Tri : taux de service croissant (clients les moins bien servis en premier)
    kpis_par_client.sort(key=lambda k: k.taux_service)

    # --- OFs actifs ---
    ofs_actifs = [of for of in loader.ofs if of.qte_restante > 0]
    ofs_affermis = sum(1 for of in ofs_actifs if of.is_ferme())
    ofs_suggeres = sum(1 for of in ofs_actifs if of.is_suggere())

    # --- Utilisation postes S+1 ---
    besoins_s1 = loader.get_commandes_s1(reference_date, horizon_days=7, include_previsions=False)
    heatmap_s1 = calculate_weekly_charge_heatmap(besoins_s1, loader, num_weeks=1)

    utilisation_postes: Dict[str, float] = {}
    for poste_data in heatmap_s1:
        charge_s1 = poste_data.charges.get("S+1", 0.0)
        cap = capacite_par_poste.get(poste_data.poste_charge, capacite_defaut)
        utilisation_postes[poste_data.poste_charge] = round(charge_s1 / cap, 3) if cap > 0 else 0.0

    return ServiceRateKPIs(
        taux_service_global=round(taux_global, 3),
        kpis_par_client=kpis_par_client,
        nb_commandes_total=nb_total,
        nb_commandes_servies=nb_servies,
        nb_commandes_en_retard=nb_retards,
        commandes_en_retard=commandes_en_retard_nums,
        ofs_affermis_actifs=ofs_affermis,
        ofs_suggeres_actifs=ofs_suggeres,
        utilisation_postes_s1=utilisation_postes,
        date_calcul=reference_date,
    )
