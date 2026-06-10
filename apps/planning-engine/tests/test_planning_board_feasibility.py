"""Tests de l'évaluation de faisabilité du planning board (concurrence + what-if)."""

from datetime import date, timedelta
from types import SimpleNamespace

from production_planning.models import OF
from production_planning.models.article import Article, TypeApprovisionnement
from production_planning.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle
from production_planning.models.stock import Stock
from production_planning.services.planning_board_feasibility import (
    build_effective_ofs,
    evaluate_window,
    whatif_order,
)

TODAY = date.today()
FROM_D = TODAY - timedelta(days=7)
TO_D = TODAY + timedelta(days=42)


def _of(num_of, article, statut=3, debut_offset=5, qte=60):
    return OF(
        num_of=num_of,
        article=article,
        description=f"DESC {article}",
        statut_num=statut,
        statut_texte={1: "Ferme", 2: "Planifié", 3: "Suggéré"}[statut],
        date_debut=TODAY + timedelta(days=debut_offset),
        date_fin=TODAY + timedelta(days=debut_offset + 3),
        qte_a_fabriquer=qte,
        qte_fabriquee=0,
        qte_restante=qte,
    )


def _nomenclature(parent, components):
    return Nomenclature(
        article=parent,
        designation=f"DESC {parent}",
        composants=[
            NomenclatureEntry(
                article_parent=parent,
                designation_parent=f"DESC {parent}",
                niveau=10,
                article_composant=code,
                designation_composant=f"DESC {code}",
                qte_lien=qte,
                type_article=TypeArticle.ACHETE,
            )
            for code, qte in components
        ],
    )


def _article(code, type_appro=TypeApprovisionnement.FABRICATION, categorie="PF3"):
    return Article(
        code=code,
        description=f"DESC {code}",
        categorie=categorie,
        type_appro=type_appro,
        delai_reappro=0,
    )


def _make_loader(*, ofs, stocks, nomenclatures, articles, commandes_clients=None):
    return SimpleNamespace(
        ofs=ofs,
        stocks=stocks,
        nomenclatures=nomenclatures,
        articles=articles,
        commandes_clients=commandes_clients or [],
        receptions=[],
        get_article=lambda a: articles.get(a),
        get_nomenclature=lambda a: nomenclatures.get(a),
        get_stock=lambda a: stocks.get(a),
        get_allocations_of=lambda num: [],
        get_receptions=lambda a: [],
        get_ofs_by_article=lambda article, statut=None, date_besoin=None: [
            of for of in ofs
            if of.article == article and of.qte_restante > 0
            and (statut is None or of.statut_num == statut)
        ],
    )


def _two_of_shared_component(qte_stock=100):
    """PF1 et PF2 consomment tous deux C1 (1/unité). Stock C1 limité."""
    return _make_loader(
        ofs=[
            _of("OF-A", "PF1", debut_offset=5, qte=60),
            _of("OF-B", "PF2", debut_offset=10, qte=60),
        ],
        stocks={"C1": Stock("C1", stock_physique=qte_stock, stock_alloue=0, stock_sous_cq=0)},
        nomenclatures={
            "PF1": _nomenclature("PF1", [("C1", 1)]),
            "PF2": _nomenclature("PF2", [("C1", 1)]),
        },
        articles={
            "PF1": _article("PF1"),
            "PF2": _article("PF2"),
            "C1": _article("C1", TypeApprovisionnement.ACHAT, categorie="AP"),
        },
    )


def test_concurrence_premier_par_date_gagne():
    loader = _two_of_shared_component(qte_stock=100)
    ofs = build_effective_ofs(loader, {}, FROM_D, TO_D)
    entries = evaluate_window(loader, ofs, horizon_end=TO_D)

    # OF-A (besoin J+5) passe avant OF-B (J+10) : 100 - 60 = 40 < 60
    assert entries["OF-A"].faisable is True
    assert entries["OF-A"].allocated == {"C1": 60}
    assert entries["OF-B"].faisable is False
    assert entries["OF-B"].missing_components.get("C1") == 20


def test_affermir_donne_la_priorite():
    loader = _two_of_shared_component(qte_stock=100)
    # OF-B affermi localement → passe devant OF-A malgré sa date plus tardive
    overrides = {"OF-B": {"statut_num": 1}}
    ofs = build_effective_ofs(loader, overrides, FROM_D, TO_D)
    entries = evaluate_window(loader, ofs, horizon_end=TO_D)

    assert entries["OF-B"].faisable is True
    assert entries["OF-A"].faisable is False
    assert entries["OF-A"].missing_components.get("C1") == 20


def test_stock_suffisant_tous_faisables():
    loader = _two_of_shared_component(qte_stock=200)
    ofs = build_effective_ofs(loader, {}, FROM_D, TO_D)
    entries = evaluate_window(loader, ofs, horizon_end=TO_D)
    assert all(e.faisable for e in entries.values())


def test_override_date_sort_de_la_fenetre():
    loader = _two_of_shared_component()
    far = (TODAY + timedelta(days=90)).isoformat()
    overrides = {"OF-B": {"date_debut": far, "date_fin": far}}
    ofs = build_effective_ofs(loader, overrides, FROM_D, TO_D)
    assert {of.num_of for of in ofs} == {"OF-A"}


def test_sans_nomenclature_signale():
    loader = _make_loader(
        ofs=[_of("OF-X", "PF9", qte=10)],
        stocks={},
        nomenclatures={},
        articles={"PF9": _article("PF9")},
    )
    ofs = build_effective_ofs(loader, {}, FROM_D, TO_D)
    entries = evaluate_window(loader, ofs, horizon_end=TO_D)
    assert entries["OF-X"].statut == "sans_nomenclature"


def test_whatif_commande_asseche_un_of_existant():
    loader = _two_of_shared_component(qte_stock=100)
    # Commande client liée à OF-A par contremarque
    loader.commandes_clients = [
        SimpleNamespace(
            num_commande="CMD-1",
            nom_client="ACME",
            article="PF1",
            qte_restante=60,
            date_expedition_demandee=TODAY + timedelta(days=8),
            type_commande="MTS",
            of_contremarque="OF-A",
        )
    ]

    # Nouvelle demande : 50 x PF1 à J+2 → passe avant OF-A et OF-B
    result = whatif_order(
        loader,
        {},
        article="PF1",
        quantite=50,
        date_besoin=TODAY + timedelta(days=2),
        from_d=FROM_D,
        to_d=TO_D,
    )

    assert result["nouvelle"]["faisable"] is True
    degraded_nums = {d["num_of"] for d in result["degraded"]}
    # Avant : A faisable (60), B bloqué. Après : whatif prend 50, A (60>50 restant) bloqué.
    assert "OF-A" in degraded_nums
    of_a = next(d for d in result["degraded"] if d["num_of"] == "OF-A")
    assert of_a["composants_perdus"].get("C1") == 10  # 60 - 50 restants
    assert of_a["commandes"][0]["num_commande"] == "CMD-1"
    assert result["stats"]["nb_degrades"] == len(result["degraded"])
    assert result["stats"]["nb_commandes_touchees"] >= 1


def test_whatif_article_sans_impact():
    loader = _two_of_shared_component(qte_stock=200)
    result = whatif_order(
        loader,
        {},
        article="PF1",
        quantite=10,
        date_besoin=TODAY + timedelta(days=2),
        from_d=FROM_D,
        to_d=TO_D,
    )
    assert result["nouvelle"]["faisable"] is True
    assert result["degraded"] == []
    assert result["improved"] == []
