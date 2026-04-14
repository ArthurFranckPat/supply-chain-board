"""Outil 5 : Séquencement des OFs sur un poste de charge.

Pour un poste donné, retourne la liste ordonnée des OFs faisables
selon une règle de priorité : EDD (date échéance), FIFO (création), SPT (durée).
"""

from dataclasses import dataclass, field
from datetime import date
from typing import List, Literal, Optional

from ...loaders.data_loader import DataLoader
from ...algorithms.charge_calculator import calculate_article_charge
from ...checkers.recursive import RecursiveChecker

ReglePriorite = Literal["EDD", "FIFO", "SPT"]


@dataclass
class SequencedOF:
    """OF positionné dans la séquence d'un poste.

    Attributes
    ----------
    num_of : str
        Numéro de l'OF
    article : str
        Code article
    description : str
        Description de l'article
    rang : int
        Position dans la séquence (1 = premier à lancer)
    heures_sur_poste : float
        Charge en heures sur ce poste spécifique
    date_fin_of : date
        Date de fin prévue de l'OF
    commande_liee : Optional[str]
        Numéro de commande client associée (si trouvée)
    date_expedition_commande : Optional[date]
        Date d'expédition demandée par le client
    en_retard : bool
        True si la date de fin OF est déjà dépassée
    feasible : bool
        True si l'OF a passé la vérification récursive
    """

    num_of: str
    article: str
    description: str
    rang: int
    heures_sur_poste: float
    date_fin_of: date
    commande_liee: Optional[str] = None
    date_expedition_commande: Optional[date] = None
    en_retard: bool = False
    feasible: bool = True


@dataclass
class OFSequence:
    """Résultat du séquencement pour un poste.

    Attributes
    ----------
    poste : str
        Code du poste de charge
    regle : str
        Règle de tri appliquée : EDD | FIFO | SPT
    sequence : List[SequencedOF]
        OFs dans l'ordre recommandé
    charge_totale_heures : float
        Somme des heures sur ce poste
    nb_ofs_en_retard : int
        OFs dont la date de fin est dépassée
    premier_retard_prevu : Optional[date]
        Date du premier OF potentiellement en retard (date_fin dépassée)
    """

    poste: str
    regle: str
    sequence: List[SequencedOF]
    charge_totale_heures: float
    nb_ofs_en_retard: int = 0
    premier_retard_prevu: Optional[date] = None


def sequence_ofs_for_poste(
    loader: DataLoader,
    poste: str,
    regle: ReglePriorite = "EDD",
    reference_date: date = None,
    only_feasible: bool = True,
    use_receptions: bool = False,
) -> OFSequence:
    """Séquence les OFs actifs sur un poste selon une règle de priorité.

    Parameters
    ----------
    loader : DataLoader
        DataLoader avec accès aux données
    poste : str
        Code du poste de charge (ex: "PP_830")
    regle : str
        Règle de tri : EDD (date échéance), FIFO (création OF), SPT (durée)
    reference_date : date, optional
        Date de référence pour calcul des retards (défaut : aujourd'hui)
    only_feasible : bool
        Si True, ne séquence que les OFs dont la faisabilité est confirmée
    use_receptions : bool
        Si True, prend en compte les réceptions fournisseurs dans la vérif

    Returns
    -------
    OFSequence
        Séquence triée avec métadonnées
    """
    if reference_date is None:
        reference_date = date.today()

    checker = RecursiveChecker(loader, use_receptions=use_receptions)

    # Index commandes par article pour retrouver la commande liée
    commandes_by_article: dict[str, list] = {}
    for c in loader.commandes_clients:
        if c.est_commande() and c.qte_restante > 0:
            commandes_by_article.setdefault(c.article, []).append(c)

    candidates: List[dict] = []

    for of in loader.ofs:
        if of.qte_restante <= 0:
            continue

        # Vérifier si cet OF utilise ce poste
        charge = calculate_article_charge(of.article, of.qte_restante, loader)
        heures_poste = charge.get(poste, 0.0)
        if heures_poste <= 0:
            continue

        # Vérification faisabilité
        feasible = True
        if only_feasible:
            result = checker.check_of(of)
            feasible = result.feasible
            if not feasible:
                continue

        # Trouver la commande associée la plus proche
        commandes = commandes_by_article.get(of.article, [])
        commande_liee = None
        date_expedition = None
        if commandes:
            closest = min(commandes, key=lambda c: c.date_expedition_demandee)
            commande_liee = closest.num_commande
            date_expedition = closest.date_expedition_demandee

        en_retard = of.date_fin < reference_date

        candidates.append({
            "of": of,
            "heures_poste": heures_poste,
            "commande_liee": commande_liee,
            "date_expedition": date_expedition,
            "en_retard": en_retard,
            "feasible": feasible,
        })

    # Tri selon la règle
    if regle == "EDD":
        # Earliest Due Date : date d'expédition commande (ou date_fin OF si pas de commande)
        candidates.sort(key=lambda c: (
            c["date_expedition"] or c["of"].date_fin
        ))
    elif regle == "FIFO":
        # First In First Out : date_fin OF comme proxy de création (num_of alphanumérique)
        candidates.sort(key=lambda c: c["of"].num_of)
    elif regle == "SPT":
        # Shortest Processing Time : heures croissantes
        candidates.sort(key=lambda c: c["heures_poste"])

    # Construire la séquence
    sequence: List[SequencedOF] = []
    charge_totale = 0.0
    nb_retards = 0
    premier_retard: Optional[date] = None

    for rang, cand in enumerate(candidates, start=1):
        of = cand["of"]
        charge_totale += cand["heures_poste"]
        if cand["en_retard"]:
            nb_retards += 1
            if premier_retard is None or of.date_fin < premier_retard:
                premier_retard = of.date_fin

        sequence.append(SequencedOF(
            num_of=of.num_of,
            article=of.article,
            description=of.description,
            rang=rang,
            heures_sur_poste=round(cand["heures_poste"], 2),
            date_fin_of=of.date_fin,
            commande_liee=cand["commande_liee"],
            date_expedition_commande=cand["date_expedition"],
            en_retard=cand["en_retard"],
            feasible=cand["feasible"],
        ))

    return OFSequence(
        poste=poste,
        regle=regle,
        sequence=sequence,
        charge_totale_heures=round(charge_totale, 2),
        nb_ofs_en_retard=nb_retards,
        premier_retard_prevu=premier_retard,
    )
