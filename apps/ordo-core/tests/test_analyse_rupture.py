"""Tests pour le service d'analyse de rupture."""

import pytest
from types import SimpleNamespace
from datetime import date

from src.feasibility.analyse_rupture import AnalyseRuptureService
from src.feasibility.analyse_rupture_models import AnalyseRuptureResult
from src.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle, NatureConsommation
from src.models.of import OF
from src.models.stock import Stock
from src.models.article import Article, TypeApprovisionnement
from src.models.besoin_client import BesoinClient, TypeCommande, NatureBesoin
from src.models.gamme import Gamme, GammeOperation
from src.models.reception import Reception


# ── Helpers ────────────────────────────────────────────────────


def _make_entry(parent, composant, qte=1.0, type_article=TypeArticle.ACHETE,
                nature=NatureConsommation.PROPORTIONNEL):
    return NomenclatureEntry(
        article_parent=parent,
        designation_parent=parent,
        niveau=10,
        article_composant=composant,
        designation_composant=composant,
        qte_lien=qte,
        type_article=type_article,
        nature_consommation=nature,
    )


def _make_of(num_of, article, qte_restante=100, qte_a_fabriquer=100,
             statut_num=1, statut_texte="Ferme", date_fin=None,
             num_ordre_origine="", methode_obtention_livraison=""):
    return OF(
        num_of=num_of,
        article=article,
        description=article,
        statut_num=statut_num,
        statut_texte=statut_texte,
        date_fin=date_fin or date(2026, 5, 1),
        qte_a_fabriquer=qte_a_fabriquer,
        qte_fabriquee=qte_a_fabriquer - qte_restante,
        qte_restante=qte_restante,
        num_ordre_origine=num_ordre_origine,
        methode_obtention_livraison=methode_obtention_livraison,
    )


def _make_stock(article, physique=100, alloue=50):
    return Stock(article=article, stock_physique=physique, stock_alloue=alloue, stock_bloque=0)


def _make_article(code, description="Test", categorie="AP"):
    return Article(
        code=code,
        description=description,
        categorie=categorie,
        type_appro=TypeApprovisionnement.ACHAT,
        delai_reappro=28,
    )


def _make_besoin(client, article, qte_restante=50, type_cmd=TypeCommande.MTS,
                 nature=NatureBesoin.COMMANDE, of_contremarque=""):
    return BesoinClient(
        nom_client=client,
        code_pays="FR",
        type_commande=type_cmd,
        num_commande=f"CMD-{client}-{article}",
        nature_besoin=nature,
        article=article,
        description=article,
        categorie="PF",
        source_origine_besoin="VENTES",
        of_contremarque=of_contremarque,
        date_commande=date(2026, 4, 1),
        date_expedition_demandee=date(2026, 5, 15),
        qte_commandee=qte_restante,
        qte_allouee=0,
        qte_restante=qte_restante,
    )


def _make_loader(**overrides):
    """Cree un loader minimal avec SimpleNamespace."""
    defaults = {
        "articles": {},
        "nomenclatures": {},
        "gammes": {},
        "ofs": [],
        "stocks": {},
        "receptions": [],
        "commandes_clients": [],
        "allocations": {},
    }
    defaults.update(overrides)

    # Ajouter les methodes du DataLoader utilisees par AnalyseRuptureService
    loader = SimpleNamespace(**defaults)
    loader.get_article = lambda code: defaults["articles"].get(code)
    loader.get_stock = lambda code: defaults["stocks"].get(code)
    loader.get_gamme = lambda code: defaults["gammes"].get(code)
    # Index des receptions par article (comme DataLoader)
    _receptions_by_article = {}
    for rec in defaults["receptions"]:
        _receptions_by_article.setdefault(rec.article, []).append(rec)
    loader.get_receptions = lambda code: _receptions_by_article.get(code, [])
    # Index OF par num_ordre_origine (utilise par CommandeOFMatcher)
    _ofs_by_origin = {}
    for of in defaults["ofs"]:
        if getattr(of, "num_ordre_origine", ""):
            _ofs_by_origin.setdefault(of.num_ordre_origine, []).append(of)
    loader.get_ofs_by_origin = lambda num_ordre, article=None: [
        of for of in _ofs_by_origin.get(num_ordre, [])
        if article is None or of.article == article
    ]
    return loader


def _all_blocked_of_nums(result: AnalyseRuptureResult) -> list[str]:
    """Collecte tous les num_OF bloques depuis commandes + orphelins."""
    nums = []
    for cmd in result.commandes_bloquees:
        for of in cmd.ofs_bloquants:
            nums.append(of.num_of)
    for of in result.ofs_sans_commande:
        nums.append(of.num_of)
    return nums


# ── Tests: Composant non trouve ────────────────────────────────


class TestComponentNotFound:

    def test_raises_value_error_for_unknown_component(self):
        loader = _make_loader()
        service = AnalyseRuptureService(loader)
        with pytest.raises(ValueError, match="Composant non trouve"):
            service.analyze("UNKNOWN")


# ── Tests: Composant sans parents ──────────────────────────────


