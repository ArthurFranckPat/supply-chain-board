"""Algorithme de calcul de charge par poste de charge."""

import re
from collections import defaultdict
from datetime import date, timedelta
from functools import lru_cache
from typing import Optional

from ..loaders.data_loader import DataLoader
from ..models.besoin_client import BesoinClient
from ..models.charge import ChargeByPoste
from ..orders.forecast_consumption import consume_forecasts_by_article

# Regex pour valider les postes de charge : PP_xxx où xxx est un chiffre
POSTE_CHARGE_REGEX = re.compile(r"^PP_\d+$")


def is_valid_poste(poste: str) -> bool:
    """Vérifie si un poste de charge suit le pattern PP_xxx.

    Parameters
    ----------
    poste : str
        Code du poste de charge

    Returns
    -------
    bool
        True si le poste suit le pattern PP_xxx (ex: PP_830, PP_128)
        False sinon (ex: POSTE DIV AERECO 9, PP_AERECO)

    Examples
    --------
    >>> is_valid_poste("PP_830")
    True
    >>> is_valid_poste("PP_128")
    True
    >>> is_valid_poste("POSTE DIV AERECO 9")
    False
    >>> is_valid_poste("PP_AERECO")
    False
    """
    return bool(POSTE_CHARGE_REGEX.match(poste))


def calculate_article_charge(
    article: str,
    quantity: float,
    data_loader: DataLoader,
    visited: Optional[set[str]] = None
) -> dict[str, float]:
    """Calcule récursivement la charge par poste pour un article.

    Cette fonction descend récursivement dans la nomenclature pour calculer
    la charge de tous les sous-ensembles fabriqués.

    Algorithme :
    1. Vérifier les dépendances circulaires (visited set)
    2. Récupérer la gamme de l'article → calculer charge directe (qty / cadence)
    3. Récupérer la nomenclature → pour chaque composant FABRIQUÉ :
       - Calculer qty = qte_lien * quantity
       - APPEL RÉCURSIF pour le composant
       - Fusionner la charge
    4. Pour les composants ACHETÉ : arrêter la récursion

    Parameters
    ----------
    article : str
        Code article à calculer
    quantity : float
        Quantité à produire
    data_loader : DataLoader
        Loader de données
    visited : Optional[set[str]], optional
        Set des articles visités pour éviter les boucles

    Returns
    -------
    dict[str, float]
        Dictionnaire {poste_charge: heures}
        Ex: {"PP_128": 2.5, "PP_091": 4.0}

    Examples
    --------
    >>> # Article A: 100 unités
    >>> # - Gamme A: PP_128 @ 50/h → 2h
    >>> # - Nomenclature A contient B (x1, fabriqué)
    >>> #   - Gamme B: PP_091 @ 25/h → 4h
    >>> calculate_article_charge("A", 100, loader)
    {"PP_128": 2.0, "PP_091": 4.0}
    """
    # Initialiser visited set
    if visited is None:
        visited = set()

    # Vérifier les dépendances circulaires
    if article in visited:
        return {}
    visited.add(article)

    total_charge = defaultdict(float)

    # 1. Charge directe (gamme de l'article)
    gamme = data_loader.get_gamme(article)
    if gamme:
        for op in gamme.operations:
            # Filtrer les postes qui ne suivent pas le pattern PP_xxx
            if not is_valid_poste(op.poste_charge):
                continue
            if op.cadence > 0:
                hours = quantity / op.cadence
                total_charge[op.poste_charge] += hours
    else:
        # Warning si pas de gamme (non bloquant)
        pass  # TODO: Ajouter warning si nécessaire

    # 2. Charge indirecte (nomenclature)
    nomenclature = data_loader.get_nomenclature(article)
    if nomenclature:
        for composant in nomenclature.composants:
            if composant.is_fabrique():
                # Récursion pour les composants fabriqués
                component_qty = composant.qte_requise(quantity)
                component_charge = calculate_article_charge(
                    article=composant.article_composant,
                    quantity=component_qty,
                    data_loader=data_loader,
                    visited=visited.copy()  # Copie pour chaque branche
                )
                # Fusionner les résultats
                for poste, hours in component_charge.items():
                    total_charge[poste] += hours
            # Si ACHETÉ: ne rien faire (pas de charge)

    return dict(total_charge)


