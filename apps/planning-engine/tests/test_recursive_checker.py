"""Tests pour RecursiveChecker."""

from datetime import date
from types import SimpleNamespace

from production_planning.feasibility.recursive import RecursiveChecker
from production_planning.orders.allocation import StockState
from production_planning.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle
from production_planning.models.article import Article, TypeApprovisionnement
from production_planning.models.of import OF
from production_planning.models.stock import Stock
from production_planning.models.allocation import OFAllocation


# ---------------------------------------------------------------------------
# Helpers - construction de fausses donnees
# ---------------------------------------------------------------------------

def _make_of(num_of, article, statut_num, date_fin, qte_restante=100):
    return OF(
        num_of=num_of,
        article=article,
        description=f"DESC_{article}",
        statut_num=statut_num,
        statut_texte={1: "Ferme", 2: "Planifie", 3: "Suggere"}.get(statut_num, "Suggere"),
        date_fin=date_fin,
        qte_a_fabriquer=qte_restante,
        qte_fabriquee=0,
        qte_restante=qte_restante,
    )


def _make_nomenclature(parent, components):
    """Cree une nomenclature simple. components: list of (code, qte, TypeArticle)."""
    return Nomenclature(
        article=parent,
        designation=f"DESC_{parent}",
        composants=[
            NomenclatureEntry(
                article_parent=parent,
                designation_parent=f"DESC_{parent}",
                niveau=10,
                article_composant=code,
                designation_composant=f"DESC_{code}",
                qte_lien=qte,
                type_article=type_article,
            )
            for code, qte, type_article in components
        ],
    )


def _make_loader(ofs=None, stocks=None, nomenclatures=None,
                 articles=None, allocations=None, commandes_clients=None, receptions=None):
    """Cree un SimpleNamespace imitant DataLoader avec les donnees fournies."""
    allocations = allocations or {}
    nomenclatures = nomenclatures or {}
    stocks = stocks or {}
    articles = articles or {}
    ofs = ofs or []
    commandes_clients = commandes_clients or []
    receptions = receptions or {}

    return SimpleNamespace(
        commandes_clients=commandes_clients,
        ofs=ofs,
        articles=articles,
        get_article=lambda article: articles.get(article),
        get_nomenclature=lambda article: nomenclatures.get(article),
        get_stock=lambda article: stocks.get(article),
        get_allocations_of=lambda num_doc: allocations.get(num_doc, []),
        get_ofs_by_article=lambda article, statut=None, date_besoin=None: [
            of for of in ofs if of.article == article and of.qte_restante > 0
            and (statut is None or of.statut_num == statut)
        ],
        get_receptions=lambda article: receptions.get(article, []),
    )


