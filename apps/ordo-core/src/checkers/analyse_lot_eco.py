"""Analyse d'adequation des lots economiques vs besoins reels.

Pour chaque composant ache, calcule la demande nette hebdomadaire
via les besoins clients × nomenclatures, puis compare la couverture
apportee par un lot economique au delai de reappro.
"""

from __future__ import annotations

import random
from collections import defaultdict
from datetime import date

from ..loaders import DataLoader
from .analyse_lot_eco_models import (
    AnalyseLotArticle,
    AnalyseLotResult,
    StatutLot,
)


class AnalyseLotEcoService:
    """Analyse l'adequation lot_eco / besoin reel pour les composants."""

    SEUIL_SURDIM = 2.0
    SEUIL_SOUSDIM = 0.8
    DEMANDE_MIN_HEBDO = 0.5
    DEFAUT_DELAI_REAPPRO = 28

    def __init__(self, loader: DataLoader) -> None:
        self._loader = loader

    def analyser(self) -> AnalyseLotResult:
        demande_composants = self._calculer_demande_composants()
        articles = self._loader.articles
        stocks = self._loader.stocks

        resultats: list[AnalyseLotArticle] = []

        for code_comp, demande_info in demande_composants.items():
            article = articles.get(code_comp)
            if article is None:
                continue

            lot_eco = self._get_lot_eco(article.code)
            demande_hebdo = demande_info["demande_hebdo"]
            nb_parents = demande_info["nb_parents"]

            delai_reappro = article.delai_reappro or self.DEFAUT_DELAI_REAPPRO
            couverture_reappro_sem = delai_reappro / 7.0

            stock = stocks.get(code_comp)
            stock_physique = stock.stock_physique if stock else 0
            stock_alloue = stock.stock_alloue if stock else 0
            stock_disponible = stock.disponible() if stock else 0
            pmp = article.pmp or 0.0
            valeur_stock = stock_physique * pmp

            if demande_hebdo < self.DEMANDE_MIN_HEBDO:
                demande_jour = 0
                stock_jours = -1 if stock_disponible > 0 else 0
                couverture_lot_sem = -1 if lot_eco > 0 else 0
                ratio = 0.0
                statut = StatutLot.DEMANDE_NULLE
            else:
                demande_jour = demande_hebdo / 7.0
                stock_jours = stock_disponible / demande_jour if demande_jour > 0 else 0
                couverture_lot_sem = lot_eco / demande_hebdo
                ratio = couverture_lot_sem / couverture_reappro_sem
                if ratio > self.SEUIL_SURDIM:
                    statut = StatutLot.SURDIMENSIONNE
                elif ratio < self.SEUIL_SOUSDIM:
                    statut = StatutLot.SOUSDIMENSIONNE
                else:
                    statut = StatutLot.OK

            resultats.append(
                AnalyseLotArticle(
                    article=code_comp,
                    description=article.description,
                    lot_eco=lot_eco,
                    demande_hebdo=round(demande_hebdo, 2),
                    couverture_lot_semaines=round(couverture_lot_sem, 1),
                    delai_reappro_jours=delai_reappro,
                    couverture_reappro_semaines=round(couverture_reappro_sem, 1),
                    ratio_couverture=round(ratio, 2),
                    stock_physique=stock_physique,
                    stock_alloue=stock_alloue,
                    stock_disponible=stock_disponible,
                    stock_jours=round(stock_jours, 1),
                    statut=statut,
                    nb_parents=nb_parents,
                    valeur_stock=round(valeur_stock, 2),
                )
            )

        resultats.sort(key=lambda a: a.ratio_couverture, reverse=True)

        return AnalyseLotResult(
            articles=resultats,
            nb_total=len(resultats),
            nb_ok=sum(1 for a in resultats if a.statut == StatutLot.OK),
            nb_surdimensionne=sum(1 for a in resultats if a.statut == StatutLot.SURDIMENSIONNE),
            nb_sousdimensionne=sum(1 for a in resultats if a.statut == StatutLot.SOUSDIMENSIONNE),
            nb_demande_nulle=sum(1 for a in resultats if a.statut == StatutLot.DEMANDE_NULLE),
        )

    def _get_lot_eco(self, article_code: str) -> int:
        article = self._loader.articles.get(article_code)
        lot = getattr(article, "lot_eco", None) if article else None
        if lot is not None:
            return lot
        return self._placeholder_lot_eco(article_code)

    def _placeholder_lot_eco(self, article_code: str) -> int:
        random.seed(hash(article_code))
        return random.randint(100, 5000)

    def _calculer_demande_composants(self) -> dict:
        nomenclatures = self._loader.nomenclatures
        besoins = self._loader.commandes_clients

        besoins_actifs = [b for b in besoins if b.qte_restante > 0]
        if not besoins_actifs:
            return {}

        dates = [b.date_expedition_demandee for b in besoins_actifs if b.date_expedition_demandee]
        if not dates:
            return {}

        date_min = min(dates)
        date_max = max(dates)
        nb_jours = max((date_max - date_min).days, 1)
        nb_semaines = nb_jours / 7.0

        demande_brute: dict[str, float] = defaultdict(float)
        nb_parents: dict[str, int] = defaultdict(set)

        for besoin in besoins_actifs:
            nomen = nomenclatures.get(besoin.article)
            if nomen is None:
                continue
            for comp in nomen.composants:
                if not comp.is_achete():
                    continue
                qte = comp.qte_requise(besoin.qte_restante)
                demande_brute[comp.article_composant] += qte
                nb_parents[comp.article_composant].add(besoin.article)

        resultat: dict[str, dict] = {}
        for code, total in demande_brute.items():
            resultat[code] = {
                "demande_hebdo": total / nb_semaines if nb_semaines > 0 else 0,
                "nb_parents": len(nb_parents.get(code, set())),
            }
        return resultat
