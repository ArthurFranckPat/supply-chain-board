"""Tests de DecisionReporter."""

import pytest
import tempfile
import os
from datetime import date
from unittest.mock import Mock
from src.agents.reports import DecisionReporter
from src.agents.models import AgentDecision, AgentAction
from src.models.of import OF
from src.checkers.base import FeasibilityResult


@pytest.fixture
def temp_output_dir():
    """Crée un répertoire temporaire pour les rapports."""
    path = tempfile.mkdtemp()
    yield path
    # Cleanup
    import shutil
    if os.path.exists(path):
        shutil.rmtree(path)


@pytest.fixture
def sample_allocation_results():
    """Crée des résultats d'allocation pour les tests."""
    of = OF(
        num_of="F123",
        article="TEST",
        description="Test OF",
        statut_num=3,
        statut_texte="Suggéré",
        date_fin=date.today(),
        qte_a_fabriquer=147,
        qte_fabriquee=0,
        qte_restante=147
    )

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("11019971", 2)

    result1 = Mock()
    result1.of_num = "F123"
    result1.status = "FEASIBLE"
    result1.decision = AgentDecision(
        action=AgentAction.ACCEPT_PARTIAL,
        reason="Score 0.85 → Accepter 98.6% (145/147)",
        modified_quantity=145,
        metadata={"weighted_score": 0.85}
    )

    result2 = Mock()
    result2.of_num = "F456"
    result2.status = "NOT_FEASIBLE"
    result2.decision = AgentDecision(
        action=AgentAction.REJECT,
        reason="Score 0.2 → Rejeter",
        metadata={"weighted_score": 0.2}
    )

    return {"F123": result1, "F456": result2}


def test_generate_markdown_report(temp_output_dir, sample_allocation_results):
    """Test la génération d'un rapport Markdown."""
    output_path = os.path.join(temp_output_dir, "report.md")

    reporter = DecisionReporter()
    reporter.generate_markdown_report(sample_allocation_results, output_path)

    # Vérifier que le fichier existe
    assert os.path.exists(output_path)

    # Vérifier le contenu
    with open(output_path, 'r') as f:
        content = f.read()

    assert "# Rapport de Décisions Métier" in content
    assert "F123" in content
    assert "accept_partial" in content


def test_generate_json_report(temp_output_dir, sample_allocation_results):
    """Test la génération d'un rapport JSON."""
    output_path = os.path.join(temp_output_dir, "report.json")

    reporter = DecisionReporter()
    reporter.generate_json_report(sample_allocation_results, output_path)

    # Vérifier que le fichier existe
    assert os.path.exists(output_path)

    # Vérifier le contenu
    import json
    with open(output_path, 'r') as f:
        report = json.load(f)

    assert "generated_at" in report
    assert "decisions" in report
    assert len(report["decisions"]) == 2
