"""Tests du chargeur de configuration."""

import pytest
import os
from src.agents.config import load_config


def test_load_config_from_file():
    """Test le chargement de la configuration depuis le fichier."""
    config = load_config("config/decisions.yaml")

    assert config is not None
    assert "smart_rule" in config
    assert "completion" in config
    assert "client" in config
    assert "urgency" in config


def test_config_has_required_keys():
    """Test que la configuration a toutes les clés requises."""
    config = load_config("config/decisions.yaml")

    # Vérifier smart_rule
    assert "criteria_weights" in config["smart_rule"]
    assert "completion" in config["smart_rule"]["criteria_weights"]

    # Vérifier completion
    assert "min_acceptable_rate" in config["completion"]
    assert config["completion"]["min_acceptable_rate"] == 0.80

    # Vérifier client
    assert "priority_clients" in config["client"]
    assert "ALDES" in config["client"]["priority_clients"]

    # Vérifier urgency
    assert "very_urgent_days" in config["urgency"]
    assert config["urgency"]["very_urgent_days"] == 3


def test_load_nonexistent_file_raises_error():
    """Test qu'un fichier inexistant lève une erreur."""
    with pytest.raises(FileNotFoundError):
        load_config("config/nonexistent.yaml")