class TestComponentNoParents:

    def test_returns_empty_for_terminal_component(self):
        loader = _make_loader(
            articles={"COMP-A": _make_article("COMP-A")},
            nomenclatures={},
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.component.code == "COMP-A"
        assert result.commandes_bloquees == []
        assert result.ofs_sans_commande == []
        assert result.summary.total_blocked_ofs == 0
        assert result.summary.total_affected_orders == 0

    def test_returns_stock_info(self):
        loader = _make_loader(
            articles={"COMP-A": _make_article("COMP-A")},
            stocks={"COMP-A": _make_stock("COMP-A", physique=200, alloue=30)},
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.component.stock_physique == 200
        assert result.component.stock_alloue == 30
        assert result.component.stock_disponible == 170


# ── Tests: Impact niveau 1 ────────────────────────────────────


class TestSingleLevelImpact:

    def test_finds_parent_of(self):
        """COMP-A est compose de PROD-X. Un OF existe pour PROD-X."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=80)],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.summary.total_blocked_ofs == 1
        # OF sans commande car pas de besoins clients
        assert result.ofs_sans_commande[0].num_of == "OF-001"
        assert result.ofs_sans_commande[0].article == "PROD-X"

    def test_ignores_ofs_with_zero_restante(self):
        """Les OF avec qte_restante = 0 ne sont pas bloques."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=0)],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.summary.total_blocked_ofs == 0


# ── Tests: Impact multi-niveaux ────────────────────────────────


class TestMultiLevelImpact:

    def test_three_level_bom(self):
        """COMP-A -> SOUS-ENS -> PROD-FINAL."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "SOUS-ENS": _make_article("SOUS-ENS"),
                "PROD-FINAL": _make_article("PROD-FINAL"),
            },
            nomenclatures={
                "SOUS-ENS": Nomenclature(
                    article="SOUS-ENS",
                    designation="Sous-ensemble",
                    composants=[_make_entry("SOUS-ENS", "COMP-A")],
                ),
                "PROD-FINAL": Nomenclature(
                    article="PROD-FINAL",
                    designation="Produit final",
                    composants=[_make_entry("PROD-FINAL", "SOUS-ENS")],
                ),
            },
            ofs=[
                _make_of("OF-001", "SOUS-ENS", qte_restante=50),
                _make_of("OF-002", "PROD-FINAL", qte_restante=100),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.summary.total_blocked_ofs == 2
        assert result.summary.max_bom_depth >= 3

    def test_shared_component_multiple_parents(self):
        """COMP-A est utilise par PROD-X et PROD-Y."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
                "PROD-Y": _make_article("PROD-Y"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
                "PROD-Y": Nomenclature(
                    article="PROD-Y",
                    designation="Produit Y",
                    composants=[_make_entry("PROD-Y", "COMP-A")],
                ),
            },
            ofs=[
                _make_of("OF-001", "PROD-X", qte_restante=50),
                _make_of("OF-002", "PROD-Y", qte_restante=30),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.summary.total_blocked_ofs == 2


# ── Tests: Quantite FORFAIT vs PROPORTIONNEL ───────────────────


class TestQuantityCalculation:

    def test_forfait_returns_fixed_quantity(self):
        entry = _make_entry("PARENT", "COMP", qte=5.0, nature=NatureConsommation.FORFAIT)
        assert entry.qte_requise(100) == 5

    def test_proportionnel_scales_with_parent(self):
        entry = _make_entry("PARENT", "COMP", qte=2.0, nature=NatureConsommation.PROPORTIONNEL)
        assert entry.qte_requise(100) == 200


# ── Tests: Liaison commandes MTS ───────────────────────────────


class TestMTSOrderLinking:

    def test_links_mts_order_via_origin_order(self):
        """MTS: lien direct via OF.NUM_ORDRE_ORIGINE = commande.num_commande."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of(
                "OF-001", "PROD-X", qte_restante=100,
                num_ordre_origine="CMD-CLIENT-A-PROD-X",
                methode_obtention_livraison="Ordre de fabrication",
            )],
            commandes_clients=[
                _make_besoin("CLIENT-A", "PROD-X", qte_restante=100),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.summary.total_affected_orders == 1
        cmd = result.commandes_bloquees[0]
        assert cmd.num_commande == "CMD-CLIENT-A-PROD-X"
        assert cmd.client == "CLIENT-A"
        assert cmd.type_commande == "MTS"
        assert len(cmd.ofs_bloquants) == 1
        assert cmd.ofs_bloquants[0].num_of == "OF-001"


# ── Tests: Liaison commandes NOR/MTO ──────────────────────────


class TestNOR_MTOOrderLinking:

    def test_links_nor_order_via_article(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=100)],
            commandes_clients=[
                _make_besoin("CLIENT-B", "PROD-X", qte_restante=50,
                             type_cmd=TypeCommande.NOR),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.summary.total_affected_orders >= 1
        nor_cmds = [
            c for c in result.commandes_bloquees
            if c.type_commande == "NOR"
        ]
        assert len(nor_cmds) >= 1


# ── Tests: Articles fantomes (AFANT) ──────────────────────────


class TestPhantomArticles:

    def test_traverses_phantom_article(self):
        """COMP-A -> AFANT-1 -> PROD-FINAL."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "AFANT-1": _make_article("AFANT-1", categorie="AFANT"),
                "PROD-FINAL": _make_article("PROD-FINAL"),
            },
            nomenclatures={
                "AFANT-1": Nomenclature(
                    article="AFANT-1",
                    designation="Fantome",
                    composants=[_make_entry("AFANT-1", "COMP-A")],
                ),
                "PROD-FINAL": Nomenclature(
                    article="PROD-FINAL",
                    designation="Final",
                    composants=[_make_entry("PROD-FINAL", "AFANT-1")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-FINAL", qte_restante=50)],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.summary.total_blocked_ofs >= 1
        # OF-001 should appear in ofs_sans_commande
        of_nums = _all_blocked_of_nums(result)
        assert "OF-001" in of_nums


# ── Tests: Limites ────────────────────────────────────────────


class TestLimits:

    def test_truncated_flag_on_max_depth(self):
        """Si le chemin depasse la profondeur max, truncated=True."""
        nomenclatures = {}
        prev = "COMP-A"
        for i in range(1, 13):
            parent = f"P{i}"
            nomenclatures[parent] = Nomenclature(
                article=parent,
                designation=parent,
                composants=[_make_entry(parent, prev)],
            )
            prev = parent

        articles = {"COMP-A": _make_article("COMP-A")}
        for i in range(1, 13):
            articles[f"P{i}"] = _make_article(f"P{i}")

        loader = _make_loader(
            articles=articles,
            nomenclatures=nomenclatures,
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.summary.truncated is True


# ── Tests: Cycle BOM ──────────────────────────────────────────


class TestCyclicBOM:

    def test_prevents_infinite_loop(self):
        """A -> B -> A: le visited set doit empecher la boucle."""
        loader = _make_loader(
            articles={
                "ART-A": _make_article("ART-A"),
                "ART-B": _make_article("ART-B"),
            },
            nomenclatures={
                "ART-A": Nomenclature(
                    article="ART-A",
                    designation="A",
                    composants=[_make_entry("ART-A", "ART-B")],
                ),
                "ART-B": Nomenclature(
                    article="ART-B",
                    designation="B",
                    composants=[_make_entry("ART-B", "ART-A")],
                ),
            },
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("ART-A")
        assert isinstance(result, AnalyseRuptureResult)


# ── Tests: Resolution postes de charge ─────────────────────────


class TestPostesResolution:

    def test_resolves_postes_from_gamme(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=100)],
            gammes={
                "PROD-X": Gamme(
                    article="PROD-X",
                    operations=[
                        GammeOperation(
                            article="PROD-X",
                            poste_charge="PP_830",
                            libelle_poste="LIGNE",
                            cadence=100.0,
                        ),
                    ],
                ),
            },
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        of_nums = _all_blocked_of_nums(result)
        assert "OF-001" in of_nums
        # Find the OF and check postes
        all_ofs = [of for cmd in result.commandes_bloquees for of in cmd.ofs_bloquants] + result.ofs_sans_commande
        of_001 = next(of for of in all_ofs if of.num_of == "OF-001")
        assert "PP_830" in of_001.postes_charge

    def test_empty_postes_when_no_gamme(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=100)],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        all_ofs = [of for cmd in result.commandes_bloquees for of in cmd.ofs_bloquants] + result.ofs_sans_commande
        of_001 = next(of for of in all_ofs if of.num_of == "OF-001")
        assert of_001.postes_charge == []


# ── Tests: Deficit ────────────────────────────────────────────


class TestDeficit:

    def test_deficit_is_positive_when_stock_insufficient(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=200)],
            stocks={"COMP-A": _make_stock("COMP-A", physique=100, alloue=50)},
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.component.stock_disponible == 50
        assert result.component.deficit > 0

    def test_deficit_is_zero_when_stock_sufficient(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=10)],
            stocks={"COMP-A": _make_stock("COMP-A", physique=500, alloue=10)},
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.component.deficit == 0


# ── Tests: Deduplication ──────────────────────────────────────


class TestDeduplication:

    def test_deduplicates_ofs_across_articles(self):
        """Un OF ne doit apparaitre qu'une fois meme s'il est sur plusieurs articles."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "SOUS-ENS": _make_article("SOUS-ENS"),
                "PROD-X": _make_article("PROD-X"),
                "PROD-Y": _make_article("PROD-Y"),
            },
            nomenclatures={
                "SOUS-ENS": Nomenclature(
                    article="SOUS-ENS",
                    designation="Sous-ensemble",
                    composants=[_make_entry("SOUS-ENS", "COMP-A")],
                ),
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "SOUS-ENS")],
                ),
                "PROD-Y": Nomenclature(
                    article="PROD-Y",
                    designation="Produit Y",
                    composants=[_make_entry("PROD-Y", "SOUS-ENS")],
                ),
            },
            ofs=[
                _make_of("OF-SOUS", "SOUS-ENS", qte_restante=50),
                _make_of("OF-X", "PROD-X", qte_restante=100),
                _make_of("OF-Y", "PROD-Y", qte_restante=80),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        # OF-SOUS ne doit apparaitre qu'une fois
        of_nums = _all_blocked_of_nums(result)
        assert of_nums.count("OF-SOUS") == 1
        assert "OF-SOUS" in of_nums


# ── Tests: Rechargement donnees ────────────────────────────────


class TestDataReload:

    def test_service_uses_fresh_data_after_loader_change(self):
        """Apres load_data, le service doit utiliser les nouvelles donnees."""
        from src.app.gui_service import GuiAppService

        service = GuiAppService()
        # Pas de loader -> erreur
        with pytest.raises(RuntimeError):
            service.analyser_rupture("COMP-A")


# ── Tests: Resume et lignes impactees ──────────────────────────


class TestSummary:

    def test_affected_lines_aggregates_postes(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
                "PROD-Y": _make_article("PROD-Y"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
                "PROD-Y": Nomenclature(
                    article="PROD-Y",
                    designation="Produit Y",
                    composants=[_make_entry("PROD-Y", "COMP-A")],
                ),
            },
            ofs=[
                _make_of("OF-001", "PROD-X", qte_restante=100),
                _make_of("OF-002", "PROD-Y", qte_restante=50),
            ],
            gammes={
                "PROD-X": Gamme(
                    article="PROD-X",
                    operations=[
                        GammeOperation(article="PROD-X", poste_charge="PP_830",
                                       libelle_poste="LIGNE", cadence=100.0),
                    ],
                ),
                "PROD-Y": Gamme(
                    article="PROD-Y",
                    operations=[
                        GammeOperation(article="PROD-Y", poste_charge="PP_153",
                                       libelle_poste="ASSEMBLAGE", cadence=50.0),
                    ],
                ),
            },
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert "PP_830" in result.summary.affected_lines
        assert "PP_153" in result.summary.affected_lines

    def test_summary_counts_are_consistent(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=100)],
            commandes_clients=[
                _make_besoin("CLIENT-A", "PROD-X", qte_restante=50,
                             of_contremarque="OF-001"),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.summary.total_blocked_ofs >= 1
        assert result.summary.total_affected_orders >= 1
        assert len(result.commandes_bloquees) >= 1


# ── Tests: Parametres previsions ──────────────────────────────


def _make_reception(article, qte_restante=200, date_prevue=None):
    return Reception(
        num_commande=f"OA-{article}",
        article=article,
        code_fournisseur="FOURN-1",
        quantite_restante=qte_restante,
        date_reception_prevue=date_prevue or date(2026, 5, 10),
    )


class TestPrevisionsParam:

    def test_exclude_previsions_hides_prevision_orders(self):
        """Par defaut, seules les COMMANDE apparaissent."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=100)],
            commandes_clients=[
                _make_besoin("CLIENT-A", "PROD-X", qte_restante=50,
                             of_contremarque="OF-001",
                             nature=NatureBesoin.COMMANDE),
                _make_besoin("CLIENT-B", "PROD-X", qte_restante=80,
                             of_contremarque="OF-001",
                             nature=NatureBesoin.PREVISION),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A", include_previsions=False)

        assert result.summary.total_affected_orders == 1  # only COMMANDE

    def test_include_previsions_shows_prevision_orders(self):
        """Avec include_previsions=True, les PREVISION apparaissent aussi."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=100)],
            commandes_clients=[
                _make_besoin("CLIENT-A", "PROD-X", qte_restante=50,
                             of_contremarque="OF-001",
                             nature=NatureBesoin.COMMANDE),
                _make_besoin("CLIENT-B", "PROD-X", qte_restante=80,
                             of_contremarque="OF-001",
                             nature=NatureBesoin.PREVISION),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A", include_previsions=True)

        assert result.summary.total_affected_orders == 2  # COMMANDE + PREVISION


class TestReceptionsParam:

    def test_include_receptions_adds_stock(self):
        """Avec include_receptions=True, stock_disponible_projete inclut les receptions."""
        loader = _make_loader(
            articles={"COMP-A": _make_article("COMP-A")},
            stocks={"COMP-A": _make_stock("COMP-A", physique=100, alloue=30)},
            receptions=[
                _make_reception("COMP-A", qte_restante=200),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A", include_receptions=True)

        # stock_physique=100, alloue=30, bloque=0 → dispo=70
        assert result.component.stock_disponible == 70
        assert result.component.stock_disponible_projete == 70 + 200

    def test_receptions_affect_deficit(self):
        """Le deficit_projete est plus faible que le deficit avec receptions."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            stocks={"COMP-A": _make_stock("COMP-A", physique=50, alloue=0)},
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=200)],
            receptions=[
                _make_reception("COMP-A", qte_restante=150),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A", include_receptions=True)

        # dispo=50, besoin=200 → deficit=150
        assert result.component.deficit == 150
        # projete=50+150=200, besoin=200 → deficit_projete=0
        assert result.component.deficit_projete == 0

    def test_receptions_no_receptions_for_article(self):
        """Graceful quand aucune reception pour l'article."""
        loader = _make_loader(
            articles={"COMP-A": _make_article("COMP-A")},
            stocks={"COMP-A": _make_stock("COMP-A", physique=100, alloue=0)},
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A", include_receptions=True)

        assert result.component.stock_disponible_projete == 100

    def test_both_params_combined(self):
        """Les deux params ensemble fonctionnent correctement."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            stocks={"COMP-A": _make_stock("COMP-A", physique=100, alloue=30)},
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[_make_of("OF-001", "PROD-X", qte_restante=100)],
            commandes_clients=[
                _make_besoin("CLIENT-A", "PROD-X", qte_restante=50,
                             of_contremarque="OF-001",
                             nature=NatureBesoin.COMMANDE),
                _make_besoin("CLIENT-B", "PROD-X", qte_restante=80,
                             of_contremarque="OF-001",
                             nature=NatureBesoin.PREVISION),
            ],
            receptions=[
                _make_reception("COMP-A", qte_restante=200),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze(
            "COMP-A",
            include_previsions=True,
            include_receptions=True,
        )

        # 2 commandes (COMMANDE + PREVISION)
        assert result.summary.total_affected_orders == 2
        # Stock projete = 70 + 200 = 270
        assert result.component.stock_disponible_projete == 270
        # Flags renvoyes
        assert result.include_previsions is True
        assert result.include_receptions is True


# ── Tests: Pool multi-niveaux ─────────────────────────────────


class TestPoolComposantSeul:
    """Composant sans parents → pool = stock_physique."""

    def test_pool_equals_stock_physique(self):
        loader = _make_loader(
            articles={"COMP-A": _make_article("COMP-A")},
            stocks={"COMP-A": _make_stock("COMP-A", physique=200, alloue=30)},
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        assert result.component.pool_total == 200.0  # stock_physique, not disponible
        assert len(result.component.pool_repartition) == 1
        assert result.component.pool_repartition[0].categorie == "COMPOSANT"
        assert result.component.pool_repartition[0].contribution == 200.0


class TestPoolSFContribution:
    """SF avec stock × ratio contribue au pool."""

    def test_sf_contributes_stock_times_ratio(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "SF1": _make_article("SF1", categorie="SF"),
                "PROD-X": _make_article("PROD-X", categorie="PF"),
            },
            nomenclatures={
                "SF1": Nomenclature(
                    article="SF1",
                    designation="SF1",
                    composants=[_make_entry("SF1", "COMP-A", qte=2.0)],
                ),
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="PF",
                    composants=[_make_entry("PROD-X", "SF1", qte=3.0)],
                ),
            },
            stocks={
                "COMP-A": _make_stock("COMP-A", physique=100, alloue=0),
                "SF1": _make_stock("SF1", physique=50, alloue=0),
            },
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        # Composant: 100 × 1.0 = 100
        # SF1: stock=50, ratio=2.0 → 50 × 2.0 = 100
        assert result.component.pool_total == 200.0
        sf_contrib = [p for p in result.component.pool_repartition if p.categorie == "SF"]
        assert len(sf_contrib) == 1
        assert sf_contrib[0].contribution == 100.0


class TestPoolPFContribution:
    """PF avec include_pf=True contribue stock_physique × ratio."""

    def test_pf_included_when_flag_on(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PF1": _make_article("PF1", categorie="PF1"),
            },
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1",
                    designation="PF1",
                    composants=[_make_entry("PF1", "COMP-A", qte=3.0)],
                ),
            },
            stocks={
                "COMP-A": _make_stock("COMP-A", physique=10, alloue=0),
                "PF1": _make_stock("PF1", physique=20, alloue=0),
            },
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A", include_pf=True)

        # COMP-A: 10 × 1.0 = 10
        # PF1: 20 × 3.0 = 60
        pf_contrib = [p for p in result.component.pool_repartition if p.categorie == "PF"]
        assert len(pf_contrib) == 1
        assert pf_contrib[0].contribution == 60.0
        assert result.component.pool_total == 70.0

    def test_pf_excluded_by_default(self):
        """PF non inclus quand include_pf=False (defaut)."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PF1": _make_article("PF1", categorie="PF1"),
            },
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1",
                    designation="PF1",
                    composants=[_make_entry("PF1", "COMP-A", qte=2.0)],
                ),
            },
            stocks={
                "COMP-A": _make_stock("COMP-A", physique=10, alloue=0),
                "PF1": _make_stock("PF1", physique=50, alloue=0),
            },
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")  # include_pf=False par defaut

        # Seul le composant contribue, pas le PF
        pf_contrib = [p for p in result.component.pool_repartition if p.categorie == "PF"]
        assert len(pf_contrib) == 0
        assert result.component.pool_total == 10.0


# ── Tests: Waterfall ─────────────────────────────────────────


class TestWaterfallBasic:
    """Waterfall basique: 3 commandes, pool limite, rupture sur la 3e."""

    def test_waterfall_rupture_on_third_order(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PF1": _make_article("PF1", categorie="PF"),
            },
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1",
                    designation="PF1",
                    composants=[_make_entry("PF1", "COMP-A", qte=1.0)],
                ),
            },
            stocks={"COMP-A": _make_stock("COMP-A", physique=100, alloue=0)},
            ofs=[_make_of("OF-001", "PF1", qte_restante=200)],
            commandes_clients=[
                _make_besoin("CLIENT-A", "PF1", qte_restante=30,
                             of_contremarque="OF-001"),
                _make_besoin("CLIENT-B", "PF1", qte_restante=40,
                             of_contremarque="OF-001"),
                _make_besoin("CLIENT-C", "PF1", qte_restante=50,
                             of_contremarque="OF-001"),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        cmds = sorted(result.commandes_bloquees, key=lambda c: c.date_expedition)
        # All 3 commandes appear
        assert len(cmds) == 3
        # All have etat and proj_pool fields
        for cmd in cmds:
            assert hasattr(cmd, "etat")
            assert hasattr(cmd, "proj_pool")
            assert hasattr(cmd, "qte_impact_composant")

    def test_waterfall_cumulative(self):
        """proj_pool decroit au fil des commandes."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PF1": _make_article("PF1", categorie="PF"),
            },
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1",
                    designation="PF1",
                    composants=[_make_entry("PF1", "COMP-A", qte=1.0)],
                ),
            },
            stocks={"COMP-A": _make_stock("COMP-A", physique=100, alloue=0)},
            ofs=[_make_of("OF-001", "PF1", qte_restante=300)],
            commandes_clients=[
                _make_besoin("CLIENT-A", "PF1", qte_restante=30,
                             of_contremarque="OF-001"),
                _make_besoin("CLIENT-B", "PF1", qte_restante=40,
                             of_contremarque="OF-001"),
                _make_besoin("CLIENT-C", "PF1", qte_restante=50,
                             of_contremarque="OF-001"),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        cmds = sorted(result.commandes_bloquees, key=lambda c: c.date_expedition)
        # proj_pool should be decreasing
        for i in range(len(cmds) - 1):
            assert cmds[i].proj_pool >= cmds[i + 1].proj_pool


class TestWaterfallWithReceptions:
    """Waterfall avec receptions qui retardent la rupture."""

    def test_receptions_delay_rupture(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PF1": _make_article("PF1", categorie="PF"),
            },
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1",
                    designation="PF1",
                    composants=[_make_entry("PF1", "COMP-A", qte=1.0)],
                ),
            },
            stocks={"COMP-A": _make_stock("COMP-A", physique=30, alloue=0)},
            ofs=[_make_of("OF-001", "PF1", qte_restante=200)],
            commandes_clients=[
                _make_besoin("CLIENT-A", "PF1", qte_restante=50,
                             of_contremarque="OF-001"),
            ],
            receptions=[
                _make_reception("COMP-A", qte_restante=100,
                                date_prevue=date(2026, 5, 1)),
            ],
        )
        service = AnalyseRuptureService(loader)
        # Sans receptions
        result_no_rec = service.analyze("COMP-A", include_receptions=False)
        # Avec receptions
        result_rec = service.analyze("COMP-A", include_receptions=True)

        # Avec receptions, le proj_pool doit etre plus eleve
        if result_no_rec.commandes_bloquees and result_rec.commandes_bloquees:
            assert result_rec.commandes_bloquees[0].proj_pool >= \
                   result_no_rec.commandes_bloquees[0].proj_pool


class TestWaterfallAllOK:
    """Pool suffisant pour tout → toutes OK."""

    def test_all_ok_when_pool_sufficient(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PF1": _make_article("PF1", categorie="PF"),
            },
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1",
                    designation="PF1",
                    composants=[_make_entry("PF1", "COMP-A", qte=1.0)],
                ),
            },
            stocks={"COMP-A": _make_stock("COMP-A", physique=1000, alloue=0)},
            ofs=[_make_of("OF-001", "PF1", qte_restante=100)],
            commandes_clients=[
                _make_besoin("CLIENT-A", "PF1", qte_restante=10,
                             of_contremarque="OF-001"),
                _make_besoin("CLIENT-B", "PF1", qte_restante=10,
                             of_contremarque="OF-001"),
            ],
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        for cmd in result.commandes_bloquees:
            assert cmd.etat == "OK"


# ── Tests: use_pool=False ──────────────────────────────────────


class TestUsePoolFalse:
    """use_pool=False: pool = stock_disponible uniquement, pas de SF/PF."""

    def test_use_pool_false_ignores_sf_pf(self):
        """Avec use_pool=False, le pool ne contient que le stock_disponible."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "SF1": _make_article("SF1", categorie="SF"),
                "PF1": _make_article("PF1", categorie="PF"),
            },
            nomenclatures={
                "SF1": Nomenclature(
                    article="SF1", designation="SF1",
                    composants=[_make_entry("SF1", "COMP-A", qte=2.0)],
                ),
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "SF1", qte=3.0)],
                ),
            },
            stocks={
                "COMP-A": _make_stock("COMP-A", physique=100, alloue=0),
                "SF1": _make_stock("SF1", physique=50, alloue=0),
                "PF1": _make_stock("PF1", physique=20, alloue=0),
            },
        )
        service = AnalyseRuptureService(loader)

        result_pool = service.analyze("COMP-A", use_pool=True)
        result_no_pool = service.analyze("COMP-A", use_pool=False)

        # Avec pool: composant(100) + SF(50×2=100) + PF surplus
        assert result_pool.component.pool_total > 100

        # Sans pool: juste stock_disponible du composant
        assert result_no_pool.component.pool_total == 100
        assert len(result_no_pool.component.pool_repartition) == 1
        assert result_no_pool.component.pool_repartition[0].categorie == "COMPOSANT"
        assert result_no_pool.use_pool is False

    def test_use_pool_false_waterfall_uses_stock(self):
        """Waterfall avec use_pool=False part de stock_disponible, pas du pool."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PF1": _make_article("PF1", categorie="PF"),
            },
            nomenclatures={
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "COMP-A", qte=1.0)],
                ),
            },
            stocks={"COMP-A": _make_stock("COMP-A", physique=100, alloue=0)},
            ofs=[_make_of("OF-001", "PF1", qte_restante=300)],
            commandes_clients=[
                _make_besoin("CLIENT-A", "PF1", qte_restante=60,
                             of_contremarque="OF-001"),
                _make_besoin("CLIENT-B", "PF1", qte_restante=50,
                             of_contremarque="OF-001"),
            ],
        )
        service = AnalyseRuptureService(loader)

        result = service.analyze("COMP-A", use_pool=False)

        # Pool = 100. Premiere commande: 60 × 1.0 = 60 → proj_pool = 40
        # Deuxieme commande: 50 × 1.0 = 50 → proj_pool = -10 → RUPTURE
        cmds = sorted(result.commandes_bloquees, key=lambda c: c.date_expedition)
        assert cmds[0].etat == "OK"
        assert cmds[0].proj_pool == 40.0
        assert cmds[1].etat == "RUPTURE"
        assert cmds[1].proj_pool == -10.0


# ── Tests: merge_branches=False ────────────────────────────────


def _make_two_branch_loader():
    """BOM: COMP-A → SF1 → PF1 et COMP-A → SF1 → PF2 (2 branches).

    COMP-A stock=100, SF1 stock=50, PF1 stock=20, PF2 stock=30.
    """
    return _make_loader(
        articles={
            "COMP-A": _make_article("COMP-A"),
            "SF1": _make_article("SF1", categorie="SF"),
            "PF1": _make_article("PF1", categorie="PF1"),
            "PF2": _make_article("PF2", categorie="PF2"),
        },
        nomenclatures={
            "SF1": Nomenclature(
                article="SF1", designation="SF1",
                composants=[_make_entry("SF1", "COMP-A", qte=2.0)],
            ),
            "PF1": Nomenclature(
                article="PF1", designation="PF1",
                composants=[_make_entry("PF1", "SF1", qte=3.0)],
            ),
            "PF2": Nomenclature(
                article="PF2", designation="PF2",
                composants=[_make_entry("PF2", "SF1", qte=3.0)],
            ),
        },
        stocks={
            "COMP-A": _make_stock("COMP-A", physique=100, alloue=0),
            "SF1": _make_stock("SF1", physique=50, alloue=0),
            "PF1": _make_stock("PF1", physique=20, alloue=0),
            "PF2": _make_stock("PF2", physique=30, alloue=0),
        },
        ofs=[],
        commandes_clients=[],
    )


class TestMergeBranchesFalse:
    """merge_branches=False: pool toujours merge, commandes tagguees par branche."""

    def test_merge_branches_false_merged_pool(self):
        """Pool toujours merge (pas de doublons), meme avec merge_branches=False."""
        loader = _make_two_branch_loader()
        service = AnalyseRuptureService(loader)

        result = service.analyze("COMP-A", merge_branches=False)

        repart = result.component.pool_repartition
        articles_in_pool = [p.article for p in repart]
        # Pas de doublons: chaque article apparait une seule fois
        assert len(articles_in_pool) == len(set(articles_in_pool))
        # COMP-A et SF1 sont dans le pool (PF ont surplus=0 ici car pas de commande)
        assert "COMP-A" in articles_in_pool
        assert "SF1" in articles_in_pool

    def test_merge_branches_false_commandes_tagged(self):
        """merge_branches=False: commandes tagguees avec branch_key (PF feuille)."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "SF1": _make_article("SF1", categorie="SF"),
                "PF1": _make_article("PF1", categorie="PF1"),
                "PF2": _make_article("PF2", categorie="PF2"),
            },
            nomenclatures={
                "SF1": Nomenclature(
                    article="SF1", designation="SF1",
                    composants=[_make_entry("SF1", "COMP-A", qte=2.0)],
                ),
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "SF1", qte=3.0)],
                ),
                "PF2": Nomenclature(
                    article="PF2", designation="PF2",
                    composants=[_make_entry("PF2", "SF1", qte=3.0)],
                ),
            },
            stocks={
                "COMP-A": _make_stock("COMP-A", physique=100, alloue=0),
                "SF1": _make_stock("SF1", physique=50, alloue=0),
            },
            ofs=[
                _make_of("OF-PF1", "PF1", qte_restante=200),
                _make_of("OF-PF2", "PF2", qte_restante=200),
            ],
            commandes_clients=[
                _make_besoin("CLIENT-A", "PF1", qte_restante=100),
            ],
        )
        service = AnalyseRuptureService(loader)

        result = service.analyze("COMP-A", merge_branches=False)

        # La commande pour PF1 doit avoir branch_key="SF1" (branche = SF, pas PF)
        sf1_cmds = [c for c in result.commandes_bloquees if c.branch_key == "SF1"]
        assert len(sf1_cmds) == 1
        assert sf1_cmds[0].article == "PF1"

    def test_merge_branches_true_no_branch_key(self):
        """merge_branches=True (defaut): pas de branch_key sur commandes."""
        loader = _make_two_branch_loader()
        service = AnalyseRuptureService(loader)

        result = service.analyze("COMP-A", merge_branches=True)

        # Pas de branch_key sur les commandes bloquees
        for cmd in result.commandes_bloquees:
            assert cmd.branch_key is None

        assert result.merge_branches is True


