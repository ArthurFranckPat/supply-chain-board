"""Tests de DecisionPersistence."""

import pytest
import json
import tempfile
import os
from datetime import datetime, date
from src.agents.persistence import DecisionPersistence
from src.agents.models import AgentDecision, AgentAction
from src.models.of import OF


@pytest.fixture
def temp_history_file():
    """Crée un fichier temporaire pour l'historique."""
    fd, path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    yield path
    # Cleanup
    if os.path.exists(path):
        os.remove(path)


def test_persistence_save_decision(temp_history_file):
    """Test la sauvegarde d'une décision."""
    of = OF(
        num_of="F123",
        article="TEST",
        description="Test OF",
        statut_num=3,
        statut_texte="Suggéré",
        date_fin=date.today(),
        qte_a_fabriquer=100,
        qte_fabriquee=0,
        qte_restante=100
    )
    decision = AgentDecision(
        action=AgentAction.ACCEPT_PARTIAL,
        reason="Test reason",
        modified_quantity=95
    )

    persistence = DecisionPersistence(temp_history_file, max_entries=100)
    persistence.save_decision("F123", decision, "pre")

    # Vérifier que le fichier existe
    assert os.path.exists(temp_history_file)

    # Vérifier le contenu
    with open(temp_history_file, 'r') as f:
        history = json.load(f)

    assert len(history) == 1
    assert history[0]["of_num"] == "F123"
    assert history[0]["phase"] == "pre"
    assert history[0]["action"] == "accept_partial"


def test_persistence_rotation(temp_history_file):
    """Test la rotation de l'historique."""
    persistence = DecisionPersistence(temp_history_file, max_entries=3)

    of = OF(
        num_of="F123",
        article="TEST",
        description="Test OF",
        statut_num=3,
        statut_texte="Suggéré",
        date_fin=date.today(),
        qte_a_fabriquer=100,
        qte_fabriquee=0,
        qte_restante=100
    )
    decision = AgentDecision(
        action=AgentAction.ACCEPT_AS_IS,
        reason="Test"
    )

    # Ajouter 5 décisions (max_entries = 3)
    for i in range(5):
        persistence.save_decision(f"F{i}", decision, "pre")

    # Vérifier qu'on a seulement les 3 dernières
    with open(temp_history_file, 'r') as f:
        history = json.load(f)

    assert len(history) == 3
    assert history[0]["of_num"] == "F2"  # Les 3 dernières: F2, F3, F4
    assert history[1]["of_num"] == "F3"
    assert history[2]["of_num"] == "F4"
