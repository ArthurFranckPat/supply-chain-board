"""Tests des impacts commandes clients du planning board."""

from datetime import date, timedelta
from types import SimpleNamespace

from production_planning.models import OF
from production_planning.models.article import Article, TypeApprovisionnement
from production_planning.models.besoin_client import BesoinClient, NatureBesoin, TypeCommande
from production_planning.models.nomenclature import Nomenclature, NomenclatureEntry, TypeArticle
from production_planning.models.stock import Stock
from production_planning.services.planning_board_orders import evaluate_order_impacts

TODAY = date.today()
FROM_D = TODAY - timedelta(days=7)
TO_D = TODAY + timedelta(days=42)


def _of(num_of, article, statut=3, debut_offset=5, fin_offset=8, qte=60):
    return OF(
        num_of=num_of,
        article=article,
        description=f"DESC {article}",
        statut_num=statut,
        statut_texte={1: "Ferme", 2: "Planifié", 3: "Suggéré"}[statut],
        date_debut=TODAY + timedelta(days=debut_offset),
        date_fin=TODAY + timedelta(days=fin_offset),
        qte_a_fabriquer=qte,
        qte_fabriquee=0,
        qte_restante=qte,
    )


def _commande(num, article, qte, exp_offset=10, type_cmd=TypeCommande.NOR, contremarque=""):
    return BesoinClient(
        nom_client="ACME",
        code_pays="FR",
        type_commande=type_cmd,
        num_commande=num,
        nature_besoin=NatureBesoin.COMMANDE,
        article=article,
        description=f"DESC {article}",
        categorie="PF3",
        source_origine_besoin="VENTE",
        of_contremarque=contremarque,
        date_commande=TODAY - timedelta(days=3),
        date_expedition_demandee=TODAY + timedelta(days=exp_offset),
        qte_commandee=qte,
        qte_allouee=0,
        qte_restante=qte,
        qte_restante_livraison=qte,
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


def _make_loader(*, ofs, stocks, nomenclatures, articles, commandes_clients):
    return SimpleNamespace(
        ofs=ofs,
        stocks=stocks,
        nomenclatures=nomenclatures,
        articles=articles,
        commandes_clients=commandes_clients,
        receptions=[],
        get_article=lambda a: articles.get(a),
        get_nomenclature=lambda a: nomenclatures.get(a),
        get_stock=lambda a: stocks.get(a),
        get_allocations_of=lambda num: [],
        get_receptions=lambda a: [],
        get_ofs_by_origin=lambda origine, article=None: [
            of for of in ofs
            if of.num_ordre_origine == origine and (article is None or of.article == article)
        ],
        get_ofs_by_article=lambda article, statut=None, date_besoin=None: [
            of for of in ofs
            if of.article == article and of.qte_restante > 0
            and (statut is None or of.statut_num == statut)
        ],
    )


def _base_loader(stock_c1=100, of_fin_offset=8):
    """Une commande NOR 60 x PF1, un OF suggéré 60 x PF1, composant C1."""
    return _make_loader(
        ofs=[_of("OF-A", "PF1", fin_offset=of_fin_offset, qte=60)],
        stocks={
            "C1": Stock("C1", stock_physique=stock_c1, stock_alloue=0, stock_sous_cq=0),
            "PF1": Stock("PF1", stock_physique=0, stock_alloue=0, stock_sous_cq=0),
        },
        nomenclatures={"PF1": _nomenclature("PF1", [("C1", 1)])},
        articles={
            "PF1": _article("PF1"),
            "C1": _article("C1", TypeApprovisionnement.ACHAT, categorie="AP"),
        },
        commandes_clients=[_commande("CMD-1", "PF1", 60, exp_offset=10)],
    )


def test_commande_on_time():
    loader = _base_loader()
    result = evaluate_order_impacts(loader, {}, from_d=FROM_D, to_d=TO_D)
    assert result["stats"]["nb_commandes"] == 1
    row = result["orders"][0]
    assert row["num_commande"] == "CMD-1"
    assert row["statut"] == "on_time"
    assert row["ofs"][0]["num_of"] == "OF-A"
    assert row["jours_retard"] == 0


def test_deplacement_of_cree_retard():
    loader = _base_loader()
    # OF déplacé localement à J+20 alors que la commande veut J+10
    far_debut = (TODAY + timedelta(days=17)).isoformat()
    far_fin = (TODAY + timedelta(days=20)).isoformat()
    overrides = {"OF-A": {"date_debut": far_debut, "date_fin": far_fin}}
    result = evaluate_order_impacts(loader, overrides, from_d=FROM_D, to_d=TO_D)
    row = result["orders"][0]
    assert row["statut"] == "retard"
    assert row["jours_retard"] == 10
    assert row["ofs"][0]["modified"] is True
    assert result["stats"]["nb_retard"] == 1


def test_of_bloque_composants_bloque_la_commande():
    loader = _base_loader(stock_c1=10)  # 10 < 60 → OF infaisable
    result = evaluate_order_impacts(loader, {}, from_d=FROM_D, to_d=TO_D)
    row = result["orders"][0]
    assert row["statut"] == "bloquee"
    assert row["ofs"][0]["faisable"] is False
    assert result["stats"]["nb_bloquees"] == 1


def test_commande_servie_du_stock():
    loader = _base_loader()
    loader.stocks["PF1"] = Stock("PF1", stock_physique=100, stock_alloue=0, stock_sous_cq=0)
    result = evaluate_order_impacts(loader, {}, from_d=FROM_D, to_d=TO_D)
    row = result["orders"][0]
    assert row["statut"] == "stock"
    assert result["stats"]["nb_on_time"] == 1


def test_commande_sans_couverture():
    loader = _base_loader()
    loader.commandes_clients.append(_commande("CMD-2", "PF1", 500, exp_offset=12))
    result = evaluate_order_impacts(loader, {}, from_d=FROM_D, to_d=TO_D)
    cmd2 = next(r for r in result["orders"] if r["num_commande"] == "CMD-2")
    assert cmd2["statut"] == "sans_couverture"
    assert cmd2["reliquat"] > 0


def test_commande_hors_fenetre_ignoree():
    loader = _base_loader()
    loader.commandes_clients.append(_commande("CMD-FAR", "PF1", 10, exp_offset=200))
    result = evaluate_order_impacts(loader, {}, from_d=FROM_D, to_d=TO_D)
    assert all(r["num_commande"] != "CMD-FAR" for r in result["orders"])
