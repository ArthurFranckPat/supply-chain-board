"""Analyse de l'historique des stocks Sage X3 (table STOJOU).

Reconstitue le stock article par article à partir des mouvements,
calcule les indicateurs descriptifs.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from .x3_client import X3Client
from .x3_parser import STOJOU_FIELDS, parse_resources


@dataclass
class StockMovement:
    iptdat: str
    itmref: str
    qtystu: float
    trstyp: int
    vcrnum: str
    vcrnumori: str
    loc: str
    creusr: str
    stock_avant: float
    stock_apres: float
    mvtseq: int = 0


@dataclass
class StockAnalytics:
    article: str
    stock_min: float
    stock_max: float
    stock_moyen: float
    rotation: float
    tendance: str
    nombre_mouvements: int
    periode_debut: str | None = None
    periode_fin: str | None = None


class StockHistoryAnalyzer:

    def __init__(self, cache_ttl: float = 60.0):
        self._cache: dict[str, tuple[list[StockMovement], float]] = {}
        self._cache_ttl = cache_ttl

    def _fetch_mouvements(
        self,
        itmref: str,
        horizon_days: int = 45,
        include_internal: bool = False,
    ) -> list[dict[str, Any]]:
        client = X3Client()
        where = [f"ITMREF eq '{itmref}'"]
        if not include_internal:
            where.append("TRSTYP le 6")
        horizon_date = (date.today() - timedelta(days=horizon_days)).strftime("%Y-%m-%d")
        where.append(f"IPTDAT ge @{horizon_date}@")

        resources = client.query_all(
            classe="STOJOU",
            representation="ZSTOJOU",
            where=where,
            order_by="IPTDAT desc, MVTSEQ asc",
        )
        return parse_resources(resources, fields=STOJOU_FIELDS + ["MVTSEQ"])

    def _cache_key(self, itmref: str, horizon_days: int, include_internal: bool) -> str:
        return f"{itmref}:{horizon_days}:{include_internal}"

    def _get_cached(self, key: str) -> list[StockMovement] | None:
        cached = self._cache.get(key)
        if cached is None:
            return None
        movements, ts = cached
        if time.time() - ts > self._cache_ttl:
            del self._cache[key]
            return None
        return movements

    def reconstituer_stock(
        self,
        itmref: str,
        horizon_days: int = 45,
        include_internal: bool = False,
        stock_actuel: float = 0.0,
        include_stock_q: bool = False,
    ) -> list[StockMovement]:
        key = f"{itmref}:{horizon_days}:{include_internal}:{include_stock_q}"
        cached = self._get_cached(key)
        if cached is not None:
            return cached
        raw = self._fetch_mouvements(itmref, horizon_days, include_internal)
        result = self.reconstituer_stock_from_raw(itmref, raw, stock_actuel)
        self._cache[key] = (result, time.time())
        return result

    @staticmethod
    def _supprimer_annulations(mouvements: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Retire les paires (entrée + annulation) d'un même VCRNUM.

        Si un VCRNUM a une ligne qtystu=+X et une qtystu=-X, les deux sont retirées.
        """
        from collections import defaultdict

        def _get(m: dict, key: str) -> Any:
            return m.get(key.upper()) or m.get(key.lower()) or m.get(key, "")

        by_vcrnum: dict[str, list[int]] = defaultdict(list)
        for i, m in enumerate(mouvements):
            vcr = str(_get(m, "VCRNUM"))
            if vcr:
                by_vcrnum[vcr].append(i)

        removed: set[int] = set()
        for vcr, indices in by_vcrnum.items():
            if len(indices) < 2:
                continue
            positives: list[tuple[int, float]] = []
            negatives: list[tuple[int, float]] = []
            for i in indices:
                q = float(_get(mouvements[i], "QTYSTU") or 0)
                if q > 0:
                    positives.append((i, q))
                elif q < 0:
                    negatives.append((i, abs(q)))

            matched: set[int] = set()
            for pi, pq in positives:
                for ni, nq in negatives:
                    if ni in matched:
                        continue
                    if abs(pq - nq) < 0.001:
                        matched.add(pi)
                        matched.add(ni)
                        break
            removed.update(matched)

        return [m for i, m in enumerate(mouvements) if i not in removed]

    def reconstituer_stock_from_raw(
        self,
        itmref: str,
        raw_mouvements: list[dict[str, Any]],
        stock_actuel: float = 0.0,
    ) -> list[StockMovement]:
        def _get(m: dict, key: str) -> Any:
            return m.get(key.upper()) or m.get(key.lower()) or m.get(key, "")

        cleaned = self._supprimer_annulations(raw_mouvements)

        # Tri stable: MVTSEQ asc puis IPTDAT desc (les plus récents d'abord, seq croissante)
        sorted_mvts = sorted(cleaned, key=lambda m: int(_get(m, "MVTSEQ") or 0))
        sorted_mvts.sort(key=lambda m: _get(m, "IPTDAT"), reverse=True)

        stock_courant = stock_actuel
        result: list[StockMovement] = []

        for m in sorted_mvts:
            qtystu = float(_get(m, "QTYSTU") or 0)
            stock_apres = stock_courant
            stock_avant = stock_courant - qtystu
            stock_courant = stock_avant

            result.append(StockMovement(
                iptdat=str(_get(m, "IPTDAT")),
                itmref=itmref,
                qtystu=qtystu,
                trstyp=int(_get(m, "TRSTYP") or 0),
                vcrnum=str(_get(m, "VCRNUM")),
                vcrnumori=str(_get(m, "VCRNUMORI")),
                loc=str(_get(m, "LOC")),
                creusr=str(_get(m, "CREUSR")),
                stock_avant=stock_avant,
                stock_apres=stock_apres,
                mvtseq=int(_get(m, "MVTSEQ") or 0),
            ))

        result.sort(key=lambda m: (m.iptdat, m.mvtseq))
        return result

    def calculer_stats(self, mouvements: list[StockMovement]) -> StockAnalytics:
        if not mouvements:
            return StockAnalytics(
                article="",
                stock_min=0.0,
                stock_max=0.0,
                stock_moyen=0.0,
                rotation=0.0,
                tendance="stable",
                nombre_mouvements=0,
            )

        stock_apres_list = [m.stock_apres for m in mouvements]
        stock_min = min(stock_apres_list)
        stock_max = max(stock_apres_list)
        stock_moyen = sum(stock_apres_list) / len(stock_apres_list)

        sorties = sum(abs(m.qtystu) for m in mouvements if m.qtystu < 0)
        rotation = (sorties / stock_moyen) if stock_moyen > 0 else 0.0

        tendance = self._calculer_tendance(stock_apres_list)

        return StockAnalytics(
            article=mouvements[0].itmref,
            stock_min=stock_min,
            stock_max=stock_max,
            stock_moyen=stock_moyen,
            rotation=rotation,
            tendance=tendance,
            nombre_mouvements=len(mouvements),
            periode_debut=mouvements[0].iptdat,
            periode_fin=mouvements[-1].iptdat,
        )

    def _calculer_tendance(self, values: list[float]) -> str:
        if len(values) < 2:
            return "stable"

        n = len(values)
        x = list(range(n))
        x_mean = sum(x) / n
        y_mean = sum(values) / n

        num = sum((x[i] - x_mean) * (values[i] - y_mean) for i in range(n))
        den = sum((x[i] - x_mean) ** 2 for i in range(n))

        if den == 0:
            return "stable"

        pente = num / den
        seuil = max(abs(y_mean), 1e-9) * 0.01

        if pente > seuil:
            return "croissante"
        elif pente < -seuil:
            return "décroissante"
        return "stable"
