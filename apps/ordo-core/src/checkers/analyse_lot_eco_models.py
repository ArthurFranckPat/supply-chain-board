"""Resultats de l'analyse d'adequation des lots economiques."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class StatutLot(str, Enum):
    OK = "OK"
    SURDIMENSIONNE = "SURDIMENSIONNE"
    SOUSDIMENSIONNE = "SOUSDIMENSIONNE"
    DEMANDE_NULLE = "DEMANDE_NULLE"


@dataclass(slots=True)
class AnalyseLotArticle:
    """Resultat de l'analyse pour un article composant."""

    article: str
    description: str
    lot_eco: int
    demande_hebdo: float
    couverture_lot_semaines: float
    delai_reappro_jours: int
    couverture_reappro_semaines: float
    ratio_couverture: float
    stock_physique: int
    stock_alloue: int
    stock_disponible: int
    stock_jours: float
    statut: StatutLot
    nb_parents: int
    valeur_stock: float
    lot_optimal: int
    prix_au_lot_eco: float
    prix_au_lot_optimal: float
    economie_immobilisation: float
    surcout_unitaire: float
    code_fournisseur: int


@dataclass(slots=True)
class AnalyseLotResult:
    """Resultat complet de l'analyse des lots economiques."""

    articles: list[AnalyseLotArticle]
    nb_total: int
    nb_ok: int
    nb_surdimensionne: int
    nb_sousdimensionne: int
    nb_demande_nulle: int

    def surdimensionnes(self) -> list[AnalyseLotArticle]:
        return [a for a in self.articles if a.statut == StatutLot.SURDIMENSIONNE]

    def sous_dimensionnes(self) -> list[AnalyseLotArticle]:
        return [a for a in self.articles if a.statut == StatutLot.SOUSDIMENSIONNE]

    def top_surdimensionnes(self, n: int = 20) -> list[AnalyseLotArticle]:
        sorted_articles = sorted(self.articles, key=lambda a: a.ratio_couverture, reverse=True)
        return [a for a in sorted_articles if a.statut == StatutLot.SURDIMENSIONNE][:n]

    def top_surstockage(self, n: int = 20) -> list[AnalyseLotArticle]:
        sorted_articles = sorted(self.articles, key=lambda a: a.valeur_stock, reverse=True)
        return [a for a in sorted_articles if a.statut == StatutLot.SURDIMENSIONNE][:n]
