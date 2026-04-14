"""Tests d'intégration de la couche décision métier."""

import pytest
from datetime import date, timedelta
from src.agents.engine import AgentEngine
from src.algorithms.allocation import AllocationManager
from src.loaders.data_loader import DataLoader
from src.checkers.recursive import RecursiveChecker
from src.models.of import OF
from src.models.besoin_client import BesoinClient


@pytest.fixture
def full_system_with_decision():
    """Setup un système complet avec AgentEngine."""
    # NOTE: Ce test nécessite des données de test
    # Adapté selon votre environnement de test

    loader = DataLoader("data")
    loader.load_all()

    checker = RecursiveChecker(loader, use_receptions=False)
    decision_engine = AgentEngine("config/decisions.yaml")

    allocation_manager = AllocationManager(
        data_loader=loader,
        checker=checker,
        decision_engine=decision_engine
    )

    return allocation_manager


def test_pre_allocation_accept_partial(full_system_with_decision):
    """Test le flux complet d'acceptation partielle."""
    # Ce test dépend de vos données de test
    # À adapter selon votre environnement

    # Créer un OF de test
    of = OF(
        num_of="F-TEST-001",
        article="TEST_ART",
        description="Test OF",
        statut_num=3,
        statut_texte="Suggéré",
        date_fin=date.today() + timedelta(days=10),
        qte_a_fabriquer=147,
        qte_fabriquee=0,
        qte_restante=147
    )

    # Lancer l'allocation
    results = full_system_with_decision.allocate_stock([of])

    # Vérifier les résultats
    assert "F-TEST-001" in results
    result = results["F-TEST-001"]

    # Vérifier qu'une décision a été prise
    assert result.decision is not None

    # Vérifier les métadonnées
    assert "weighted_score" in result.decision.metadata
    assert "criteria_scores" in result.decision.metadata


def test_decision_persistence_integration(full_system_with_decision):
    """Test que les décisions sont persistées."""
    import os
    import json

    # Lancer une allocation
    of = OF(
        num_of="F-TEST-002",
        article="TEST",
        description="Test OF",
        statut_num=3,
        statut_texte="Suggéré",
        date_fin=date.today(),
        qte_a_fabriquer=100,
        qte_fabriquee=0,
        qte_restante=100
    )
    full_system_with_decision.allocate_stock([of])

    # Vérifier que le fichier d'historique existe
    assert os.path.exists("data/decisions_history.json")

    # Vérifier le contenu
    with open("data/decisions_history.json", "r") as f:
        history = json.load(f)

    # Vérifier qu'on a notre décision
    assert any(entry["of_num"] == "F-TEST-002" for entry in history)


def test_report_generation(full_system_with_decision):
    """Test la génération de rapports."""
    from src.agents.reports import DecisionReporter
    import tempfile
    import os

    # Lancer une allocation
    of = OF(
        num_of="F-TEST-003",
        article="TEST",
        description="Test OF",
        statut_num=3,
        statut_texte="Suggéré",
        date_fin=date.today(),
        qte_a_fabriquer=100,
        qte_fabriquee=0,
        qte_restante=100
    )
    results = full_system_with_decision.allocate_stock([of])

    # Générer les rapports
    reporter = DecisionReporter()

    temp_dir = tempfile.mkdtemp()
    md_path = os.path.join(temp_dir, "report.md")
    json_path = os.path.join(temp_dir, "report.json")

    reporter.generate_markdown_report(results, md_path)
    reporter.generate_json_report(results, json_path)

    # Vérifier que les fichiers existent
    assert os.path.exists(md_path)
    assert os.path.exists(json_path)

    # Cleanup
    import shutil
    shutil.rmtree(temp_dir)