class TestRecursiveChecker:
    """Tests pour la classe RecursiveChecker."""

    def test_init_without_stock_state(self):
        """Test l'initialisation sans stock_state."""
        loader = _make_loader()
        checker = RecursiveChecker(loader)

        assert checker.data_loader == loader
        assert checker.use_receptions is False
        assert checker.check_date is None
        assert checker.stock_state is None

    def test_init_with_stock_state(self):
        """Test l'initialisation avec stock_state."""
        loader = _make_loader()
        stock_state = StockState({"A1953": 100})
        checker = RecursiveChecker(loader, stock_state=stock_state)

        assert checker.stock_state == stock_state

    def test_init_with_receptions(self):
        """Test l'initialisation avec use_receptions."""
        loader = _make_loader()
        checker = RecursiveChecker(loader, use_receptions=True)

        assert checker.use_receptions is True

    def test_check_of_ferme_with_allocations(self):
        """Test la verification d'un OF FERME avec allocations."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_A", 1.0, TypeArticle.ACHETE),
                ("COMP_B", 2.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_A": Stock("COMP_A", stock_physique=10, stock_alloue=10, stock_sous_cq=0),
            "COMP_B": Stock("COMP_B", stock_physique=5, stock_alloue=0, stock_sous_cq=0),
        }
        # OF FERME avec allocations existantes pour COMP_A
        of = _make_of("OF_FERME_1", "PF", 1, date(2026, 4, 20), qte_restante=10)
        allocations = {
            "OF_FERME_1": [OFAllocation(article="COMP_A", qte_allouee=10.0, num_doc="OF_FERME_1", date_besoin="20/04/2026")],
        }
        loader = _make_loader(
            ofs=[of], stocks=stocks, nomenclatures=nomenclatures,
            allocations=allocations,
        )

        checker = RecursiveChecker(loader)

        result = checker.check_of(of)

        assert result is not None
        assert isinstance(result.components_checked, int)

    def test_check_of_suggested_without_stock_state(self):
        """Test la verification d'un OF SUGGERE sans stock_state."""
        nomenclatures = {
            "PF": _make_nomenclature("PF", [
                ("COMP_A", 1.0, TypeArticle.ACHETE),
            ]),
        }
        stocks = {
            "COMP_A": Stock("COMP_A", stock_physique=100, stock_alloue=0, stock_sous_cq=0),
        }
        of = _make_of("OF_SUGG_1", "PF", 3, date(2026, 4, 20), qte_restante=10)
        loader = _make_loader(ofs=[of], stocks=stocks, nomenclatures=nomenclatures)

        checker = RecursiveChecker(loader, stock_state=None)

        result = checker.check_of(of)

        assert result is not None
        assert isinstance(result.feasible, bool)

    def test_check_stock_with_real_stock(self):
        """Test la verification de stock avec stock reel."""
        stocks = {
            "A1953": Stock("A1953", stock_physique=150, stock_alloue=0, stock_sous_cq=0),
        }
        loader = _make_loader(stocks=stocks)
        checker = RecursiveChecker(loader, stock_state=None)

        # Verifier le stock avec besoin inferieur au dispo
        result = checker._check_stock("A1953", 10, date.today())

        assert result is not None
        assert isinstance(result.feasible, bool)

    def test_check_stock_with_virtual_stock_sufficient(self):
        """Test la verification de stock avec stock virtuel suffisant."""
        loader = _make_loader()
        article = "A1953"
        stock_state = StockState({article: 100})

        checker = RecursiveChecker(loader, stock_state=stock_state)

        # Verifier avec besoin inferieur au stock
        result = checker._check_stock(article, 50, date.today())

        assert result.feasible is True
        assert len(result.missing_components) == 0

    def test_check_stock_with_virtual_stock_insufficient(self):
        """Test la verification de stock avec stock virtuel insuffisant."""
        loader = _make_loader()
        article = "A1953"
        stock_state = StockState({article: 100})

        checker = RecursiveChecker(loader, stock_state=stock_state)

        # Verifier avec besoin superieur au stock
        result = checker._check_stock(article, 150, date.today())

        assert result.feasible is False
        assert article in result.missing_components
        assert result.missing_components[article] == 50  # 150 - 100

    def test_check_stock_with_virtual_stock_zero(self):
        """Test la verification de stock avec stock virtuel nul."""
        loader = _make_loader()
        article = "A1953"
        stock_state = StockState({article: 0})

        checker = RecursiveChecker(loader, stock_state=stock_state)

        # Verifier avec besoin > 0
        result = checker._check_stock(article, 50, date.today())

        assert result.feasible is False
        assert article in result.missing_components
        assert result.missing_components[article] == 50

    def test_check_stock_article_not_in_stock_state(self):
        """Test la verification d'un article absent du stock_state."""
        loader = _make_loader()
        article = "A1953"
        stock_state = StockState({})  # Stock vide

        checker = RecursiveChecker(loader, stock_state=stock_state)

        # Verifier - l'article n'est pas dans stock_state
        result = checker._check_stock(article, 50, date.today())

        # StockState.get_available() retourne 0 si article absent
        assert result.feasible is False
        assert article in result.missing_components

    def test_check_stock_counts_same_day_receptions_when_enabled(self):
        """Une reception le jour du besoin est comptee dans le stock dispo."""
        from production_planning.models.reception import Reception

        need_day = date(2026, 4, 15)
        loader = _make_loader(
            stocks={"A1953": Stock("A1953", stock_physique=0, stock_alloue=0, stock_sous_cq=0)},
            receptions={
                "A1953": [
                    Reception(
                        num_commande="PO-1",
                        article="A1953",
                        code_fournisseur="F1",
                        quantite_restante=10,
                        date_reception_prevue=need_day,
                    )
                ]
            },
        )
        checker = RecursiveChecker(loader, use_receptions=True, stock_state=None)

        result = checker._check_stock("A1953", 5, need_day)

        assert result.feasible is True

    def test_get_date_besoin_uses_date_debut_in_priority(self):
        """DATE_DEBUT passe avant toute autre source de date."""
        checker = RecursiveChecker(SimpleNamespace(commandes_clients=[]))
        of = OF(
            num_of="F426-10001",
            article="ART001",
            description="OF test",
            statut_num=3,
            statut_texte="Suggéré",
            date_fin=date(2026, 4, 18),
            qte_a_fabriquer=10,
            qte_fabriquee=0,
            qte_restante=10,
            date_debut=date(2026, 4, 15),
        )

        assert checker._get_date_besoin_commande(of) == date(2026, 4, 15)

    def test_get_date_besoin_falls_back_to_linked_commande_minus_two_days(self):
        """Sans DATE_DEBUT, la date de commande liée est utilisée avec le décalage J-2."""
        commande = SimpleNamespace(
            of_contremarque="F426-10002",
            date_expedition_demandee=date(2026, 4, 20),
        )
        checker = RecursiveChecker(SimpleNamespace(commandes_clients=[commande]))
        of = OF(
            num_of="F426-10002",
            article="ART002",
            description="OF test",
            statut_num=3,
            statut_texte="Suggéré",
            date_fin=date(2026, 4, 18),
            qte_a_fabriquer=10,
            qte_fabriquee=0,
            qte_restante=10,
        )

        assert checker._get_date_besoin_commande(of) == date(2026, 4, 18)

    def test_get_date_besoin_falls_back_to_date_fin_minus_two_days(self):
        """Sans DATE_DEBUT ni commande liée, on replie sur DATE_FIN - 2 jours."""
        checker = RecursiveChecker(SimpleNamespace(commandes_clients=[]))
        of = OF(
            num_of="F426-10003",
            article="ART003",
            description="OF test",
            statut_num=3,
            statut_texte="Suggéré",
            date_fin=date(2026, 4, 18),
            qte_a_fabriquer=10,
            qte_fabriquee=0,
            qte_restante=10,
        )

        assert checker._get_date_besoin_commande(of) == date(2026, 4, 16)

    def test_fabricated_component_is_declared_missing_and_traversed_to_buy_part(self):
        """Un sous-ensemble fabriqué non couvert remonte comme manquant avec son achat racine bloquant."""
        def make_entry(parent, component, type_article):
            return NomenclatureEntry(
                article_parent=parent,
                designation_parent=f"DESC_{parent}",
                niveau=10,
                article_composant=component,
                designation_composant=f"DESC_{component}",
                qte_lien=1,
                type_article=type_article,
            )

        nomenclatures = {
            "PF_PARENT": Nomenclature(
                article="PF_PARENT",
                designation="DESC_PARENT",
                composants=[make_entry("PF_PARENT", "SE_FAB", TypeArticle.FABRIQUE)],
            ),
            "SE_FAB": Nomenclature(
                article="SE_FAB",
                designation="DESC_SE",
                composants=[make_entry("SE_FAB", "ACH_MISS", TypeArticle.ACHETE)],
            ),
        }
        stocks = {
            "SE_FAB": Stock("SE_FAB", stock_physique=0, stock_alloue=0, stock_sous_cq=0),
            "ACH_MISS": Stock("ACH_MISS", stock_physique=0, stock_alloue=0, stock_sous_cq=0),
        }

        loader = SimpleNamespace(
            commandes_clients=[],
            get_nomenclature=lambda article: nomenclatures.get(article),
            get_stock=lambda article: stocks.get(article),
            get_allocations_of=lambda _num_doc: [],
            get_ofs_by_article=lambda article, statut=None, date_besoin=None: [],
            get_receptions=lambda article: [],
        )

        checker = RecursiveChecker(loader)

        result = checker._check_article_recursive(
            article="PF_PARENT",
            qte_besoin=1,
            date_besoin=date(2026, 4, 1),
            depth=0,
        )

        assert result.feasible is False
        assert result.missing_components["SE_FAB"] == 1
        assert result.missing_components["ACH_MISS"] == 1
        assert any("SE_FAB" in alert for alert in result.alerts)

    def test_subcontracted_fabricated_component_is_treated_like_purchase(self):
        """Un article ST* reste sur la logique stock même si la nomenclature le marque fabriqué."""
        nomenclatures = {
            "PF_PARENT": Nomenclature(
                article="PF_PARENT",
                designation="DESC_PARENT",
                composants=[
                    NomenclatureEntry(
                        article_parent="PF_PARENT",
                        designation_parent="DESC_PARENT",
                        niveau=10,
                        article_composant="ST_COMP",
                        designation_composant="DESC_ST",
                        qte_lien=1,
                        type_article=TypeArticle.FABRIQUE,
                    )
                ],
            ),
        }
        stocks = {
            "ST_COMP": Stock("ST_COMP", stock_physique=0, stock_alloue=0, stock_sous_cq=0),
        }
        articles = {
            "ST_COMP": Article(
                code="ST_COMP",
                description="Sous-traitance",
                categorie="ST01",
                type_appro=TypeApprovisionnement.FABRICATION,
                delai_reappro=0,
            ),
        }

        def fail_if_called(*_args, **_kwargs):
            raise AssertionError("Aucun OF interne ne doit être recherché pour un article ST*")

        loader = SimpleNamespace(
            commandes_clients=[],
            articles=articles,
            get_article=lambda article: articles.get(article),
            get_nomenclature=lambda article: nomenclatures.get(article),
            get_stock=lambda article: stocks.get(article),
            get_allocations_of=lambda _num_doc: [],
            get_ofs_by_article=fail_if_called,
            get_receptions=lambda article: [],
        )

        checker = RecursiveChecker(loader)

        result = checker._check_article_recursive(
            article="PF_PARENT",
            qte_besoin=1,
            date_besoin=date(2026, 4, 1),
            depth=0,
        )

        assert result.feasible is False
        assert result.missing_components["ST_COMP"] == 1

    def test_subcontracted_fabricated_component_uses_stock_when_available(self):
        """Un article ST* avec stock disponible est faisable sans chercher d'OF."""
        nomenclatures = {
            "PF_PARENT": Nomenclature(
                article="PF_PARENT",
                designation="DESC_PARENT",
                composants=[
                    NomenclatureEntry(
                        article_parent="PF_PARENT",
                        designation_parent="DESC_PARENT",
                        niveau=10,
                        article_composant="ST_COMP",
                        designation_composant="DESC_ST",
                        qte_lien=2,
                        type_article=TypeArticle.FABRIQUE,
                    )
                ],
            ),
        }
        stocks = {
            "ST_COMP": Stock("ST_COMP", stock_physique=10, stock_alloue=0, stock_sous_cq=0),
        }
        articles = {
            "ST_COMP": Article(
                code="ST_COMP",
                description="Sous-traitance",
                categorie="ST99",
                type_appro=TypeApprovisionnement.FABRICATION,
                delai_reappro=0,
            ),
        }

        def fail_if_called(*_args, **_kwargs):
            raise AssertionError("Aucun OF interne ne doit être recherché pour un article ST*")

        loader = SimpleNamespace(
            commandes_clients=[],
            articles=articles,
            get_article=lambda article: articles.get(article),
            get_nomenclature=lambda article: nomenclatures.get(article),
            get_stock=lambda article: stocks.get(article),
            get_allocations_of=lambda _num_doc: [],
            get_ofs_by_article=fail_if_called,
            get_receptions=lambda article: [],
        )

        checker = RecursiveChecker(loader)

        result = checker._check_article_recursive(
            article="PF_PARENT",
            qte_besoin=3,
            date_besoin=date(2026, 4, 1),
            depth=0,
        )

        assert result.feasible is True
        assert result.missing_components == {}

    def test_fantom_article_is_resolved_to_single_real_variant(self):
        """Un article AFANT est résolu vers une seule référence réelle."""
        nomenclatures = {
            "PF_PARENT": Nomenclature(
                article="PF_PARENT",
                designation="DESC_PARENT",
                composants=[
                    NomenclatureEntry(
                        article_parent="PF_PARENT",
                        designation_parent="DESC_PARENT",
                        niveau=10,
                        article_composant="PHANTOM",
                        designation_composant="DESC_PHANTOM",
                        qte_lien=1,
                        type_article=TypeArticle.FABRIQUE,
                    )
                ],
            ),
            "PHANTOM": Nomenclature(
                article="PHANTOM",
                designation="DESC_PHANTOM",
                composants=[
                    NomenclatureEntry(
                        article_parent="PHANTOM",
                        designation_parent="DESC_PHANTOM",
                        niveau=5,
                        article_composant="REAL_A",
                        designation_composant="DESC_REAL_A",
                        qte_lien=1,
                        type_article=TypeArticle.ACHETE,
                    )
                ],
            ),
        }
        stocks = {
            "REAL_A": Stock("REAL_A", stock_physique=10, stock_alloue=0, stock_sous_cq=0),
        }
        articles = {
            "PHANTOM": Article(
                code="PHANTOM",
                description="Article fantôme",
                categorie="AFANT",
                type_appro=TypeApprovisionnement.ACHAT,
                delai_reappro=0,
            ),
            "REAL_A": Article(
                code="REAL_A",
                description="Référence réelle",
                categorie="AP",
                type_appro=TypeApprovisionnement.ACHAT,
                delai_reappro=0,
            ),
        }

        loader = SimpleNamespace(
            commandes_clients=[],
            articles=articles,
            get_article=lambda article: articles.get(article),
            get_nomenclature=lambda article: nomenclatures.get(article),
            get_stock=lambda article: stocks.get(article),
            get_allocations_of=lambda _num_doc: [],
            get_ofs_by_article=lambda *_args, **_kwargs: [],
            get_receptions=lambda article: [],
        )

        checker = RecursiveChecker(loader)

        result = checker._check_article_recursive(
            article="PF_PARENT",
            qte_besoin=2,
            date_besoin=date(2026, 4, 1),
            depth=0,
        )

        assert result.feasible is True
        assert result.missing_components == {}
        assert any("PHANTOM" in alert and "REAL_A" in alert for alert in result.alerts)

    def test_fantom_article_can_use_legacy_reference_without_forcing_new_variant(self):
        """Si l'ancienne référence fantôme couvre seule le besoin, l'OF reste faisable."""
        nomenclatures = {
            "PF_PARENT": Nomenclature(
                article="PF_PARENT",
                designation="DESC_PARENT",
                composants=[
                    NomenclatureEntry(
                        article_parent="PF_PARENT",
                        designation_parent="DESC_PARENT",
                        niveau=10,
                        article_composant="PHANTOM",
                        designation_composant="DESC_PHANTOM",
                        qte_lien=1,
                        type_article=TypeArticle.FABRIQUE,
                    )
                ],
            ),
            "PHANTOM": Nomenclature(
                article="PHANTOM",
                designation="DESC_PHANTOM",
                composants=[
                    NomenclatureEntry(
                        article_parent="PHANTOM",
                        designation_parent="DESC_PHANTOM",
                        niveau=5,
                        article_composant="NEW_REF",
                        designation_composant="DESC_NEW",
                        qte_lien=1,
                        type_article=TypeArticle.ACHETE,
                    )
                ],
            ),
        }
        stocks = {
            "PHANTOM": Stock("PHANTOM", stock_physique=10, stock_alloue=0, stock_sous_cq=0),
            "NEW_REF": Stock("NEW_REF", stock_physique=0, stock_alloue=0, stock_sous_cq=0),
        }
        articles = {
            "PHANTOM": Article(
                code="PHANTOM",
                description="Article fantôme",
                categorie="AFANT",
                type_appro=TypeApprovisionnement.ACHAT,
                delai_reappro=0,
            ),
            "NEW_REF": Article(
                code="NEW_REF",
                description="Nouvelle référence",
                categorie="AP",
                type_appro=TypeApprovisionnement.ACHAT,
                delai_reappro=0,
            ),
        }

        loader = SimpleNamespace(
            commandes_clients=[],
            articles=articles,
            get_article=lambda article: articles.get(article),
            get_nomenclature=lambda article: nomenclatures.get(article),
            get_stock=lambda article: stocks.get(article),
            get_allocations_of=lambda _num_doc: [],
            get_ofs_by_article=lambda *_args, **_kwargs: [],
            get_receptions=lambda article: [],
        )

        checker = RecursiveChecker(loader)

        result = checker._check_article_recursive(
            article="PF_PARENT",
            qte_besoin=5,
            date_besoin=date(2026, 4, 1),
            depth=0,
        )

        assert result.feasible is True
        assert result.missing_components == {}
        assert any("PHANTOM" in alert for alert in result.alerts)

    def test_fantom_article_does_not_mix_variants_inside_same_of(self):
        """Un AFANT avec deux variantes partielles reste bloqué si aucune ne couvre seule le besoin."""
        nomenclatures = {
            "PF_PARENT": Nomenclature(
                article="PF_PARENT",
                designation="DESC_PARENT",
                composants=[
                    NomenclatureEntry(
                        article_parent="PF_PARENT",
                        designation_parent="DESC_PARENT",
                        niveau=10,
                        article_composant="PHANTOM",
                        designation_composant="DESC_PHANTOM",
                        qte_lien=1,
                        type_article=TypeArticle.FABRIQUE,
                    )
                ],
            ),
            "PHANTOM": Nomenclature(
                article="PHANTOM",
                designation="DESC_PHANTOM",
                composants=[
                    NomenclatureEntry(
                        article_parent="PHANTOM",
                        designation_parent="DESC_PHANTOM",
                        niveau=5,
                        article_composant="OLD_REF",
                        designation_composant="DESC_OLD",
                        qte_lien=1,
                        type_article=TypeArticle.ACHETE,
                    ),
                    NomenclatureEntry(
                        article_parent="PHANTOM",
                        designation_parent="DESC_PHANTOM",
                        niveau=10,
                        article_composant="NEW_REF",
                        designation_composant="DESC_NEW",
                        qte_lien=1,
                        type_article=TypeArticle.ACHETE,
                    ),
                ],
            ),
        }
        stocks = {
            "OLD_REF": Stock("OLD_REF", stock_physique=3, stock_alloue=0, stock_sous_cq=0),
            "NEW_REF": Stock("NEW_REF", stock_physique=3, stock_alloue=0, stock_sous_cq=0),
        }
        articles = {
            "PHANTOM": Article(
                code="PHANTOM",
                description="Article fantôme",
                categorie="AFANT",
                type_appro=TypeApprovisionnement.ACHAT,
                delai_reappro=0,
            ),
            "OLD_REF": Article(
                code="OLD_REF",
                description="Ancienne référence",
                categorie="AP",
                type_appro=TypeApprovisionnement.ACHAT,
                delai_reappro=0,
            ),
            "NEW_REF": Article(
                code="NEW_REF",
                description="Nouvelle référence",
                categorie="AP",
                type_appro=TypeApprovisionnement.ACHAT,
                delai_reappro=0,
            ),
        }

        loader = SimpleNamespace(
            commandes_clients=[],
            articles=articles,
            get_article=lambda article: articles.get(article),
            get_nomenclature=lambda article: nomenclatures.get(article),
            get_stock=lambda article: stocks.get(article),
            get_allocations_of=lambda _num_doc: [],
            get_ofs_by_article=lambda *_args, **_kwargs: [],
            get_receptions=lambda article: [],
        )

        checker = RecursiveChecker(loader)

        result = checker._check_article_recursive(
            article="PF_PARENT",
            qte_besoin=5,
            date_besoin=date(2026, 4, 1),
            depth=0,
        )

        assert result.feasible is False
        assert result.missing_components["PHANTOM"] == 5
        assert any("aucune variante complète disponible" in alert for alert in result.alerts)

    def test_fantom_sibling_real_variant_is_ignored_when_phantom_present(self):
        """Si le parent contient AFANT + variante réelle, on ne mélange pas les deux."""
        nomenclatures = {
            "PF_PARENT": Nomenclature(
                article="PF_PARENT",
                designation="DESC_PARENT",
                composants=[
                    NomenclatureEntry(
                        article_parent="PF_PARENT",
                        designation_parent="DESC_PARENT",
                        niveau=10,
                        article_composant="PHANTOM",
                        designation_composant="DESC_PHANTOM",
                        qte_lien=1,
                        type_article=TypeArticle.FABRIQUE,
                    ),
                    NomenclatureEntry(
                        article_parent="PF_PARENT",
                        designation_parent="DESC_PARENT",
                        niveau=20,
                        article_composant="REAL_A",
                        designation_composant="DESC_REAL_A",
                        qte_lien=1,
                        type_article=TypeArticle.ACHETE,
                    ),
                ],
            ),
            "PHANTOM": Nomenclature(
                article="PHANTOM",
                designation="DESC_PHANTOM",
                composants=[
                    NomenclatureEntry(
                        article_parent="PHANTOM",
                        designation_parent="DESC_PHANTOM",
                        niveau=5,
                        article_composant="REAL_A",
                        designation_composant="DESC_REAL_A",
                        qte_lien=1,
                        type_article=TypeArticle.ACHETE,
                    )
                ],
            ),
        }
        stocks = {
            "PHANTOM": Stock("PHANTOM", stock_physique=10, stock_alloue=0, stock_sous_cq=0),
            "REAL_A": Stock("REAL_A", stock_physique=0, stock_alloue=0, stock_sous_cq=0),
        }
        articles = {
            "PHANTOM": Article(
                code="PHANTOM",
                description="Article fantôme",
                categorie="AFANT",
                type_appro=TypeApprovisionnement.ACHAT,
                delai_reappro=0,
            ),
            "REAL_A": Article(
                code="REAL_A",
                description="Référence réelle",
                categorie="AP",
                type_appro=TypeApprovisionnement.ACHAT,
                delai_reappro=0,
            ),
        }

        loader = SimpleNamespace(
            commandes_clients=[],
            articles=articles,
            get_article=lambda article: articles.get(article),
            get_nomenclature=lambda article: nomenclatures.get(article),
            get_stock=lambda article: stocks.get(article),
            get_allocations_of=lambda _num_doc: [],
            get_ofs_by_article=lambda *_args, **_kwargs: [],
            get_receptions=lambda article: [],
        )

        checker = RecursiveChecker(loader)

        result = checker._check_article_recursive(
            article="PF_PARENT",
            qte_besoin=5,
            date_besoin=date(2026, 4, 1),
            depth=0,
        )

        assert result.feasible is True
        assert result.missing_components == {}
