"""Outil 7 : Concurrence entre OFs sur un composant.

Pour un article composant donné, liste tous les OFs actifs qui en ont
besoin, calcule le déficit éventuel et identifie l'OF prioritaire.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import List, Optional

from ...loaders.data_loader import DataLoader


@dataclass
class CompetingOF:
    """OF en concurrence sur un composant.

    Attributes
    ----------
    num_of : str
        Numéro de l'OF
    article_parent : str
        Article fabriqué par cet OF
    qte_besoin : float
        Quantité du composant nécessaire pour cet OF
    date_besoin : date
        Date de besoin (= date_fin de l'OF)
    statut : int
        1 = Ferme, 3 = Suggéré
    statut_texte : str
        Libellé du statut
    priorite_relative : int
        Rang dans la liste triée (1 = le plus prioritaire)
    """

    num_of: str
    article_parent: str
    qte_besoin: float
    date_besoin: date
    statut: int
    statut_texte: str
    priorite_relative: int = 0


@dataclass
class ComponentCompetition:
    """Résultat de l'analyse de concurrence sur un composant.

    Attributes
    ----------
    article_composant : str
        Code article du composant analysé
    stock_disponible : int
        Stock disponible actuel (physique - alloué)
    besoin_total : float
        Somme des besoins de tous les OFs concurrents
    deficit : float
        max(0, besoin_total - stock_disponible) — quantité manquante
    reception_prevue : Optional[int]
        Quantité en réception fournisseur prévue (toutes dates confondues)
    date_premiere_reception : Optional[date]
        Date de la première réception disponible
    ofs_concurrents : List[CompetingOF]
        OFs triés par priorité (ferme > suggéré, puis date croissante)
    of_prioritaire : Optional[str]
        Numéro de l'OF qui devrait être servi en premier
    """

    article_composant: str
    stock_disponible: int
    besoin_total: float
    deficit: float
    reception_prevue: Optional[int]
    date_premiere_reception: Optional[date]
    ofs_concurrents: List[CompetingOF] = field(default_factory=list)
    of_prioritaire: Optional[str] = None


def get_competing_ofs_for_component(
    loader: DataLoader,
    article_composant: str,
) -> ComponentCompetition:
    """Identifie les OFs en concurrence sur un composant donné.

    Parcourt les nomenclatures niveau 1 de tous les OFs actifs pour
    trouver ceux qui utilisent ce composant.

    Parameters
    ----------
    loader : DataLoader
        DataLoader avec accès aux données
    article_composant : str
        Code article du composant à analyser

    Returns
    -------
    ComponentCompetition
        Analyse complète de la concurrence
    """
    # Stock disponible du composant
    stock = loader.get_stock(article_composant)
    stock_dispo = stock.disponible() if stock else 0

    # Réceptions prévues
    receptions = loader.get_receptions(article_composant)
    reception_totale = sum(r.quantite_restante for r in receptions if r.quantite_restante > 0)
    date_premiere_reception: Optional[date] = None
    if receptions:
        futures = [r for r in receptions if r.quantite_restante > 0]
        if futures:
            date_premiere_reception = min(r.date_reception_prevue for r in futures)

    # Trouver les OFs qui utilisent ce composant (niveau 1 de nomenclature)
    competing: List[dict] = []

    for of in loader.ofs:
        if of.qte_restante <= 0:
            continue

        nomenclature = loader.get_nomenclature(of.article)
        if nomenclature is None:
            continue

        for composant in nomenclature.composants:
            if composant.article_composant != article_composant:
                continue

            qte_besoin = composant.qte_requise(of.qte_restante)
            competing.append({
                "num_of": of.num_of,
                "article_parent": of.article,
                "qte_besoin": qte_besoin,
                "date_besoin": of.date_fin,
                "statut": of.statut_num,
                "statut_texte": of.statut_texte,
            })
            break  # Un composant ne peut apparaître qu'une fois par niveau

    # Tri : ferme (statut=1) avant suggéré, puis date croissante
    competing.sort(key=lambda c: (0 if c["statut"] == 1 else 1, c["date_besoin"]))

    ofs_concurrents: List[CompetingOF] = []
    besoin_total = 0.0
    of_prioritaire: Optional[str] = None

    for rang, c in enumerate(competing, start=1):
        besoin_total += c["qte_besoin"]
        if rang == 1:
            of_prioritaire = c["num_of"]

        ofs_concurrents.append(CompetingOF(
            num_of=c["num_of"],
            article_parent=c["article_parent"],
            qte_besoin=round(c["qte_besoin"], 2),
            date_besoin=c["date_besoin"],
            statut=c["statut"],
            statut_texte=c["statut_texte"],
            priorite_relative=rang,
        ))

    deficit = max(0.0, besoin_total - stock_dispo)

    return ComponentCompetition(
        article_composant=article_composant,
        stock_disponible=stock_dispo,
        besoin_total=round(besoin_total, 2),
        deficit=round(deficit, 2),
        reception_prevue=reception_totale if reception_totale > 0 else None,
        date_premiere_reception=date_premiere_reception,
        ofs_concurrents=ofs_concurrents,
        of_prioritaire=of_prioritaire,
    )
