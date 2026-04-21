"""Analyse de l'historique des stocks Sage X3 (table STOJOU).

Réconstitue le stock article par article à partir des mouvements,
calcule les indicateurs descriptifs.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

from .x3_client import X3Client
from .x3_parser import STOJOU_FIELDS, parse_resources


# ─── Modèle ───────────────────────────────────────────────────────────────────

@dataclass
class StockMovement:
    """Un mouvement de stock avec stock avant/après calculés."""
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


@dataclass
class StockAnalytics:
    """Indicateurs descriptifs d'un historique de stock."""
    article: str
    stock_min: float
    stock_max: float
    stock_moyen: float
    rotation: float
    tendance: str
    nombre_mouvements: int
    periode_debut: str | None = None
    periode_fin: str | None = None


# ─── Analyseur ────────────────────────────────────────────────────────────────

class StockHistoryAnalyzer:
    """Reconstitue et analyse l'historique des stocks.

    Méthode principale :
      1. Récupère les mouvements via X3Client (query_all STOJOU)
      2. Trie par date croissante (IPTDAT asc, MVTSEQ asc)
      3. Itère pour calculer stock_avant / stock_apres
      4. Calcule les stats descriptives
    """

    def __init__(self, cache_ttl: float = 60.0):
        self._cache: dict[str, tuple[list[StockMovement], float]] = {}
        self._cache_ttl = cache_ttl

    # ── Accès X3 ────────────────────────────────────────────────────────────

    def _fetch_mouvements(
        self,
        itmref: str,
        horizon_days: int = 45,
        include_internal: bool = False,
        all_pages: bool = True,
    ) -> list[dict[str, Any]]:
        """Récupère les mouvements bruts depuis X3."""
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
            order_by="IPTDAT asc, MVTSEQ asc",
        )
        return parse_resources(resources, fields=STOJOU_FIELDS + ["MVTSEQ"])

    def _cache_key(self, itmref: str, horizon_days: int, include_internal: bool) -> str:
        return f"{itmref}:{horizon_days}:{include_internal}"

    def _get_cached(self, key: str) -> list[StockMovement] | None:
        cached = self._cache.get(key)
        if cached is None:
            return None
        movements, timestamp = cached
        if time.time() - timestamp > self._cache_ttl:
            del self._cache[key]
            return None
        return movements

    # ── Core algorithm ─────────────────────────────────────────────────────

    def reconstituer_stock(
        self,
        itmref: str,
        horizon_days: int = 45,
        include_internal: bool = False,
        all_pages: bool = True,
    ) -> list[StockMovement]:
        """API publique — fetch X3 + reconstitution avec cache."""
        key = self._cache_key(itmref, horizon_days, include_internal)
        cached = self._get_cached(key)
        if cached is not None:
            return cached

        raw = self._fetch_mouvements(itmref, horizon_days, include_internal, all_pages)
        result = self.reconstituer_stock_from_raw(itmref, raw)
        self._cache[key] = (result, time.time())
        return result

    def reconstituer_stock_from_raw(
        self,
        itmref: str,
        raw_mouvements: list[dict[str, Any]],
    ) -> list[StockMovement]:
        """Reconstitution pure — ne touche pas X3.

        Algorithme :
          1. Trier par IPTDAT asc, MVTSEQ asc
          2. stock_courant = 0
          3. Pour chaque mouvement : stock_avant = stock_courant,
             stock_apres = stock_courant + qtystu,
             stock_courant = stock_apres
        """
        # Normalise les clés en uppercase (X3 renvoie IPTDAT, les fixtures utilisent iptdat)
        def _norm(m: dict[str, Any], key: str) -> Any:
            return m.get(key.upper()) or m.get(key.lower()) or m.get(key, "")

        sorted_mvmts = sorted(
            raw_mouvements,
            key=lambda m: (_norm(m, "IPTDAT"), int(_norm(m, "MVTSEQ") or 0)),
        )

        stock_courant = 0.0
        result: list[StockMovement] = []

        for m in sorted_mvmts:
            qtystu = float(_norm(m, "QTYSTU") or 0)
            stock_avant = stock_courant
            stock_apres = stock_courant + qtystu
            stock_courant = stock_apres

            result.append(
                StockMovement(
                    iptdat=str(_norm(m, "IPTDAT")),
                    itmref=itmref,
                    qtystu=qtystu,
                    trstyp=int(_norm(m, "TRSTYP") or 0),
                    vcrnum=str(_norm(m, "VCRNUM")),
                    vcrnumori=str(_norm(m, "VCRNUMORI")),
                    loc=str(_norm(m, "LOC")),
                    creusr=str(_norm(m, "CREUSR")),
                    stock_avant=stock_avant,
                    stock_apres=stock_apres,
                )
            )

        return result

    # ── Statistiques ────────────────────────────────────────────────────────

    def calculer_stats(self, mouvements: list[StockMovement]) -> StockAnalytics:
        """Calcule les indicateurs descriptifs."""
        if not mouvements:
            return StockAnalytics(
                article=mouvements[0].itmref if mouvements else "",
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

        # Rotation = somme des sorties / stock moyen
        sorties = sum(abs(m.qtystu) for m in mouvements if m.qtystu < 0)
        rotation = (sorties / stock_moyen) if stock_moyen > 0 else 0.0

        # Tendance = régression linéaire simple sur stock_apres
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
        """Régression linéaire simple — renvoie 'croissante', 'décroissante' ou 'stable'."""
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
        y_scale = max(abs(y_mean), 1e-9)
        seuil = y_scale * 0.01

        if pente > seuil:
            return "croissante"
        elif pente < -seuil:
            return "décroissante"
        return "stable"
