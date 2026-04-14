"""Tests de ClientCriterion."""

import pytest
from datetime import date, timedelta
from src.agents.criteria.client import ClientCriterion
from src.agents.models import AgentContext, AgentAction
from src.models.of import OF
from src.models.besoin_client import BesoinClient, NatureBesoin, TypeCommande
from src.checkers.base import FeasibilityResult


def test_client_criterion_priority_client():
    """Test le score pour un client prioritaire (ALDES)."""
    of = OF(num_of="F123", article="TEST", qte_restante=100, description="Test OF", statut_num=1, statut_texte="Ferme", date_fin=date.today(), qte_a_fabriquer=100, qte_fabriquee=0)

    commande = BesoinClient(
        nom_client="ALDES",
        code_pays="FR",
        type_commande=TypeCommande.MTS,
        num_commande="C123",
        nature_besoin=NatureBesoin.COMMANDE,
        article="TEST",
        of_contremarque="",
        date_commande=date(2026, 3, 20),
        date_expedition_demandee=date(2026, 3, 30),
        qte_commandee=100,
        qte_allouee=0,
        qte_restante=100
    )

    context = AgentContext(of=of, commande=commande)

    criterion = ClientCriterion({
        "priority_clients": ["ALDES"],
        "strategic_clients": ["AERECO"],
        "priority_client_max_gap": 0.05
    })

    score = criterion.score(context)

    assert score == 1.0


def test_client_criterion_strategic_client():
    """Test le score pour un client stratégique."""
    of = OF(num_of="F123", article="TEST", qte_restante=100, description="Test OF", statut_num=1, statut_texte="Ferme", date_fin=date.today(), qte_a_fabriquer=100, qte_fabriquee=0)

    commande = BesoinClient(
        nom_client="AERECO",
        code_pays="FR",
        type_commande=TypeCommande.NOR,
        num_commande="C123",
        nature_besoin=NatureBesoin.COMMANDE,
        article="TEST",
        of_contremarque="",
        date_commande=date(2026, 3, 20),
        date_expedition_demandee=date(2026, 3, 30),
        qte_commandee=100,
        qte_allouee=0,
        qte_restante=100
    )

    context = AgentContext(of=of, commande=commande)

    criterion = ClientCriterion({
        "priority_clients": ["ALDES"],
        "strategic_clients": ["AERECO", "PARTN-AIR"]
    })

    score = criterion.score(context)

    assert score == 0.8


def test_client_criterion_standard_client():
    """Test le score pour un client standard."""
    of = OF(num_of="F123", article="TEST", qte_restante=100, description="Test OF", statut_num=1, statut_texte="Ferme", date_fin=date.today(), qte_a_fabriquer=100, qte_fabriquee=0)

    commande = BesoinClient(
        nom_client="Other Client",
        code_pays="DE",
        type_commande=TypeCommande.NOR,
        num_commande="C123",
        nature_besoin=NatureBesoin.COMMANDE,
        article="TEST",
        of_contremarque="",
        date_commande=date(2026, 3, 20),
        date_expedition_demandee=date(2026, 3, 30),
        qte_commandee=100,
        qte_allouee=0,
        qte_restante=100
    )

    context = AgentContext(of=of, commande=commande)

    criterion = ClientCriterion({})

    score = criterion.score(context)

    assert score == 0.5


def test_client_criterion_no_commande():
    """Test le score sans commande."""
    of = OF(num_of="F123", article="TEST", qte_restante=100, description="Test OF", statut_num=1, statut_texte="Ferme", date_fin=date.today(), qte_a_fabriquer=100, qte_fabriquee=0)

    context = AgentContext(of=of, commande=None)

    criterion = ClientCriterion({})

    score = criterion.score(context)

    assert score == 0.5


def test_client_criterion_suggest_action_for_priority():
    """Test la suggestion d'action pour client prioritaire."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        description="Test OF",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=date.today() + timedelta(days=5),
        qte_a_fabriquer=100,
        qte_fabriquee=0
    )

    commande = BesoinClient(
        nom_client="ALDES",
        code_pays="FR",
        type_commande=TypeCommande.MTS,
        num_commande="C123",
        nature_besoin=NatureBesoin.COMMANDE,
        article="TEST",
        of_contremarque="",
        date_commande=date(2026, 3, 20),
        date_expedition_demandee=date(2026, 3, 30),
        qte_commandee=100,
        qte_allouee=0,
        qte_restante=100
    )

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("COMP1", 3)  # 3% manquant

    context = AgentContext(
        of=of,
        commande=commande,
        feasibility_result=feasibility
    )

    criterion = ClientCriterion({
        "priority_clients": ["ALDES"],
        "priority_client_max_gap": 0.05
    })

    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert action == AgentAction.ACCEPT_AS_IS
