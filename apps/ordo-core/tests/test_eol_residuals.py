"""Tests pour le service EOL Residual Stock Analysis."""

import pytest
from types import SimpleNamespace
from datetime import date

from erp_data_access.models.article import Article, TypeApprovisionnement
from erp_data_access.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle, NatureConsommation
from erp_data_access.models.stock import Stock

from src.services.eol_residuals import EolResidualsService
from src.services.eol_residuals_models import EolResidualsResponse


# ── Helpers ────────────────────────────────────────────────────


def _make_article(code, description="Test", type_appro=TypeApprovisionnement.ACHAT,
                 categorie="AP", famille_produit=None, pmp=None):
    return Article(
        code=code,
        description=description,
        categorie=categorie,
        type_appro=type_appro,
        delai_reappro=28,
        famille_produit=famille_produit,
        pmp=pmp,
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
        nature_consommation=NatureConsommation.PROPORTIONNEL,
    )


def _make_nom(article, composants):
    return Nomenclature(article=article, designation=article, composants=composants)


def _make_stock(article, physique=100, alloue=0, bloque=0):
    return Stock(article=article, stock_physique=physique, stock_alloue=alloue, stock_bloque=bloque)


def _make_loader(**overrides):
    defaults = {
        "articles": {},
        "nomenclatures": {},
        "stocks": {},
    }
    defaults.update(overrides)
    loader = SimpleNamespace(**defaults)
    loader.get_article = lambda code: defaults["articles"].get(code)
    loader.get_nomenclature = lambda code: defaults["nomenclatures"].get(code)
    loader.get_stock = lambda code: defaults["stocks"].get(code)
    return loader


# ── Tests: Selection PF cibles ─────────────────────────────────


class TestTargetPfSelection:

    def test_empty_perimeter_returns_empty_result(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION, famille_produit="CLIM"),
            },
            nomenclatures={},
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=["CHAUFFAGE"], prefixes=[])

        assert result.summary.target_pf_count == 0
        assert result.summary.unique_component_count == 0
        assert any("produit fini cible" in w for w in result.warnings)

    def test_filters_by_famille(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION, famille_produit="CLIM"),
                "PF002": _make_article("PF002", type_appro=TypeApprovisionnement.FABRICATION, famille_produit="CHAUFFAGE"),
            },
            nomenclatures={},
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=["CLIM"], prefixes=[])

        assert result.summary.target_pf_count == 1
        assert "PF001" not in result.warnings

    def test_filters_by_prefix(self):
        loader = _make_loader(
            articles={
                "CLIM001": _make_article("CLIM001", type_appro=TypeApprovisionnement.FABRICATION),
                "CHAUF001": _make_article("CHAUF001", type_appro=TypeApprovisionnement.FABRICATION),
            },
            nomenclatures={},
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["CLIM"])

        assert result.summary.target_pf_count == 1

    def test_combines_famille_and_prefix(self):
        loader = _make_loader(
            articles={
                "CLIM001": _make_article("CLIM001", type_appro=TypeApprovisionnement.FABRICATION, famille_produit="CLIM"),
                "CLIM002": _make_article("CLIM002", type_appro=TypeApprovisionnement.FABRICATION, famille_produit="CHAUFFAGE"),
            },
            nomenclatures={},
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=["CLIM"], prefixes=["CLIM"])

        assert result.summary.target_pf_count == 2  # OR logic: CLIM001 (fam) + CLIM002 (prefix)

    def test_warns_unmatched_famille(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION, famille_produit="CLIM"),
            },
            nomenclatures={},
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=["INCONNUE"], prefixes=[])

        assert any("INCONNUE" in w for w in result.warnings)

    def test_warns_unmatched_prefix(self):
        loader = _make_loader(
            articles={
                "CLIM001": _make_article("CLIM001", type_appro=TypeApprovisionnement.FABRICATION),
            },
            nomenclatures={},
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["INCONNU"])

        assert any("INCONNU" in w for w in result.warnings)


# ── Tests: Decomposition nomenclature ──────────────────────────


class TestBomExplosion:

    def test_single_level_bom_level1(self):
        """PF001 -> COMP-A (achat). Mode level1 = pas dexpansion recursive."""
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"], bom_depth_mode="level1")

        assert result.summary.unique_component_count == 1
        assert result.components[0].component_code == "COMPA"

    def test_single_level_bom_full(self):
        """PF001 -> COMPA (achat). Mode full = meme resultat pour achat."""
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"], bom_depth_mode="full")

        assert result.summary.unique_component_count == 1

    def test_two_level_bom_full(self):
        """PF001 -> SOUS-ENS (fabrique) -> COMPA (achat). Mode full doit expand."""
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "SOUSENS": _make_article("SOUSENS", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "SOUSENS", type_article=TypeArticle.FABRIQUE)]),
                "SOUSENS": _make_nom("SOUSENS", [_make_entry("SOUSENS", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"], bom_depth_mode="full")

        # COMPA est trouve via expansion recursive
        codes = {c.component_code for c in result.components}
        assert "COMPA" in codes
        # SOUS-ENS est aussi un composant (fabrique) - non unique donc filtre
        # Mais en mode level1 SOUS-ENS serait present seul
        # En mode full, on ne garde que les composants ACHAT (leaf nodes)
        # resultats dependent de la logique _is_unique_to_perimeter

    def test_circular_reference_prevented(self):
        """PF001 -> PF002 -> PF001. Doit戒备er la recursion infinie."""
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "PF002": _make_article("PF002", type_appro=TypeApprovisionnement.FABRICATION),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "PF002", type_article=TypeArticle.FABRIQUE)]),
                "PF002": _make_nom("PF002", [_make_entry("PF002", "PF001", type_article=TypeArticle.FABRIQUE)]),
            },
        )
        service = EolResidualsService(loader)
        # Ne doit pas boucler indefiniment
        result = service.analyze(familles=[], prefixes=["PF001"], bom_depth_mode="full")

        assert result.summary.target_pf_count == 1


