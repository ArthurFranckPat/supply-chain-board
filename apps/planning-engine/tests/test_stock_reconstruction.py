"""Tests pour la reconstitution des stocks à partir des mouvements STOJOU."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from planning_engine.services.stock_history_analyzer import (
    StockHistoryAnalyzer,
)


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def mouvements_factices():
    """Historique factice pour un article (ordre quelconque).

    Scénario :
      - Jour 1 : entrée de 100 (stock → 100)
      - Jour 2 : sortie de 30  (stock → 70)
      - Jour 3 : entrée de 50   (stock → 120)
      - Jour 4 : sortie de 20   (stock → 100)

    Stock actuel = 100
    """
    today = date.today()
    j1 = (today - timedelta(days=3)).isoformat()
    j2 = (today - timedelta(days=2)).isoformat()
    j3 = (today - timedelta(days=1)).isoformat()
    j4 = today.isoformat()

    return [
        {"iptdat": j1, "itmref": "ART001", "qtystu": 100.0, "trstyp": 1,  "vcrnum": "RC001", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 10},
        {"iptdat": j2, "itmref": "ART001", "qtystu": -30.0, "trstyp": 2,  "vcrnum": "BL001", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 20},
        {"iptdat": j3, "itmref": "ART001", "qtystu": 50.0,  "trstyp": 1,  "vcrnum": "RC002", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 30},
        {"iptdat": j4, "itmref": "ART001", "qtystu": -20.0, "trstyp": 2,  "vcrnum": "BL002", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 40},
    ]


@pytest.fixture
def analyzer():
    """Instance de l'analyseur sans cache."""
    return StockHistoryAnalyzer()


# ─── Tests reconstitution ────────────────────────────────────────────────────

class TestReconstitutionStock:
    """Teste le calcul de stock_avant / stock_apres sur un historique factice."""

    def test_reconstituer_stock_empty(self, analyzer):
        """Aucun mouvement → liste vide."""
        result = analyzer.reconstituer_stock_from_raw("ART999", [], stock_actuel=0.0)
        assert result == []

    def test_reconstituer_stock_single_entry(self, analyzer):
        """Un seul mouvement (entrée de 100), stock actuel = 100."""
        today = date.today().isoformat()
        raw = [{"iptdat": today, "itmref": "ART001", "qtystu": 100.0, "trstyp": 1, "vcrnum": "RC001", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 10}]
        result = analyzer.reconstituer_stock_from_raw("ART001", raw, stock_actuel=100.0)

        assert len(result) == 1
        assert result[0].stock_avant == 0.0
        assert result[0].stock_apres == 100.0

    def test_reconstituer_stock_sequence(self, analyzer, mouvements_factices):
        """Séquence complète : 100 → 70 → 120 → 100."""
        result = analyzer.reconstituer_stock_from_raw("ART001", mouvements_factices, stock_actuel=100.0)

        assert len(result) == 4

        # Jour 1 : entrée 100
        assert result[0].stock_avant == 0.0
        assert result[0].stock_apres == 100.0
        assert result[0].qtystu == 100.0

        # Jour 2 : sortie 30
        assert result[1].stock_avant == 100.0
        assert result[1].stock_apres == 70.0
        assert result[1].qtystu == -30.0

        # Jour 3 : entrée 50
        assert result[2].stock_avant == 70.0
        assert result[2].stock_apres == 120.0
        assert result[2].qtystu == 50.0

        # Jour 4 : sortie 20
        assert result[3].stock_avant == 120.0
        assert result[3].stock_apres == 100.0
        assert result[3].qtystu == -20.0

    def test_reconstituer_stock_preserves_itmref(self, analyzer):
        """L'itmref de l'article est préservée dans chaque mouvement."""
        today = date.today().isoformat()
        raw = [
            {"iptdat": today, "itmref": "11035404", "qtystu": 10.0, "trstyp": 1, "vcrnum": "RC001", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 10},
        ]
        result = analyzer.reconstituer_stock_from_raw("11035404", raw, stock_actuel=10.0)
        assert all(m.itmref == "11035404" for m in result)

    def test_reconstituer_stock_unordered_input(self, analyzer):
        """L'algorithme trie correctement même si les données sont en désordre."""
        today = date.today()
        raw = [
            {"iptdat": today.isoformat(), "itmref": "ART001", "qtystu": -20.0, "trstyp": 2, "vcrnum": "BL", "vcrnumori": "", "loc": "M", "creusr": "A", "mvtseq": 40},
            {"iptdat": (today - timedelta(days=2)).isoformat(), "itmref": "ART001", "qtystu": -30.0, "trstyp": 2, "vcrnum": "BL", "vcrnumori": "", "loc": "M", "creusr": "A", "mvtseq": 20},
            {"iptdat": (today - timedelta(days=1)).isoformat(), "itmref": "ART001", "qtystu": 50.0, "trstyp": 1, "vcrnum": "RC", "vcrnumori": "", "loc": "M", "creusr": "A", "mvtseq": 30},
            {"iptdat": (today - timedelta(days=3)).isoformat(), "itmref": "ART001", "qtystu": 100.0, "trstyp": 1, "vcrnum": "RC", "vcrnumori": "", "loc": "M", "creusr": "A", "mvtseq": 10},
        ]
        result = analyzer.reconstituer_stock_from_raw("ART001", raw, stock_actuel=100.0)

        assert result[0].stock_avant == 0.0
        assert result[0].stock_apres == 100.0
        assert result[3].stock_avant == 120.0
        assert result[3].stock_apres == 100.0


