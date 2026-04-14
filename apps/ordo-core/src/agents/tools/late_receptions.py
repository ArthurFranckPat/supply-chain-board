"""Outil 2 : Impact des réceptions fournisseurs en retard.

Identifie les réceptions dont la date prévue est dépassée et liste
les OFs et commandes clients bloqués en cascade.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import List

from ...loaders.data_loader import DataLoader


@dataclass
class LateReceptionImpact:
    """Impact d'une réception fournisseur en retard.

    Attributes
    ----------
    article : str
        Code article attendu
    fournisseur : str
        Code fournisseur
    num_commande_achat : str
        Numéro de la commande d'achat fournisseur
    date_prevue : date
        Date de réception prévue (dépassée)
    jours_retard : int
        Nombre de jours de retard
    qte_attendue : int
        Quantité encore attendue
    ofs_bloques : List[str]
        Numéros des OFs dont la faisabilité est compromise
    commandes_impactees : List[str]
        Numéros des commandes clients potentiellement en retard
    niveau_risque : str
        CRITIQUE | ELEVE | MOYEN selon gravité
    """

    article: str
    fournisseur: str
    num_commande_achat: str
    date_prevue: date
    jours_retard: int
    qte_attendue: int
    ofs_bloques: List[str] = field(default_factory=list)
    commandes_impactees: List[str] = field(default_factory=list)
    niveau_risque: str = "MOYEN"


def check_late_receptions_impact(
    loader: DataLoader,
    reference_date: date = None,
    max_retard_days: int = 90,
) -> List[LateReceptionImpact]:
    """Identifie les réceptions en retard et leur impact sur la production.

    Une réception est considérée "en retard" si sa date prévue est
    strictement antérieure à reference_date et que la quantité restante > 0.

    Pour chaque réception en retard, l'outil remonte :
    - Les OFs actifs dont la nomenclature contient cet article (niveau 1)
    - Les commandes clients liées à ces articles parents

    Parameters
    ----------
    loader : DataLoader
        DataLoader avec accès aux données
    reference_date : date, optional
        Date de référence (défaut : aujourd'hui)
    max_retard_days : int
        Retard maximum pour inclure une réception (défaut : 90).
        Les réceptions avec plus de max_retard_days jours de retard sont
        considérées comme des données stale et ignorées.

    Returns
    -------
    List[LateReceptionImpact]
        Impacts triés par niveau de risque (CRITIQUE en premier), puis retard décroissant
    """
    if reference_date is None:
        reference_date = date.today()

    # Index inverse : composant → articles parents qui l'utilisent (niveau 1)
    composant_to_parents: dict[str, set[str]] = {}
    for article_parent, nomenclature in loader.nomenclatures.items():
        for composant in nomenclature.composants:
            composant_to_parents.setdefault(
                composant.article_composant, set()
            ).add(article_parent)

    # Index commandes actives par article (pour remonter l'impact client)
    commandes_by_article: dict[str, list] = {}
    for c in loader.commandes_clients:
        if c.est_commande() and c.qte_restante > 0:
            commandes_by_article.setdefault(c.article, []).append(c.num_commande)

    impacts: List[LateReceptionImpact] = []

    for reception in loader.receptions:
        if reception.quantite_restante <= 0:
            continue
        if reception.date_reception_prevue >= reference_date:
            continue  # Pas encore en retard

        jours_retard = (reference_date - reception.date_reception_prevue).days

        if jours_retard > max_retard_days:
            continue  # Données stale — réception non soldée depuis trop longtemps

        # Articles parents qui utilisent ce composant
        articles_parents = composant_to_parents.get(reception.article, set())
        # Ajouter aussi l'article lui-même (OF direct)
        articles_concernes = articles_parents | {reception.article}

        # OFs actifs concernés
        ofs_bloques: List[str] = []
        for of in loader.ofs:
            if of.qte_restante > 0 and of.article in articles_concernes:
                ofs_bloques.append(of.num_of)

        # Commandes clients impactées
        commandes_impactees: List[str] = []
        for article in articles_concernes:
            commandes_impactees.extend(commandes_by_article.get(article, []))
        commandes_impactees = list(dict.fromkeys(commandes_impactees))  # dédoublonner

        # Niveau de risque
        if jours_retard >= 7 or len(ofs_bloques) >= 5:
            niveau_risque = "CRITIQUE"
        elif jours_retard >= 3 or len(ofs_bloques) >= 2:
            niveau_risque = "ELEVE"
        else:
            niveau_risque = "MOYEN"

        impacts.append(LateReceptionImpact(
            article=reception.article,
            fournisseur=reception.code_fournisseur,
            num_commande_achat=reception.num_commande,
            date_prevue=reception.date_reception_prevue,
            jours_retard=jours_retard,
            qte_attendue=reception.quantite_restante,
            ofs_bloques=ofs_bloques,
            commandes_impactees=commandes_impactees,
            niveau_risque=niveau_risque,
        ))

    # Tri : risque (CRITIQUE → ELEVE → MOYEN), puis retard décroissant
    ordre_risque = {"CRITIQUE": 0, "ELEVE": 1, "MOYEN": 2}
    impacts.sort(key=lambda i: (ordre_risque[i.niveau_risque], -i.jours_retard))
    return impacts
