from datetime import date
from types import SimpleNamespace

from production_planning.feasibility.feasibility_service import FeasibilityService
from production_planning.models.article import Article, TypeApprovisionnement
from production_planning.models.nomenclature import (
    NatureConsommation,
    Nomenclature,
    NomenclatureEntry,
    TypeArticle,
)
from production_planning.models.reception import Reception
from production_planning.models.stock import Stock


def _make_article(code: str, type_appro: TypeApprovisionnement) -> Article:
    return Article(
        code=code,
        description=f"Desc {code}",
        categorie="PF" if type_appro == TypeApprovisionnement.FABRICATION else "AP",
        type_appro=type_appro,
        delai_reappro=0,
    )


def _make_loader(*, articles=None, stocks=None, receptions=None, nomenclatures=None):
    articles = articles or {}
    stocks = stocks or {}
    receptions = receptions or {}
    nomenclatures = nomenclatures or {}
    receptions_list = [item for values in receptions.values() for item in values]
    return SimpleNamespace(
        articles=articles,
        stocks=stocks,
        receptions=receptions_list,
        ofs=[],
        commandes_clients=[],
        get_article=lambda code: articles.get(code),
        get_stock=lambda code: stocks.get(code),
        get_receptions=lambda code: receptions.get(code, []),
        get_nomenclature=lambda code: nomenclatures.get(code),
    )


def test_check_purchase_article_respects_use_receptions_flag():
    loader = _make_loader(
        articles={"C1": _make_article("C1", TypeApprovisionnement.ACHAT)},
        stocks={"C1": Stock("C1", stock_physique=0, stock_alloue=0, stock_sous_cq=0)},
        receptions={
            "C1": [
                Reception(
                    num_commande="PO1",
                    article="C1",
                    code_fournisseur="F1",
                    quantite_restante=10,
                    date_reception_prevue=date(2026, 4, 10),
                )
            ]
        },
    )
    service = FeasibilityService(loader)

    without_receptions = service.check(
        "C1", 5, date(2026, 4, 15), use_receptions=False, check_capacity=False
    )
    with_receptions = service.check(
        "C1", 5, date(2026, 4, 15), use_receptions=True, check_capacity=False
    )

    assert without_receptions.feasible is False
    assert without_receptions.component_gaps[0].quantity_available == 0
    assert with_receptions.feasible is True


def test_check_fabricated_article_respects_use_receptions_flag():
    pf = _make_article("PF1", TypeApprovisionnement.FABRICATION)
    c1 = _make_article("C1", TypeApprovisionnement.ACHAT)
    loader = _make_loader(
        articles={"PF1": pf, "C1": c1},
        stocks={"C1": Stock("C1", stock_physique=0, stock_alloue=0, stock_sous_cq=0)},
        receptions={
            "C1": [
                Reception(
                    num_commande="PO1",
                    article="C1",
                    code_fournisseur="F1",
                    quantite_restante=10,
                    date_reception_prevue=date(2026, 4, 10),
                )
            ]
        },
        nomenclatures={
            "PF1": Nomenclature(
                article="PF1",
                designation="PF1",
                composants=[
                    NomenclatureEntry(
                        article_parent="PF1",
                        designation_parent="PF1",
                        niveau=10,
                        article_composant="C1",
                        designation_composant="C1",
                        qte_lien=1.0,
                        type_article=TypeArticle.ACHETE,
                    )
                ],
            )
        },
    )
    service = FeasibilityService(loader)

    without_receptions = service.check(
        "PF1", 5, date(2026, 4, 15), use_receptions=False, check_capacity=False
    )
    with_receptions = service.check(
        "PF1", 5, date(2026, 4, 15), use_receptions=True, check_capacity=False
    )

    assert without_receptions.feasible is False
    assert without_receptions.component_gaps[0].quantity_available == 0
    assert with_receptions.feasible is True
    assert with_receptions.component_gaps == []


def test_qte_requise_keeps_fractional_values():
    entry = NomenclatureEntry(
        article_parent="PF1",
        designation_parent="PF1",
        niveau=10,
        article_composant="C1",
        designation_composant="C1",
        qte_lien=0.25,
        type_article=TypeArticle.ACHETE,
        nature_consommation=NatureConsommation.PROPORTIONNEL,
    )

    assert entry.qte_requise(3) == 0.75


def test_promise_date_purchase_uses_first_covering_reception():
    loader = _make_loader(
        articles={"C1": _make_article("C1", TypeApprovisionnement.ACHAT)},
        stocks={"C1": Stock("C1", stock_physique=2, stock_alloue=0, stock_sous_cq=0)},
        receptions={
            "C1": [
                Reception(
                    num_commande="PO1",
                    article="C1",
                    code_fournisseur="F1",
                    quantite_restante=2,
                    date_reception_prevue=date(2026, 4, 10),
                ),
                Reception(
                    num_commande="PO2",
                    article="C1",
                    code_fournisseur="F1",
                    quantite_restante=3,
                    date_reception_prevue=date(2026, 4, 12),
                ),
            ]
        },
    )
    service = FeasibilityService(loader)

    result = service.promise_date("C1", 6)

    assert result.feasible is True
    assert result.feasible_date == "2026-04-12"
    assert result.component_gaps[0].quantity_available == 4
    assert result.component_gaps[0].quantity_gap == 2
    assert result.component_gaps[0].earliest_reception == "2026-04-12"