# ─── Tests statistiques ───────────────────────────────────────────────────────

class TestStockAnalytics:
    """Teste le calcul des indicateurs descriptifs."""

    def test_calculer_stats_empty(self, analyzer):
        """Aucun mouvement → Stats avec valeurs nulles/None."""
        stats = analyzer.calculer_stats([])
        assert stats.stock_min == 0.0
        assert stats.stock_max == 0.0
        assert stats.stock_moyen == 0.0
        assert stats.nombre_mouvements == 0

    def test_calculer_stats_single(self, analyzer):
        """Un seul mouvement : min=max=moyen=stock_apres."""
        today = date.today().isoformat()
        raw = [{"iptdat": today, "itmref": "ART001", "qtystu": 50.0, "trstyp": 1, "vcrnum": "RC001", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 10}]
        mouvements = analyzer.reconstituer_stock_from_raw("ART001", raw, stock_actuel=50.0)
        stats = analyzer.calculer_stats(mouvements)

        assert stats.stock_min == 50.0
        assert stats.stock_max == 50.0
        assert stats.stock_moyen == 50.0
        assert stats.nombre_mouvements == 1

    def test_calculer_stats_sequence(self, analyzer, mouvements_factices):
        """Stats sur la séquence : min=70, max=120, moy=97.5, rotation=0.51."""
        mouvements = analyzer.reconstituer_stock_from_raw("ART001", mouvements_factices, stock_actuel=100.0)
        stats = analyzer.calculer_stats(mouvements)

        assert stats.stock_min == 70.0
        assert stats.stock_max == 120.0
        assert stats.stock_moyen == pytest.approx(97.5)
        # Rotation = sorties / stock_moyen = (30+20)/97.5
        assert stats.rotation == pytest.approx((30 + 20) / 97.5)
        assert stats.nombre_mouvements == 4

    def test_tendance_croissante(self, analyzer):
        """Stock qui augmente → tendance croissante."""
        today = date.today()
        raw = [
            {"iptdat": (today - timedelta(days=2)).isoformat(), "itmref": "ART001", "qtystu": 10.0, "trstyp": 1, "vcrnum": "RC01", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 10},
            {"iptdat": (today - timedelta(days=1)).isoformat(), "itmref": "ART001", "qtystu": 10.0, "trstyp": 1, "vcrnum": "RC02", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 20},
            {"iptdat": today.isoformat(), "itmref": "ART001", "qtystu": 10.0, "trstyp": 1, "vcrnum": "RC03", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 30},
        ]
        mouvements = analyzer.reconstituer_stock_from_raw("ART001", raw, stock_actuel=30.0)
        stats = analyzer.calculer_stats(mouvements)
        assert stats.tendance == "croissante"

    def test_tendance_decroissante(self, analyzer):
        """Stock qui diminue → tendance décroissante."""
        today = date.today()
        raw = [
            {"iptdat": (today - timedelta(days=2)).isoformat(), "itmref": "ART001", "qtystu": 100.0, "trstyp": 1, "vcrnum": "RC01", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 10},
            {"iptdat": (today - timedelta(days=1)).isoformat(), "itmref": "ART001", "qtystu": -60.0, "trstyp": 2, "vcrnum": "BL01", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 20},
            {"iptdat": today.isoformat(), "itmref": "ART001", "qtystu": -30.0, "trstyp": 2, "vcrnum": "BL02", "vcrnumori": "", "loc": "MAIN", "creusr": "ADMIN", "mvtseq": 30},
        ]
        mouvements = analyzer.reconstituer_stock_from_raw("ART001", raw, stock_actuel=10.0)
        stats = analyzer.calculer_stats(mouvements)
        assert stats.tendance == "décroissante"


# ─── Tests intégration X3Client (mock) ──────────────────────────────────────

class TestStockHistoryAnalyzerIntegration:
    """Teste le flux complet avec X3Client mocké."""

    def test_reconstituer_stock_with_mocked_x3(self, analyzer, mocker):
        """X3Client query_all renvoie des mouvements bruts → reconstituer."""
        today = date.today()
        mock_response = [
            {"IPTDAT": today.isoformat(), "ITMREF": "11035404", "QTYSTU": 200.0, "TRSTYP": 1, "VCRNUM": "RC001", "VCRNUMORI": "", "LOC": "MAIN", "CREUSR": "ADMIN", "MVTSEQ": 10},
        ]

        mocker.patch.object(analyzer, "_fetch_mouvements", return_value=mock_response)

        result = analyzer.reconstituer_stock("11035404", stock_actuel=200.0)
        assert len(result) == 1
        assert result[0].stock_avant == 0.0
        assert result[0].stock_apres == 200.0
