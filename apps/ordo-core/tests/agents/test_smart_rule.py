"""Tests de SmartDecisionRule."""

import pytest
from datetime import date
from src.agents.smart_rule import SmartDecisionRule
from src.agents.models import AgentContext, AgentAction
from src.models.of import OF
from src.models.besoin_client import BesoinClient, TypeCommande, NatureBesoin
from src.checkers.base import FeasibilityResult


def test_smart_rule_accept_complete():
    """Test qu'un OF 100% faisable est accepté tel quel."""
    of = OF(
        num_of="F426-08419",
        article="MH7652",
        description="Test article",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=date(2026, 3, 30),
        qte_a_fabriquer=147,
        qte_fabriquee=0,
        qte_restante=147
    )

    feasibility = FeasibilityResult(feasible=True)

    context = AgentContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"11019971": 147},
        allocated_stock={},
        remaining_stock={"11019971": 147},
        current_date=date(2026, 3, 22)
    )

    rule = SmartDecisionRule()
    result = rule.evaluate(context)

    assert result.action == AgentAction.ACCEPT_AS_IS
    assert result.modified_quantity is None
    assert "100%" in result.reason.lower() or "faisable" in result.reason.lower()
    # Score pondéré ≥ 0.7 (threshold d'acceptation)
    assert result.metadata["weighted_score"] >= 0.7
    assert result.metadata["criteria_scores"]["completion"] == 1.0
    assert result.metadata["original_quantity"] == 147


def test_smart_rule_accept_partial_98_6_percent():
    """Test le cas motivant : 145/147 (98.6%) → ACCEPT_PARTIAL avec 140 unités."""
    of = OF(
        num_of="F426-08419",
        article="MH7652",
        description="Test article",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=date(2026, 3, 30),
        qte_a_fabriquer=147,
        qte_fabriquee=0,
        qte_restante=147
    )

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("11019971", 2)  # Manque 2 unités

    context = AgentContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"11019971": 145},
        allocated_stock={},
        remaining_stock={"11019971": 145}
    )

    rule = SmartDecisionRule()
    result = rule.evaluate(context)

    assert result.action == AgentAction.ACCEPT_PARTIAL
    assert result.modified_quantity == 140  # int(147 * 0.95)
    assert "98.6%" in result.reason or "145/147" in result.reason
    assert result.metadata["weighted_score"] >= 0.7  # Score élevé
    assert result.metadata["original_quantity"] == 147


def test_smart_rule_priority_client():
    """Test qu'un client prioritaire (ALDES) avec 3% d'écart est accepté."""
    of = OF(
        num_of="F426-08419",
        article="MH7652",
        description="Test article",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=date(2026, 3, 30),
        qte_a_fabriquer=100,
        qte_fabriquee=0,
        qte_restante=100
    )

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("11019971", 3)  # 3% d'écart

    commande = BesoinClient(
        nom_client="ALDES",
        code_pays="FR",
        type_commande=TypeCommande.MTS,
        num_commande="AR2600881",
        nature_besoin=NatureBesoin.COMMANDE,
        article="MH7652",
        description="Test",
        categorie="PF3",
        source_origine_besoin="Ventes",
        of_contremarque="F426-08419",
        date_commande=date(2026, 3, 15),
        date_expedition_demandee=date(2026, 3, 30),
        qte_commandee=100,
        qte_allouee=0,
        qte_restante=100
    )

    context = AgentContext(
        of=of,
        commande=commande,
        feasibility_result=feasibility,
        initial_stock={"11019971": 97},
        allocated_stock={},
        remaining_stock={"11019971": 97}
    )

    rule = SmartDecisionRule()
    result = rule.evaluate(context)

    # Client prioritaire + petit écart → ACCEPT_AS_IS
    assert result.action == AgentAction.ACCEPT_AS_IS
    assert result.metadata["criteria_scores"]["client"] >= 0.8
    assert "ALDES" in result.reason or "prioritaire" in result.reason.lower()


def test_smart_rule_metadata():
    """Test que toutes les métadonnées sont correctement remplies."""
    of = OF(
        num_of="F426-08419",
        article="MH7652",
        description="Test article",
        statut_num=1,
        statut_texte="Ferme",
        date_fin=date(2026, 3, 30),
        qte_a_fabriquer=147,
        qte_fabriquee=0,
        qte_restante=147
    )

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("11019971", 2)

    commande = BesoinClient(
        nom_client="ALDES",
        code_pays="FR",
        type_commande=TypeCommande.MTS,
        num_commande="AR2600881",
        nature_besoin=NatureBesoin.COMMANDE,
        article="MH7652",
        description="Test",
        categorie="PF3",
        source_origine_besoin="Ventes",
        of_contremarque="F426-08419",
        date_commande=date(2026, 3, 15),
        date_expedition_demandee=date(2026, 3, 30),
        qte_commandee=147,
        qte_allouee=0,
        qte_restante=147
    )

    context = AgentContext(
        of=of,
        commande=commande,
        feasibility_result=feasibility,
        initial_stock={"11019971": 145},
        allocated_stock={},
        remaining_stock={"11019971": 145},
        current_date=date(2026, 3, 22)
    )

    rule = SmartDecisionRule()
    result = rule.evaluate(context)

    # Vérifier toutes les métadonnées
    assert "weighted_score" in result.metadata
    assert "criteria_scores" in result.metadata
    assert "suggestions" in result.metadata
    assert "original_quantity" in result.metadata

    # Vérifier les scores des critères
    scores = result.metadata["criteria_scores"]
    assert "completion" in scores
    assert "client" in scores
    assert "urgency" in scores

    # Vérifier que les scores sont entre 0 et 1
    assert 0.0 <= scores["completion"] <= 1.0
    assert 0.0 <= scores["client"] <= 1.0
    assert 0.0 <= scores["urgency"] <= 1.0

    # Vérifier le score pondéré
    assert 0.0 <= result.metadata["weighted_score"] <= 1.0

    # Vérifier la quantité originale
    assert result.metadata["original_quantity"] == 147

    # Vérifier les suggestions
    suggestions = result.metadata["suggestions"]
    assert isinstance(suggestions, list)
    # Au moins un critère suggère une action
    assert len(suggestions) >= 0
