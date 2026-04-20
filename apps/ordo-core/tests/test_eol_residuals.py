"""Tests pour le service EOL Residual Stock Analysis."""

import pytest
from datetime import date

from src.checkers.eol_residuals import EolResidualsService
from src.checkers.eol_residuals_models import (
    EolResidualsRequest,
    EolResidualsResult,
)
from src.models.article import Article, TypeApprovisionnement
from src.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle
from src.models.stock import Stock


# ── Helpers ──────────────────────────────────────────────────────────


def _make_article(code, type_appro=TypeApprovisionnement.ACHAT):
    return Article(
        code=code,
        description=f"Desc {code}",
        categorie="AP",
        type_appro=type_appro,
        delai_reappro=28,
    )


def _make_pf(code, famille_produit=""):
    return Article(
        code=code,
        description=f"PF {code}",
        categorie="PF",
        type_appro=TypeApprovisionnement.FABRICATION,
        delai_reappro=28,
        famille_produit=famille_produit,
    )


def _make_entry(parent, composant, qte=1.0, type_article=TypeArticle.ACHETE):
    return NomenclatureEntry(
        article_parent=parent,
        designation_parent=parent,
        niveau=10,
        article_composant=composant,
        designation_composant=composant,
        qte_lien=qte,
        type_article=type_article,
    )


def _make_stock(article, physique=100, alloue=0, bloque=0):
    return Stock(
        article=article,
        stock_physique=physique,
        stock_alloue=alloue,
        stock_bloque=bloque,
    )


# ── Fixtures ─────────────────────────────────────────────────────────


class FakeLoader:
    def __init__(self, articles=None, stocks=None, nomenclatures=None):
        self.articles = {a.code: a for a in (articles or [])}
        self.stocks = {s.article: s for s in (stocks or [])}
        self.nomenclatures = nomenclatures or {}

    def get_article(self, code):
        return self.articles.get(code)

    def get_stock(self, code):
        return self.stocks.get(code)

    def get_nomenclature(self, code):
        return self.nomenclatures.get(code)


# ── Tests ────────────────────────────────────────────────────────────


