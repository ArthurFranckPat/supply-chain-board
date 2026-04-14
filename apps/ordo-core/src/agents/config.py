"""Chargeur de configuration YAML pour la couche décision métier."""

import os
from typing import Any, Dict

import yaml


def load_config(config_path: str = "config/decisions.yaml") -> Dict[str, Any]:
    """Charge la configuration depuis un fichier YAML.

    Parameters
    ----------
    config_path : str
        Chemin vers le fichier de configuration

    Returns
    -------
    Dict[str, Any]
        Dictionnaire de configuration

    Raises
    ------
    FileNotFoundError
        Si le fichier de configuration n'existe pas
    yaml.YAMLError
        Si le fichier YAML est invalide
    """
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"Configuration file not found: {config_path}")

    with open(config_path, 'r') as f:
        config = yaml.safe_load(f)

    return config


def get_default_config() -> Dict[str, Any]:
    """Retourne la configuration par défaut (si fichier absent).

    Cette fonction n'est pas utilisée en production, mais fournit
    une fallback pour les tests.
    """
    return {
        "smart_rule": {
            "enabled": True,
            "criteria_weights": {
                "completion": 0.5,
                "client": 0.3,
                "urgency": 0.2
            }
        },
        "completion": {
            "min_acceptable_rate": 0.80,
            "target_completion_rate": 0.95,
            "max_absolute_gap": 10
        },
        "client": {
            "priority_clients": ["ALDES"],
            "strategic_clients": ["AERECO", "PARTN-AIR"],
            "priority_client_max_gap": 0.05
        },
        "urgency": {
            "very_urgent_days": 3,
            "urgent_days": 7,
            "comfortable_days": 21,
            "very_urgent_tolerance": 0.05,
            "urgent_tolerance": 0.02
        },
        "thresholds": {
            "accept_threshold": 0.7,
            "reject_threshold": 0.3
        },
        "persistence": {
            "enabled": True,
            "file_path": "data/decisions_history.json",
            "max_entries": 10000
        },
        "reports": {
            "enabled": True,
            "output_dir": "reports/decisions",
            "format": ["markdown", "json"]
        }
    }