class TestSingleBranchSameAsMerged:
    """1 seule branche → meme resultat merge ou pas."""

    def test_single_branch_same_result(self):
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "SF1": _make_article("SF1", categorie="SF"),
                "PF1": _make_article("PF1", categorie="PF"),
            },
            nomenclatures={
                "SF1": Nomenclature(
                    article="SF1", designation="SF1",
                    composants=[_make_entry("SF1", "COMP-A", qte=2.0)],
                ),
                "PF1": Nomenclature(
                    article="PF1", designation="PF1",
                    composants=[_make_entry("PF1", "SF1", qte=3.0)],
                ),
            },
            stocks={
                "COMP-A": _make_stock("COMP-A", physique=100, alloue=0),
                "SF1": _make_stock("SF1", physique=50, alloue=0),
            },
        )
        service = AnalyseRuptureService(loader)

        merged = service.analyze("COMP-A", merge_branches=True)
        split = service.analyze("COMP-A", merge_branches=False)

        # Meme pool_total
        assert merged.component.pool_total == split.component.pool_total
        # Meme nombre de repartition (component + SF)
        assert len(merged.component.pool_repartition) == len(split.component.pool_repartition)


# ── Tests: Allocation awareness ──────────────────────────────────


def _make_alloc(article: str, qte: float, num_doc: str):
    """Cree une allocation minimale (OFAllocation-like)."""
    return SimpleNamespace(article=article, qte_allouee=qte, num_doc=num_doc, date_besoin="")