class TestEolResidualsService:
    def test_request_validation_both_empty_raises(self):
        """Cas 7 — familles et prefixes vides → ValueError."""
        loader = FakeLoader()
        service = EolResidualsService(loader)
        with pytest.raises(ValueError):
            service.analyze(familles=[], prefixes=[])

    def test_single_pf_achat_component_included(self):
        """Cas 1 — PF unique, composant ACHAT sans usage hors périmètre → inclus."""
        # PF1 (famille FAM-EOL) → C1 (ACHAT)
        loader = FakeLoader(
            articles=[_make_pf("PF1", famille_produit="FAM-EOL"), _make_article("C1")],
            stocks=[_make_stock("C1", physique=50)],
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1",
                    designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=2.0)],
                ),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(
            familles=["FAM-EOL"],
            prefixes=[],
            stock_mode="physical",
            bom_depth_mode="full",
        )
        assert result.summary.target_pf_count == 1
        assert result.summary.unique_component_count == 1
        assert len(result.components) == 1
        assert result.components[0].article == "C1"

    def test_multi_famille_same_component_unique_in_perimeter(self):
        """Cas 2 — Composant partagé entre familles sélectionnées → unique (inclus une fois)."""
        # FAM-A: PF1→C1, FAM-B: PF2→C1, C1 n'est utilisé que par PF1 et PF2
        loader = FakeLoader(
            articles=[_make_pf("PF1", "FAM-A"), _make_pf("PF2", "FAM-B"), _make_article("C1")],
            stocks=[_make_stock("C1", physique=30)],
            nomenclatures={
                "PF1": Nomenclature(article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0)]),
                "PF2": Nomenclature(article="PF2", designation="PF2",
                    composants=[_make_entry("PF2", "C1", qte=1.0)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(
            familles=["FAM-A", "FAM-B"],
            prefixes=[],
            stock_mode="physical",
            bom_depth_mode="full",
        )
        # C1 doit apparaître une seule fois
        assert result.summary.unique_component_count == 1
        assert len(result.components) == 1

    def test_component_used_outside_perimeter_excluded(self):
        """Cas 3 — Composant aussi utilisé par PF hors périmètre → exclu."""
        # FAM-A: PF1→C1, FAM-C (hors périmètre): PF3→C1
        loader = FakeLoader(
            articles=[_make_pf("PF1", "FAM-A"), _make_pf("PF3", "FAM-C"), _make_article("C1")],
            stocks=[_make_stock("C1", physique=50)],
            nomenclatures={
                "PF1": Nomenclature(article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0)]),
                "PF3": Nomenclature(article="PF3", designation="PF3",
                    composants=[_make_entry("PF3", "C1", qte=1.0)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(
            familles=["FAM-A"],
            prefixes=[],
            stock_mode="physical",
            bom_depth_mode="full",
        )
        # C1 exclu car aussi utilisé par PF3 (hors périmètre)
        assert result.summary.unique_component_count == 0
        assert len(result.components) == 0

    def test_bom_depth_mode_level1_vs_full(self):
        """Cas 4 — level1: only direct components; full: also deep FAB sub-components."""
        # PF1 (FAB) → C1 (FAB) → C2 (ACHAT)
        loader = FakeLoader(
            articles=[
                _make_pf("PF1", "FAM-EOL"),
                _make_article("C1", type_appro=TypeApprovisionnement.FABRICATION),
                _make_article("C2"),
            ],
            stocks=[_make_stock("C1", physique=10), _make_stock("C2", physique=20)],
            nomenclatures={
                "PF1": Nomenclature(article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0, type_article=TypeArticle.FABRIQUE)]),
                "C1": Nomenclature(article="C1", designation="C1",
                    composants=[_make_entry("C1", "C2", qte=1.0, type_article=TypeArticle.ACHETE)]),
            },
        )
        service = EolResidualsService(loader)

        result_level1 = service.analyze(familles=["FAM-EOL"], prefixes=[], stock_mode="physical", bom_depth_mode="level1")
        # level1: direct children only, no recursion. PF1→C1 (FAB) is direct → included.
        assert result_level1.summary.unique_component_count == 1
        assert result_level1.components[0].article == "C1"

        result_full = service.analyze(familles=["FAM-EOL"], prefixes=[], stock_mode="physical", bom_depth_mode="full")
        # Full recurses into C1 (FAB), finds C2 (ACHAT). Both C1 and C2 are used only by target PF.
        # level1 mode: PF1→C1 only (C1 is FAB, no recursion).
        # full mode: PF1→C1→C2 (C2 is ACHAT, recursion stops here).
        # C1 should be included (FAB component of PF1), C2 should be included (ACHAT component reached via recursion).
        # Both used only by target PF → both unique → unique_component_count == 2
        assert result_full.summary.unique_component_count == 2, f"Expected 2, got {result_full.summary.unique_component_count}: {[c.article for c in result_full.components]}"
        component_articles = {c.article for c in result_full.components}
        assert component_articles == {"C1", "C2"}

    def test_stock_mode_physical_vs_net_releaseable(self):
        """Cas 5 — physical: stock_physique; net_releaseable: physique + bloque - alloue."""
        loader = FakeLoader(
            articles=[_make_pf("PF1", "FAM-EOL"), _make_article("C1")],
            stocks=[_make_stock("C1", physique=100, alloue=30, bloque=10)],
            nomenclatures={
                "PF1": Nomenclature(article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0)]),
            },
        )
        service = EolResidualsService(loader)

        result_physical = service.analyze(familles=["FAM-EOL"], prefixes=[], stock_mode="physical", bom_depth_mode="full")
        assert result_physical.components[0].stock_qty == 100

        result_net = service.analyze(familles=["FAM-EOL"], prefixes=[], stock_mode="net_releaseable", bom_depth_mode="full")
        assert result_net.components[0].stock_qty == 80  # 100 + 10 - 30

    def test_pmp_missing_value_zero_with_warning(self):
        """Cas 6 — PMP manquant → value=0 + warning."""
        loader = FakeLoader(
            articles=[_make_pf("PF1", "FAM-EOL"), _make_article("C1")],
            stocks=[_make_stock("C1", physique=50)],
            nomenclatures={
                "PF1": Nomenclature(article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=["FAM-EOL"], prefixes=[], stock_mode="physical", bom_depth_mode="full")
        assert result.components[0].pmp == 0.0
        assert result.components[0].value == 0.0
        assert any("pmp" in w.lower() or "PMP" in w for w in result.warnings)

    def test_no_matching_famille_returns_empty_with_warning(self):
        """Cas 8 — Aucune famille ne correspond → components=[], warning."""
        loader = FakeLoader(
            articles=[_make_pf("PF1", "FAM-EOL"), _make_article("C1")],
            stocks=[_make_stock("C1", physique=50)],
            nomenclatures={
                "PF1": Nomenclature(article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=["FAM-INEXISTANTE"], prefixes=[], stock_mode="physical", bom_depth_mode="full")
        assert result.summary.target_pf_count == 0
        assert result.summary.unique_component_count == 0
        assert len(result.components) == 0
        assert len(result.warnings) > 0

    def test_summary_counts_are_consistent(self):
        """Cas 9 — Vérifie cohérence des totaux dans summary."""
        loader = FakeLoader(
            articles=[_make_pf("PF1", "FAM-A"), _make_pf("PF2", "FAM-B"), _make_article("C1"), _make_article("C2")],
            stocks=[_make_stock("C1", physique=10), _make_stock("C2", physique=20)],
            nomenclatures={
                "PF1": Nomenclature(article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0)]),
                "PF2": Nomenclature(article="PF2", designation="PF2",
                    composants=[_make_entry("PF2", "C2", qte=1.0)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=["FAM-A", "FAM-B"], prefixes=[], stock_mode="physical", bom_depth_mode="full")
        assert result.summary.target_pf_count == 2
        assert result.summary.unique_component_count == 2
        assert result.summary.total_stock_qty == 30  # 10 + 20
        assert len(result.components) == 2