def get_week_info(expedition_date: date, date_reference: date) -> dict:
    """Détermine à quelle semaine appartient une date d'expédition.

    Parameters
    ----------
    expedition_date : date
        Date d'expédition demandée
    date_reference : date
        Date de référence (aujourd'hui)

    Returns
    -------
    dict
        Dictionnaire avec:
        - "week_label": "S+1", "S+2", etc.
        - "week_number": Numéro de semaine ISO
        - "year": Année
        - "date_start": Date de début de semaine
        - "date_end": Date de fin de semaine

    Examples
    --------
    >>> # Date ref: 2026-03-21 (dimanche)
    >>> # Expedition: 2026-03-25 (jeudi) → S+1
    >>> get_week_info(date(2026, 3, 25), date(2026, 3, 21))
    {"week_label": "S+1", "week_number": 13, "year": 2026, ...}
    """
    # Calculer le nombre de semaines
    days_diff = (expedition_date - date_reference).days
    week_num = (days_diff // 7) + 1

    # Gérer les dates passées
    if week_num < 1:
        week_num = 1

    week_label = f"S+{week_num}"

    # Calculer les limites de la semaine (lundi = 0, dimanche = 6)
    weekday = expedition_date.weekday()
    date_start = expedition_date - timedelta(days=weekday)
    date_end = expedition_date + timedelta(days=6 - weekday)

    # Numéro de semaine ISO
    iso_week = expedition_date.isocalendar()

    return {
        "week_label": week_label,
        "week_number": iso_week[1],
        "year": iso_week[0],
        "date_start": date_start,
        "date_end": date_end,
    }


def group_by_week(
    besoins: list[BesoinClient],
    num_weeks: int,
    date_reference: Optional[date] = None
) -> dict[str, list[BesoinClient]]:
    """Groupe les besoins par semaine.

    Parameters
    ----------
    besoins : list[BesoinClient]
        Liste des besoins clients
    num_weeks : int
        Nombre de semaines à considérer
    date_reference : Optional[date], optional
        Date de référence (défaut: aujourd'hui)

    Returns
    -------
    dict[str, list[BesoinClient]]
        Dictionnaire {week_label: liste des besoins}
        Ex: {"S+1": [besoin1, besoin2], "S+2": [besoin3]}
    """
    if date_reference is None:
        date_reference = date.today()

    weekly_groups = defaultdict(list)

    for besoin in besoins:
        week_info = get_week_info(besoin.date_expedition_demandee, date_reference)
        week_label = week_info["week_label"]

        # N'inclure que dans l'horizon spécifié
        # week_label format: "S+1", "S+2", etc.
        week_num = int(week_label.replace("S+", ""))
        if week_num <= num_weeks:
            weekly_groups[week_label].append(besoin)

    return dict(weekly_groups)


def calculate_weekly_charge_heatmap(
    besoins: list[BesoinClient],
    data_loader: DataLoader,
    num_weeks: int = 4
) -> list[ChargeByPoste]:
    """Calcule la heatmap de charge hebdomadaire par poste de charge.

    Algorithme :
    1. Grouper les besoins par semaine (S+1, S+2, etc.)
    2. Pour chaque besoin dans chaque semaine :
       - Calculer la charge de l'article (avec récursion)
       - Ajouter au total du poste pour cette semaine
    3. Agréger par poste de charge
    4. Ajouter le backlog et la semaine en cours

    Parameters
    ----------
    besoins : list[BesoinClient]
        Liste des besoins clients
    data_loader : DataLoader
        Loader de données
    num_weeks : int, optional
        Nombre de semaines à calculer (défaut: 4)

    Returns
    -------
    list[ChargeByPoste]
        Liste des postes avec leurs charges par semaine
        Triée par poste_charge
        Inclut BACKLOG et EN_COURS en plus de S+1, S+2, etc.

    Examples
    --------
    >>> heatmap = calculate_weekly_charge_heatmap(besoins, loader, 4)
    >>> for poste in heatmap:
    ...     print(f"{poste.poste_charge}: {poste.charges}")
    PP_128: {"BACKLOG": 50.2, "EN_COURS": 120.5, "S+1": 98.3, ...}
    """
    from datetime import timedelta

    date_ref = date.today()

    # Calculer les bornes pour la semaine en cours
    weekday = date_ref.weekday()  # 0 = lundi, 6 = dimanche
    lundi_semaine_en_cours = date_ref - timedelta(days=weekday)
    dimanche_semaine_en_cours = lundi_semaine_en_cours + timedelta(days=6)

    # 1. Grouper les besoins par semaine (S+1, S+2, etc.)
    weekly_besoins = group_by_week(besoins, num_weeks)

    # 2. Créer les groupes supplémentaires : BACKLOG et EN_COURS
    besoins_backlog = []
    besoins_encours = []

    for besoin in besoins:
        date_exp = besoin.date_expedition_demandee
        if date_exp < lundi_semaine_en_cours:
            # BACKLOG : avant la semaine en cours
            besoins_backlog.append(besoin)
        elif date_exp <= dimanche_semaine_en_cours:
            # EN_COURS : semaine en cours (lundi → dimanche actuelle)
            besoins_encours.append(besoin)

    # 3. Calculer la charge pour chaque période
    weekly_charges = defaultdict(lambda: defaultdict(float))
    # weekly_charges[poste][week_label] = hours

    # Fonction helper pour traiter un groupe de besoins
    def process_groupe(label_besoin, besoins_groupe):
        """Calcule la charge pour un groupe de besoins."""
        if not besoins_groupe:
            return

        # Appliquer la consommation des prévisions
        besoins_ajustes, _ = consume_forecasts_by_article(
            besoins_groupe,
            label_besoin
        )

        for besoin in besoins_ajustes:
            # Calculer la charge pour cet article
            charge_by_poste = calculate_article_charge(
                article=besoin.article,
                quantity=besoin.qte_restante,
                data_loader=data_loader
            )

            # Ajouter aux totaux
            for poste, hours in charge_by_poste.items():
                weekly_charges[poste][label_besoin] += hours

    # Traiter les périodes
    process_groupe("BACKLOG", besoins_backlog)
    process_groupe("EN_COURS", besoins_encours)

    for week_label, besoins_in_week in weekly_besoins.items():
        process_groupe(week_label, besoins_in_week)

    # 4. Convertir en objets ChargeByPoste
    heatmap = []
    for poste, charges in weekly_charges.items():
        # Récupérer le libellé du poste
        libelle = get_poste_libelle(poste, data_loader)

        heatmap.append(ChargeByPoste(
            poste_charge=poste,
            libelle_poste=libelle,
            charges=dict(charges)
        ))

    # Trier par poste
    heatmap.sort(key=lambda x: x.poste_charge)

    return heatmap


@lru_cache(maxsize=1)
def _build_poste_libelle_index(data_loader: DataLoader) -> dict[str, str]:
    """Build an index of poste_charge -> libelle_poste from all gammes."""
    index: dict[str, str] = {}
    for gamme in data_loader.gammes.values():
        for op in gamme.operations:
            if op.poste_charge and op.poste_charge not in index:
                index[op.poste_charge] = op.libelle_poste or ""
    return index


def get_poste_libelle(poste: str, data_loader: DataLoader) -> str:
    """Récupère le libellé d'un poste de charge.

    Parameters
    ----------
    poste : str
        Code du poste de charge
    data_loader : DataLoader
        Loader de données

    Returns
    -------
    str
        Libellé du poste (ou chaîne vide si introuvable)
    """
    index = _build_poste_libelle_index(data_loader)
    return index.get(poste, "")
