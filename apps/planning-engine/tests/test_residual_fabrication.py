"""Tests pour le service de faisabilité de fabrication sur pool résiduel."""


from production_planning.feasibility.residual_fabrication import ResidualFabricationService
from production_planning.feasibility.eol_residuals_models import EolComponent
from production_planning.models.article import Article, TypeApprovisionnement
from production_planning.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle
from production_planning.models.stock import Stock


# ── Helpers ──────────────────────────────────────────────────────────────


def _make_article(code, type_appro=TypeApprovisionnement.ACHAT, categorie="AP"):
    return Article(
        code=code,
        description=f"Desc {code}",
        categorie=categorie,
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


def _make_stock(article, physique=100, alloue=0, sous_cq=0):
    return Stock(
        article=article,
        stock_physique=physique,
        stock_alloue=alloue,
        stock_sous_cq=sous_cq,
    )


def _eol_component(code, qty, pmp=1.0, component_type="ACHAT"):
    """Build an EolComponent as the service expects from residual pool."""
    return EolComponent(
        article=code,
        description=f"Desc {code}",
        component_type=component_type,
        used_by_target_pf_count=1,
        stock_qty=qty,
        pmp=pmp,
        value=round(qty * pmp, 2),
    )


# ── FakeLoader ────────────────────────────────────────────────────────────


class FakeLoader:
    def __init__(self, articles=None, stocks=None, nomenclatures=None, ofs=None, receptions=None):
        self.articles = {a.code: a for a in (articles or [])}
        self.stocks = {s.article: s for s in (stocks or [])}
        self.nomenclatures = nomenclatures or {}
        self.ofs = ofs or []
        self.receptions = receptions or []

    def get_article(self, code):
        return self.articles.get(code)

    def get_stock(self, code):
        return self.stocks.get(code)

    def get_nomenclature(self, code):
        return self.nomenclatures.get(code)

    def get_ofs_to_check(self):
        return [of for of in self.ofs if of.qte_restante > 0]

    def get_receptions(self, article):
        return [r for r in self.receptions if r.article == article]


# ── Tests ────────────────────────────────────────────────────────────────


class TestResidualFabricationService:
    """Tests for batch PF fabrication feasibility from residual stock pool."""

    # TC-1: Pool sufficient for single PF with one ACHAT component
    def test_tc1_pool_sufficient_single_achat(self):
        """Pool has C1 ACHAT qty=100, PF1 needs C1×2. PF1×10 is feasible."""
        loader = FakeLoader(
            articles=[
                _make_pf("PF1", famille_produit="FAM-EOL"),
                _make_article("C1"),
            ],
            stocks=[_make_stock("C1", physique=100)],
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1",
                    designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=2.0)],
                ),
            },
        )
        pool = [_eol_component("C1", qty=100)]
        service = ResidualFabricationService(loader, pool)
        results = service.check_all(pf_codes=["PF1"])

        pf1_result = next(r for r in results if r.pf_article == "PF1")
        assert pf1_result.feasible is True
        assert pf1_result.max_feasible_qty >= 10
        assert pf1_result.stock_gaps == []

    # TC-2: Pool insufficient
    def test_tc2_pool_insufficient(self):
        """Pool has C1 ACHAT qty=5, PF1 needs C1×2. PF1×10 NOT feasible."""
        loader = FakeLoader(
            articles=[_make_pf("PF1"), _make_article("C1")],
            stocks=[_make_stock("C1", physique=5)],
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=2.0)],
                ),
            },
        )
        pool = [_eol_component("C1", qty=5)]
        service = ResidualFabricationService(loader, pool)
        results = service.check_all(pf_codes=["PF1"], desired_qty=10)

        pf1_result = next(r for r in results if r.pf_article == "PF1")
        assert pf1_result.feasible is False
        assert pf1_result.max_feasible_qty == 2  # floor(5/2)

    # TC-3: Multi-level BOM — PF → FAB sub-assembly → ACHAT leaf
    def test_tc3_multi_level_bom(self):
        """Pool has C2 ACHAT qty=60. PF1 needs C1 FAB which needs C2×3. PF1×20 feasible."""
        loader = FakeLoader(
            articles=[
                _make_pf("PF1"),
                _make_article("C1", type_appro=TypeApprovisionnement.FABRICATION),
                _make_article("C2"),
            ],
            stocks=[_make_stock("C1", physique=10), _make_stock("C2", physique=60)],
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0, type_article=TypeArticle.FABRIQUE)],
                ),
                "C1": Nomenclature(
                    article="C1", designation="C1",
                    composants=[_make_entry("C1", "C2", qte=3.0)],
                ),
            },
        )
        pool = [_eol_component("C2", qty=60)]  # C2 (ACHAT) is in pool
        service = ResidualFabricationService(loader, pool)
        results = service.check_all(pf_codes=["PF1"])

        pf1_result = next(r for r in results if r.pf_article == "PF1")
        assert pf1_result.feasible is True
        assert pf1_result.max_feasible_qty == 20  # 60/3 = 20

    # TC-4: FAB component missing from pool
    def test_tc4_fab_missing_from_pool(self):
        """Pool has C2 ACHAT only. PF1 needs C1 FAB. PF1 NOT feasible."""
        loader = FakeLoader(
            articles=[
                _make_pf("PF1"),
                _make_article("C1", type_appro=TypeApprovisionnement.FABRICATION),
                _make_article("C2"),
            ],
            stocks=[_make_stock("C1", physique=10), _make_stock("C2", physique=100)],
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0, type_article=TypeArticle.FABRIQUE)],
                ),
            },
        )
        pool = [_eol_component("C2", qty=100)]  # C1 (FAB) not in pool
        service = ResidualFabricationService(loader, pool)
        results = service.check_all(pf_codes=["PF1"])

        pf1_result = next(r for r in results if r.pf_article == "PF1")
        assert pf1_result.feasible is False
        gap = next((g for g in pf1_result.stock_gaps if g.article == "C1"), None)
        assert gap is not None
        assert gap.shortage_qty > 0

    # TC-5: FAB component in pool but qty insufficient
    def test_tc5_fab_insufficient_in_pool(self):
        """Pool has C1 FAB qty=5. PF1 needs C1×1. PF1×10 NOT feasible."""
        loader = FakeLoader(
            articles=[
                _make_pf("PF1"),
                _make_article("C1", type_appro=TypeApprovisionnement.FABRICATION),
                _make_article("C2"),
            ],
            stocks=[_make_stock("C1", physique=5), _make_stock("C2", physique=100)],
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0, type_article=TypeArticle.FABRIQUE)],
                ),
            },
        )
        pool = [_eol_component("C1", qty=5, component_type="FABRICATION")]
        service = ResidualFabricationService(loader, pool)
        results = service.check_all(pf_codes=["PF1"])

        pf1_result = next(r for r in results if r.pf_article == "PF1")
        assert pf1_result.feasible is True
        assert pf1_result.max_feasible_qty == 5

    # TC-5b: FAB in pool with qty=5, desired_qty=10 exceeds pool
    def test_tc5b_fab_pool_qty_less_than_desired(self):
        """Pool has C1 FAB qty=5. PF1×10 requested → NOT feasible, max=5."""
        loader = FakeLoader(
            articles=[
                _make_pf("PF1"),
                _make_article("C1", type_appro=TypeApprovisionnement.FABRICATION),
                _make_article("C2"),
            ],
            stocks=[_make_stock("C1", physique=5), _make_stock("C2", physique=100)],
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0, type_article=TypeArticle.FABRIQUE)]),
            },
        )
        pool = [_eol_component("C1", qty=5, component_type="FABRICATION")]
        service = ResidualFabricationService(loader, pool)
        results = service.check_all(pf_codes=["PF1"], desired_qty=10)

        pf1_result = next(r for r in results if r.pf_article == "PF1")
        assert pf1_result.feasible is False
        assert pf1_result.max_feasible_qty == 5

    # TC-6: Empty pool — nothing fabricable
    def test_tc6_empty_pool(self):
        """Pool empty. PF1 NOT feasible."""
        loader = FakeLoader(
            articles=[_make_pf("PF1"), _make_article("C1")],
            stocks=[_make_stock("C1", physique=0)],
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0)],
                ),
            },
        )
        pool = []
        service = ResidualFabricationService(loader, pool)
        results = service.check_all(pf_codes=["PF1"])

        pf1_result = next(r for r in results if r.pf_article == "PF1")
        assert pf1_result.feasible is False
        assert pf1_result.max_feasible_qty == 0

    # TC-7: PF with no nomenclature
    def test_tc7_no_nomenclature(self):
        """Pool has C1 qty=100. PF1 has no BOM. PF1 NOT feasible with alert."""
        loader = FakeLoader(
            articles=[_make_pf("PF1"), _make_article("C1")],
            stocks=[_make_stock("C1", physique=100)],
            nomenclatures={},  # No BOM for PF1
        )
        pool = [_eol_component("C1", qty=100)]
        service = ResidualFabricationService(loader, pool)
        results = service.check_all(pf_codes=["PF1"])

        pf1_result = next(r for r in results if r.pf_article == "PF1")
        assert pf1_result.feasible is False
        assert any("nomenclature" in a.lower() for a in pf1_result.alerts)

    # TC-8: Multiple PF candidates share a limiting component
    def test_tc8_shared_component_individual_assessment(self):
        """Pool has C1 qty=30. PF1 needs C1×2, PF2 needs C1×1. Each assessed individually."""
        loader = FakeLoader(
            articles=[
                _make_pf("PF1", famille_produit="FAM-EOL"),
                _make_pf("PF2", famille_produit="FAM-EOL"),
                _make_article("C1"),
            ],
            stocks=[_make_stock("C1", physique=30)],
            nomenclatures={
                "PF1": Nomenclature(article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=2.0)]),
                "PF2": Nomenclature(article="PF2", designation="PF2",
                    composants=[_make_entry("PF2", "C1", qte=1.0)]),
            },
        )
        pool = [_eol_component("C1", qty=30)]
        service = ResidualFabricationService(loader, pool)
        results = service.check_all(pf_codes=["PF1", "PF2"])

        pf1_result = next(r for r in results if r.pf_article == "PF1")
        pf2_result = next(r for r in results if r.pf_article == "PF2")

        # Each evaluated against the full pool independently (no depletion)
        assert pf1_result.max_feasible_qty == 15   # floor(30/2)
        assert pf2_result.max_feasible_qty == 30   # floor(30/1)
        assert pf1_result.feasible is True  # 10 <= 15
        assert pf2_result.feasible is True  # 10 <= 30

    # TC-9: Pool is not modified after check (read-only)
    def test_tc9_pool_readonly(self):
        """Running check twice must not deplete the pool."""
        loader = FakeLoader(
            articles=[_make_pf("PF1"), _make_article("C1")],
            stocks=[_make_stock("C1", physique=100)],
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=10.0)],
                ),
            },
        )
        pool = [_eol_component("C1", qty=100)]
        service = ResidualFabricationService(loader, pool)

        results1 = service.check_all(pf_codes=["PF1"], desired_qty=3)
        results2 = service.check_all(pf_codes=["PF1"], desired_qty=5)

        # Both runs report the same max_feasible_qty (pool not depleted)
        pf1_r1 = next(r for r in results1 if r.pf_article == "PF1")
        pf1_r2 = next(r for r in results2 if r.pf_article == "PF1")
        assert pf1_r1.max_feasible_qty == pf1_r2.max_feasible_qty == 10

    # TC-10: ACHAT article (non-FAB) should not appear as candidate PF
    def test_tc10_non_fabrication_article_filtered(self):
        """PF candidates must be FAB. ACHAT articles are excluded."""
        loader = FakeLoader(
            articles=[
                _make_pf("PF1", famille_produit="FAM-EOL"),
                _make_article("C1"),  # ACHAT, not a PF
            ],
            stocks=[_make_stock("C1", physique=100)],
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=1.0)],
                ),
            },
        )
        pool = [_eol_component("C1", qty=100)]
        service = ResidualFabricationService(loader, pool)
        results = service.check_all(pf_codes=["PF1"])

        pf_articles = [r.pf_article for r in results]
        assert "C1" not in pf_articles  # ACHAT articles filtered out

    # TC-11: Max feasible qty with fractional BOM quantities
    def test_tc11_fractional_bom_qty(self):
        """PF1 needs C1×0.3 per unit. Pool has C1 qty=10. Max qty = floor(10/0.3) = 33."""
        loader = FakeLoader(
            articles=[_make_pf("PF1"), _make_article("C1")],
            stocks=[_make_stock("C1", physique=10)],
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "C1", qte=0.3)],
                ),
            },
        )
        pool = [_eol_component("C1", qty=10)]
        service = ResidualFabricationService(loader, pool)
        results = service.check_all(pf_codes=["PF1"], desired_qty=20)
        pf1_result = next(r for r in results if r.pf_article == "PF1")
        assert pf1_result.max_feasible_qty == 33  # floor(10/0.3)
        assert pf1_result.feasible is True
        results40 = service.check_all(pf_codes=["PF1"], desired_qty=40)
        pf1_40 = next(r for r in results40 if r.pf_article == "PF1")
        assert pf1_40.feasible is False
        assert pf1_40.max_feasible_qty == 33