# ── Tests: Uniqueness filter ───────────────────────────────────


class TestUniquenessFilter:

    def test_component_used_only_by_target_pf_is_unique(self):
        """COMPA n'est utilise que par PF001 (cible) -> doit etre garde."""
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"])

        assert result.summary.unique_component_count == 1
        assert result.components[0].component_code == "COMPA"

    def test_component_used_by_non_target_pf_is_excluded(self):
        """COMPA est utilise par PF001 (cible) ET PF002 (hors perimetre) -> exclus."""
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "PF002": _make_article("PF002", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE)]),
                "PF002": _make_nom("PF002", [_make_entry("PF002", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"])

        assert result.summary.unique_component_count == 0
        assert result.components == []

    def test_two_target_pfs_share_component_is_unique(self):
        """COMPA est utilise par PF001 ET PF002 (les deux cibles) -> garde."""
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "PF002": _make_article("PF002", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE)]),
                "PF002": _make_nom("PF002", [_make_entry("PF002", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001", "PF002"])

        assert result.summary.unique_component_count == 1


# ── Tests: Stock et valorisation ───────────────────────────────


class TestStockAndValuation:

    def test_stock_physical_mode(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT, pmp=10.0),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
            stocks={"COMPA": _make_stock("COMPA", physique=50)},
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"], stock_mode="physical")

        comp = result.components[0]
        assert comp.stock_qty == 50.0
        assert comp.pmp == 10.0
        assert comp.value == 500.0

    def test_stock_net_releaseable_mode(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT, pmp=10.0),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
            stocks={"COMPA": _make_stock("COMPA", physique=100, alloue=30, bloque=10)},
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"], stock_mode="net_releaseable")

        # net = physique + bloque - alloue = 100 + 10 - 30 = 80
        comp = result.components[0]
        assert comp.stock_qty == 80.0

    def test_missing_pmp_warns(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT, pmp=None),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
            stocks={"COMPA": _make_stock("COMPA", physique=50)},
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"])

        assert any("PMP manquant" in w for w in result.warnings)
        assert result.components[0].pmp == 0.0

    def test_no_stock_returns_zero_qty(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT, pmp=5.0),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
            stocks={},  # pas de stock
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"])

        assert result.components[0].stock_qty == 0.0
        assert result.components[0].value == 0.0

    def test_total_summary_accumulates_correctly(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT, pmp=10.0),
                "COMPB": _make_article("COMPB", type_appro=TypeApprovisionnement.ACHAT, pmp=20.0),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [
                    _make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE),
                    _make_entry("PF001", "COMPB", type_article=TypeArticle.ACHETE),
                ]),
            },
            stocks={
                "COMPA": _make_stock("COMPA", physique=10),
                "COMPB": _make_stock("COMPB", physique=5),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"])

        # COMPA: 10 * 10 = 100, COMPB: 5 * 20 = 100
        assert result.summary.total_value == 200.0
        assert result.summary.total_stock_qty == 15.0


# ── Tests: Component type ───────────────────────────────────────


class TestComponentType:

    def test_achat_component_type(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"])

        assert result.components[0].component_type == "ACHAT"

    def test_fabrication_component_type(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "FAB001": _make_article("FAB001", type_appro=TypeApprovisionnement.FABRICATION),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "FAB001", type_article=TypeArticle.FABRIQUE)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"], bom_depth_mode="level1")

        assert result.components[0].component_type == "FABRICATION"


# ── Tests: Sorting ─────────────────────────────────────────────


class TestSorting:

    def test_components_sorted_by_value_desc(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT, pmp=100.0),
                "COMPB": _make_article("COMPB", type_appro=TypeApprovisionnement.ACHAT, pmp=10.0),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [
                    _make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE),
                    _make_entry("PF001", "COMPB", type_article=TypeArticle.ACHETE),
                ]),
            },
            stocks={
                "COMPA": _make_stock("COMPA", physique=1),
                "COMPB": _make_stock("COMPB", physique=1),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001"])

        assert result.components[0].component_code == "COMPA"  # 100 > 10
        assert result.components[1].component_code == "COMPB"


# ── Tests: used_by_target_pf_count ─────────────────────────────


class TestUsedByCount:

    def test_count_reflects_shared_components(self):
        loader = _make_loader(
            articles={
                "PF001": _make_article("PF001", type_appro=TypeApprovisionnement.FABRICATION),
                "PF002": _make_article("PF002", type_appro=TypeApprovisionnement.FABRICATION),
                "COMPA": _make_article("COMPA", type_appro=TypeApprovisionnement.ACHAT),
            },
            nomenclatures={
                "PF001": _make_nom("PF001", [_make_entry("PF001", "COMPA", type_article=TypeArticle.ACHETE)]),
                "PF002": _make_nom("PF002", [_make_entry("PF002", "COMPA", type_article=TypeArticle.ACHETE)]),
            },
        )
        service = EolResidualsService(loader)
        result = service.analyze(familles=[], prefixes=["PF001", "PF002"])

        comp = result.components[0]
        assert comp.used_by_target_pf_count == 2