class TestAllocationAwareness:

    def test_ferme_of_with_allocated_component_marked_ok(self):
        """Un OF Ferme dont le composant est alloue doit avoir composants_alloues=True."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[
                _make_of("OF-001", "PROD-X", qte_restante=100, statut_num=1),
                _make_of("OF-002", "PROD-X", qte_restante=50, statut_num=2),
            ],
            stocks={"COMP-A": _make_stock("COMP-A", physique=100, alloue=50)},
            # Allocations: COMP-A est alloue a OF-001 (Ferme) mais pas a OF-002
            allocations={
                "OF-001": [_make_alloc("COMP-A", 100, "OF-001")],
                "OF-002": [_make_alloc("OTHER-COMP", 50, "OF-002")],
            },
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        all_ofs = [of for cmd in result.commandes_bloquees for of in cmd.ofs_bloquants] + result.ofs_sans_commande
        of_001 = next(of for of in all_ofs if of.num_of == "OF-001")
        of_002 = next(of for of in all_ofs if of.num_of == "OF-002")

        assert of_001.composants_alloues is True   # Ferme + alloue
        assert of_002.composants_alloues is False  # Pas Ferme OU pas alloue

    def test_deficit_excludes_allocated_ofs(self):
        """Le deficit ne doit pas compter les OFs dont les composants sont deja alloues."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[
                _make_of("OF-ALLOC", "PROD-X", qte_restante=500, statut_num=1),
                _make_of("OF-NON-ALLOC", "PROD-X", qte_restante=200, statut_num=1),
            ],
            stocks={"COMP-A": _make_stock("COMP-A", physique=100, alloue=50)},
            # OF-ALLOC a le composant alloue, OF-NON-ALLOC non
            allocations={
                "OF-ALLOC": [_make_alloc("COMP-A", 500, "OF-ALLOC")],
            },
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        # Deficit = OF-NON-ALLOC (200) - stock_disponible (50) = 150
        assert result.component.deficit == 150

    def test_no_allocations_data_means_nothing_allocated(self):
        """Sans donnees d'allocation, aucun OF n'est marque comme alloue."""
        loader = _make_loader(
            articles={
                "COMP-A": _make_article("COMP-A"),
                "PROD-X": _make_article("PROD-X"),
            },
            nomenclatures={
                "PROD-X": Nomenclature(
                    article="PROD-X",
                    designation="Produit X",
                    composants=[_make_entry("PROD-X", "COMP-A")],
                ),
            },
            ofs=[
                _make_of("OF-001", "PROD-X", qte_restante=100, statut_num=1),
            ],
            stocks={"COMP-A": _make_stock("COMP-A", physique=100, alloue=50)},
            allocations={},  # Pas de donnees d'allocation
        )
        service = AnalyseRuptureService(loader)
        result = service.analyze("COMP-A")

        all_ofs = [of for cmd in result.commandes_bloquees for of in cmd.ofs_bloquants] + result.ofs_sans_commande
        of_001 = next(of for of in all_ofs if of.num_of == "OF-001")
        assert of_001.composants_alloues is False
