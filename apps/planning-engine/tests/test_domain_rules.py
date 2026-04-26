from datetime import date

from production_planning.domain_rules import (
    is_component_treated_as_purchase,
    is_firm_of_status,
    is_purchase_article,
    is_subcontracted_article,
    should_include_besoin_for_scheduler,
)
from production_planning.models.article import Article, TypeApprovisionnement
from production_planning.models.besoin_client import BesoinClient, NatureBesoin, TypeCommande


def _make_article(
    code: str,
    *,
    type_appro: TypeApprovisionnement = TypeApprovisionnement.ACHAT,
    categorie: str = "AP",
) -> Article:
    return Article(
        code=code,
        description=code,
        categorie=categorie,
        type_appro=type_appro,
        delai_reappro=0,
    )


def _make_besoin(
    *,
    type_commande: TypeCommande,
    nature_besoin: NatureBesoin,
) -> BesoinClient:
    return BesoinClient(

        nom_client="CLIENT",
        code_pays="FR",
        type_commande=type_commande,
        num_commande="CMD1",
        nature_besoin=nature_besoin,
        article="ART1",
        description="ART1",
        categorie="PF",
        source_origine_besoin="VENTES",
        of_contremarque="",
        date_commande=date(2026, 4, 1),
        date_expedition_demandee=date(2026, 4, 10),
        qte_commandee=10,
        qte_allouee=0,
        qte_restante=10,
        qte_restante_livraison=100,
    )


def test_of_status_rules():
    assert is_firm_of_status(1) is True
    assert is_firm_of_status(2) is False
    assert is_firm_of_status(None) is False


def test_purchase_and_subcontract_rules():
    achat = _make_article("A1", type_appro=TypeApprovisionnement.ACHAT, categorie="AP")
    fab = _make_article("F1", type_appro=TypeApprovisionnement.FABRICATION, categorie="SF")
    st = _make_article("ST1", type_appro=TypeApprovisionnement.FABRICATION, categorie="STX")

    assert is_purchase_article(achat) is True
    assert is_purchase_article(fab) is False
    assert is_subcontracted_article(st) is True
    assert is_subcontracted_article(fab) is False


def test_component_purchase_flow_rule():
    achat = _make_article("A1", type_appro=TypeApprovisionnement.ACHAT, categorie="AP")
    fab = _make_article("F1", type_appro=TypeApprovisionnement.FABRICATION, categorie="SF")
    st = _make_article("ST1", type_appro=TypeApprovisionnement.FABRICATION, categorie="STX")

    assert is_component_treated_as_purchase(
        achat,
        component_is_achete=False,
        component_is_fabrique=True,
    ) is True
    assert is_component_treated_as_purchase(
        fab,
        component_is_achete=False,
        component_is_fabrique=True,
    ) is False
    assert is_component_treated_as_purchase(
        st,
        component_is_achete=False,
        component_is_fabrique=True,
    ) is True
    assert is_component_treated_as_purchase(
        None,
        component_is_achete=True,
        component_is_fabrique=False,
    ) is True


def test_scheduler_scope_rule_by_type_and_nature():
    mts_firm = _make_besoin(type_commande=TypeCommande.MTS, nature_besoin=NatureBesoin.COMMANDE)
    mts_prev = _make_besoin(type_commande=TypeCommande.MTS, nature_besoin=NatureBesoin.PREVISION)
    mto_firm = _make_besoin(type_commande=TypeCommande.MTO, nature_besoin=NatureBesoin.COMMANDE)
    mto_prev = _make_besoin(type_commande=TypeCommande.MTO, nature_besoin=NatureBesoin.PREVISION)
    nor_firm = _make_besoin(type_commande=TypeCommande.NOR, nature_besoin=NatureBesoin.COMMANDE)
    nor_prev = _make_besoin(type_commande=TypeCommande.NOR, nature_besoin=NatureBesoin.PREVISION)

    assert should_include_besoin_for_scheduler(mts_firm) is True
    assert should_include_besoin_for_scheduler(mts_prev) is False
    assert should_include_besoin_for_scheduler(mto_firm) is True
    assert should_include_besoin_for_scheduler(mto_prev) is False
    assert should_include_besoin_for_scheduler(nor_firm) is True
    assert should_include_besoin_for_scheduler(nor_prev) is True
