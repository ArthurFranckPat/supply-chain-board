# Couche Décision Métier - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter une couche décision métier qui permet des décisions nuancées (acceptation partielle, report, rejet) basées sur des critères configurables pour le système d'ordonnancement.

**Architecture:**
- Module `src/decisions/` avec architecture de plugins pour les critères
- `SmartDecisionRule` combinant 3 critères (completion, client, urgency) via scoring pondéré
- Configuration YAML centralisée
- Intégration non-destructive avec `AllocationManager` existant
- Persistance JSON et rapports Markdown/JSON

**Tech Stack:**
- Python 3.10+
- PyYAML (configuration)
- dataclasses (models)
- abc.ABC (interface plugins)
- pytest (tests)

---

## File Structure

### Nouveaux fichiers à créer

**Core decision engine:**
- `src/decisions/__init__.py` - Module entry point
- `src/decisions/models.py` - DecisionAction, DecisionResult, DecisionContext
- `src/decisions/engine.py` - DecisionEngine (orchestrateur)
- `src/decisions/config.py` - Chargeur de configuration YAML

**Criteria plugin system:**
- `src/decisions/criteria/__init__.py` - Criteria entry point
- `src/decisions/criteria/base.py` - BaseCriterion interface
- `src/decisions/criteria/completion.py` - CompletionCriterion
- `src/decisions/criteria/client.py` - ClientCriterion
- `src/decisions/criteria/urgency.py` - UrgencyCriterion

**Smart rule:**
- `src/decisions/smart_rule.py` - SmartDecisionRule (règle unifiée)

**Persistence & reports:**
- `src/decisions/persistence.py` - DecisionPersistence (JSON history)
- `src/decisions/reports.py` - DecisionReporter (Markdown/JSON reports)

**Configuration:**
- `config/decisions.yaml` - Configuration centralisée

**Tests:**
- `tests/decisions/__init__.py`
- `tests/decisions/test_models.py`
- `tests/decisions/test_engine.py`
- `tests/decisions/test_config.py`
- `tests/decisions/test_criteria/test_base.py`
- `tests/decisions/test_criteria/test_completion.py`
- `tests/decisions/test_criteria/test_client.py`
- `tests/decisions/test_criteria/test_urgency.py`
- `tests/decisions/test_smart_rule.py`
- `tests/decisions/test_persistence.py`
- `tests/decisions/test_reports.py`
- `tests/decisions/test_integration.py`

### Fichiers à modifier

- `src/models/__init__.py` - Exporter DecisionResult, DecisionAction (optionnel)
- `src/algorithms/allocation.py` - Intégrer DecisionEngine
- `requirements.txt` - Ajouter PyYAML si nécessaire

---

## Task 1: Setup - Configuration YAML et dépendances

**Files:**
- Create: `config/decisions.yaml`
- Modify: `requirements.txt`

- [ ] **Step 1: Create config/decisions.yaml with default configuration**

```yaml
# config/decisions.yaml
# Configuration de la couche décision métier

smart_rule:
  enabled: true
  criteria_weights:
    completion: 0.5
    client: 0.3
    urgency: 0.2

completion:
  min_acceptable_rate: 0.80
  target_completion_rate: 0.95
  max_absolute_gap: 10

client:
  priority_clients:
    - ALDES
  strategic_clients:
    - AERECO
    - PARTN-AIR
  priority_client_max_gap: 0.05

urgency:
  very_urgent_days: 3
  urgent_days: 7
  comfortable_days: 21
  very_urgent_tolerance: 0.05
  urgent_tolerance: 0.02

thresholds:
  accept_threshold: 0.7
  reject_threshold: 0.3

persistence:
  enabled: true
  file_path: "data/decisions_history.json"
  max_entries: 10000

reports:
  enabled: true
  output_dir: "reports/decisions"
  format: ["markdown", "json"]
```

- [ ] **Step 2: Check if PyYAML is in requirements.txt**

Run: `grep -i "pyyaml" requirements.txt`
Expected: Either found (version X.X.X) or not found

- [ ] **Step 3: Add PyYAML to requirements.txt if not present**

```bash
# If not found in Step 2, add:
echo "PyYAML>=6.0" >> requirements.txt
```

- [ ] **Step 4: Install PyYAML**

Run: `pip install -r requirements.txt`
Expected: PyYAML installed successfully

- [ ] **Step 5: Commit**

```bash
git add config/decisions.yaml requirements.txt
git commit -m "feat: add decision config and PyYAML dependency"
```

---

## Task 2: Models - DecisionAction, DecisionResult, DecisionContext

**Files:**
- Create: `src/decisions/__init__.py`
- Create: `src/decisions/models.py`
- Test: `tests/decisions/test_models.py`

- [ ] **Step 1: Create src/decisions/__init__.py**

```python
"""Couche décision métier pour l'ordonnancement.

Ce module fournit un système de décision nuancée basé sur des critères
configurables pour prendre des décisions d'acceptation, de rejet ou de
report d'OFs (Ordres de Fabrication).
"""

from .models import DecisionAction, DecisionResult, DecisionContext
from .engine import DecisionEngine

__all__ = [
    "DecisionAction",
    "DecisionResult",
    "DecisionContext",
    "DecisionEngine",
]
```

- [ ] **Step 2: Write failing tests for models**

Create `tests/decisions/test_models.py`:

```python
"""Tests des modèles de décision."""

import pytest
from datetime import date, datetime
from src.decisions.models import DecisionAction, DecisionResult, DecisionContext
from src.models.of import OF
from src.checkers.base import FeasibilityResult


def test_decision_action_enum():
    """Test que DecisionAction a toutes les valeurs requises."""
    assert hasattr(DecisionAction, 'ACCEPT_AS_IS')
    assert hasattr(DecisionAction, 'ACCEPT_PARTIAL')
    assert hasattr(DecisionAction, 'REJECT')
    assert hasattr(DecisionAction, 'DEFER')
    assert hasattr(DecisionAction, 'DEFER_PARTIAL')


def test_decision_result_creation():
    """Test la création d'un DecisionResult."""
    result = DecisionResult(
        action=DecisionAction.ACCEPT_AS_IS,
        reason="Test reason"
    )

    assert result.action == DecisionAction.ACCEPT_AS_IS
    assert result.reason == "Test reason"
    assert result.modified_quantity is None
    assert result.defer_date is None
    assert result.metadata == {}
    assert isinstance(result.timestamp, datetime)


def test_decision_result_with_partial_acceptance():
    """Test DecisionResult avec acceptation partielle."""
    result = DecisionResult(
        action=DecisionAction.ACCEPT_PARTIAL,
        reason="Accepter 98.6%",
        modified_quantity=145,
        metadata={
            "original_quantity": 147,
            "completion_rate": 0.986
        }
    )

    assert result.action == DecisionAction.ACCEPT_PARTIAL
    assert result.modified_quantity == 145
    assert result.metadata["original_quantity"] == 147


def test_decision_context_creation():
    """Test la création d'un DecisionContext."""
    of = OF(num_of="F123", article="TEST", qte_restante=100)
    feasibility = FeasibilityResult(feasible=False)

    context = DecisionContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"COMP1": 50},
        allocated_stock={},
        remaining_stock={"COMP1": 50}
    )

    assert context.of.num_of == "F123"
    assert context.feasibility_result.feasible is False
    assert context.initial_stock == {"COMP1": 50}
    assert context.allocated_stock == {}
    assert context.remaining_stock == {"COMP1": 50}


def test_decision_context_with_all_fields():
    """Test DecisionContext avec tous les champs."""
    from src.models.besoin_client import BesoinClient, NatureBesoin, TypeCommande

    of = OF(num_of="F123", article="TEST", qte_restante=100)
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

    context = DecisionContext(
        of=of,
        commande=commande,
        feasibility_result=None,
        initial_stock={},
        allocated_stock={},
        remaining_stock={},
        competing_ofs=[of],
        current_date=date(2026, 3, 22)
    )

    assert context.commande.nom_client == "ALDES"
    assert context.competing_ofs == [of]
    assert context.current_date == date(2026, 3, 22)
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/decisions/test_models.py -v`
Expected: FAIL - ModuleNotFoundError: No module named 'src.decisions.models'

- [ ] **Step 4: Implement models.py**

Create `src/decisions/models.py`:

```python
"""Modèles de données pour la couche décision métier."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from ..models.of import OF
from ..models.besoin_client import BesoinClient
from ..checkers.base import FeasibilityResult


class DecisionAction(Enum):
    """Actions possibles après décision métier."""

    ACCEPT_AS_IS = "accept_as_is"
    # → OF accepté tel quel, pas de modification

    ACCEPT_PARTIAL = "accept_partial"
    # → OF accepté avec quantité réduite (modifie OF.qte_restante)

    REJECT = "reject"
    # → OF rejeté, impossible à satisfaire

    DEFER = "defer"
    # → OF reporté à plus tard

    DEFER_PARTIAL = "defer_partial"
    # → Accepter partie immédiate + reporter le reste


@dataclass
class DecisionResult:
    """Résultat d'une décision métier."""

    action: DecisionAction
    # Action décidée

    reason: str
    # Explication courte (ex: "Accepter 98.6% (145/147)")

    modified_quantity: Optional[int] = None
    # Nouvelle quantité si ACCEPT_PARTIAL

    defer_date: Optional[date] = None
    # Date de report si DEFER

    metadata: Dict[str, Any] = field(default_factory=dict)
    # Métadonnées détaillées pour logs/audit

    timestamp: datetime = field(default_factory=datetime.now)
    # Timestamp de la décision


@dataclass
class DecisionContext:
    """Contexte disponible pour les critères de décision."""

    of: OF
    # OF à évaluer

    commande: Optional[BesoinClient] = None
    # Commande associée (si disponible)

    feasibility_result: Optional[FeasibilityResult] = None
    # Résultat de vérification de faisabilité (post-allocation)

    initial_stock: Dict[str, int] = field(default_factory=dict)
    # Stock initial par article (avant toute allocation)

    allocated_stock: Dict[str, int] = field(default_factory=dict)
    # Stock alloué par article (cumul des allocations)

    remaining_stock: Dict[str, int] = field(default_factory=dict)
    # Stock restant par article = initial - allocated

    competing_ofs: List[OF] = field(default_factory=list)
    # OFs en concurrence

    current_date: Optional[date] = None
    # Date courante pour calculs d'urgence
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/decisions/test_models.py -v`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/decisions/ tests/decisions/
git commit -m "feat: add decision models with tests"
```

---

## Task 3: Config Loader

**Files:**
- Create: `src/decisions/config.py`
- Test: `tests/decisions/test_config.py`

- [ ] **Step 1: Write failing test for config loading**

Create `tests/decisions/test_config.py`:

```python
"""Tests du chargeur de configuration."""

import pytest
import os
from src.decisions.config import load_config


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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/decisions/test_config.py -v`
Expected: FAIL - ModuleNotFoundError: No module named 'src.decisions.config'

- [ ] **Step 3: Implement config.py**

Create `src/decisions/config.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/decisions/test_config.py -v`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/decisions/config.py tests/decisions/test_config.py
git commit -m "feat: add YAML config loader with tests"
```

---

## Task 4: Criteria - Base Interface

**Files:**
- Create: `src/decisions/criteria/__init__.py`
- Create: `src/decisions/criteria/base.py`
- Test: `tests/decisions/test_criteria/test_base.py`

- [ ] **Step 1: Create criteria module init**

Create `src/decisions/criteria/__init__.py`:

```python
"""Critères de décision pour la couche décision métier."""

from .base import BaseCriterion

__all__ = ["BaseCriterion"]
```

- [ ] **Step 2: Write failing test for BaseCriterion**

Create `tests/decisions/test_criteria/test_base.py`:

```python
"""Tests de l'interface BaseCriterion."""

import pytest
from src.decisions.criteria.base import BaseCriterion
from src.decisions.models import DecisionContext, DecisionAction
from src.models.of import OF


def test_base_criterion_has_required_attributes():
    """Test que BaseCriterion a les attributs requis."""
    assert hasattr(BaseCriterion, 'CRITERION_ID')
    assert hasattr(BaseCriterion, 'CRITERION_NAME')
    assert hasattr(BaseCriterion, 'DESCRIPTION')
    assert hasattr(BaseCriterion, 'score')
    assert hasattr(BaseCriterion, 'suggest_action')
    assert hasattr(BaseCriterion, 'is_applicable')


def test_base_criterion_is_abstract():
    """Test que BaseCriterion ne peut pas être instanciée directement."""
    with pytest.raises(TypeError):
        BaseCriterion({})


def test_concrete_criterion_implementation():
    """Test l'implémentation d'un critère concret."""

    class DummyCriterion(BaseCriterion):
        CRITERION_ID = "dummy"
        CRITERION_NAME = "Dummy"
        DESCRIPTION = "Dummy criterion for testing"

        def score(self, context):
            return 0.5

        def suggest_action(self, context, score):
            return None

    of = OF(num_of="F123", article="TEST", qte_restante=100)
    context = DecisionContext(of=of)

    criterion = DummyCriterion({})
    assert criterion.CRITERION_ID == "dummy"
    assert criterion.score(context) == 0.5
    assert criterion.is_applicable(context) is True
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pytest tests/decisions/test_criteria/test_base.py -v`
Expected: FAIL - ModuleNotFoundError: No module named 'src.decisions.criteria.base'

- [ ] **Step 4: Implement base.py**

Create `src/decisions/criteria/base.py`:

```python
"""Interface de base pour les critères de décision."""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

from ...models import DecisionContext, DecisionAction


class BaseCriterion(ABC):
    """Interface pour les critères de décision.

    Un critère évalue un contexte et retourne un score entre 0.0 (défavorable)
    et 1.0 (favorable), puis suggère éventuellement une action.
    """

    CRITERION_ID: str
    CRITERION_NAME: str
    DESCRIPTION: str

    def __init__(self, config: Dict[str, Any]):
        """Initialise le critère avec sa configuration.

        Parameters
        ----------
        config : Dict[str, Any]
            Configuration du critère (ex: thresholds, tolerances)
        """
        self.config = config

    @abstractmethod
    def score(self, context: DecisionContext) -> float:
        """Calcule un score entre 0 et 1.

        - 1.0 = Favorable (accepter sans hésitation)
        - 0.5 = Neutre (ni pour ni contre)
        - 0.0 = Défavorable (rejeter si possible)

        Parameters
        ----------
        context : DecisionContext
            Contexte de décision

        Returns
        -------
        float
            Score entre 0.0 et 1.0
        """
        pass

    @abstractmethod
    def suggest_action(self, context: DecisionContext, score: float) -> Optional[DecisionAction]:
        """Suggère une action basée sur le score.

        Parameters
        ----------
        context : DecisionContext
            Contexte de décision
        score : float
            Score calculé par la méthode score()

        Returns
        -------
        Optional[DecisionAction]
            Action suggérée, ou None si le critère ne suggère rien
        """
        pass

    def is_applicable(self, context: DecisionContext) -> bool:
        """Vérifie si le critère s'applique au contexte.

        Par défaut, tous les critères sont applicables. Overridez cette
        méthode pour des critères conditionnels.

        Parameters
        ----------
        context : DecisionContext
            Contexte de décision

        Returns
        -------
        bool
            True si le critère s'applique
        """
        return True
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pytest tests/decisions/test_criteria/test_base.py -v`
Expected: PASS (all 3 tests)

- [ ] **Step 6: Create tests directory init**

Create `tests/decisions/test_criteria/__init__.py`:

```python
"""Tests des critères de décision."""
```

- [ ] **Step 7: Commit**

```bash
git add src/decisions/criteria/ tests/decisions/test_criteria/
git commit -m "feat: add BaseCriterion interface with tests"
```

---

## Task 5: Criteria - CompletionCriterion

**Files:**
- Create: `src/decisions/criteria/completion.py`
- Test: `tests/decisions/test_criteria/test_completion.py`

- [ ] **Step 1: Write failing test for CompletionCriterion**

Create `tests/decisions/test_criteria/test_completion.py`:

```python
"""Tests de CompletionCriterion."""

import pytest
from src.decisions.criteria.completion import CompletionCriterion
from src.decisions.models import DecisionContext, DecisionAction
from src.models.of import OF
from src.checkers.base import FeasibilityResult


def test_completion_criterion_100_percent():
    """Test le score pour un OF 100% faisable."""
    of = OF(num_of="F123", article="TEST", qte_restante=147)

    feasibility = FeasibilityResult(feasible=True)

    context = DecisionContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"11019971": 147},
        allocated_stock={},
        remaining_stock={"11019971": 147}
    )

    criterion = CompletionCriterion({
        "min_acceptable_rate": 0.80,
        "target_completion_rate": 0.95,
        "max_absolute_gap": 10
    })

    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert score == 1.0
    assert action == DecisionAction.ACCEPT_AS_IS


def test_completion_criterion_98_6_percent():
    """Test le cas motivant : 145/147 (98.6%)."""
    of = OF(num_of="F123", article="TEST", qte_restante=147)

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("11019971", 2)

    context = DecisionContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"11019971": 145},
        allocated_stock={},
        remaining_stock={"11019971": 145}
    )

    criterion = CompletionCriterion({
        "min_acceptable_rate": 0.80,
        "target_completion_rate": 0.95,
        "max_absolute_gap": 10
    })

    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert score == 1.0  # 98.6% >= 95% target
    assert action == DecisionAction.ACCEPT_PARTIAL


def test_completion_criterion_below_minimum():
    """Test le score pour un OF < 80%."""
    of = OF(num_of="F123", article="TEST", qte_restante=100)

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("COMP1", 50)  # 50%

    context = DecisionContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"COMP1": 50},
        allocated_stock={},
        remaining_stock={"COMP1": 50}
    )

    criterion = CompletionCriterion({
        "min_acceptable_rate": 0.80,
        "target_completion_rate": 0.95,
        "max_absolute_gap": 10
    })

    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert score == 0.0
    assert action is None


def test_completion_criterion_no_feasibility_result():
    """Test le score quand pas de résultat de faisabilité."""
    of = OF(num_of="F123", article="TEST", qte_restante=100)

    context = DecisionContext(
        of=of,
        feasibility_result=None,
        initial_stock={},
        allocated_stock={},
        remaining_stock={}
    )

    criterion = CompletionCriterion({})

    score = criterion.score(context)

    # Sans résultat de faisabilité → score neutre
    assert score == 0.5
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/decisions/test_criteria/test_completion.py -v`
Expected: FAIL - ModuleNotFoundError: No module named 'src.decisions.criteria.completion'

- [ ] **Step 3: Implement completion.py**

Create `src/decisions/criteria/completion.py`:

```python
"""Critère de taux de complétion."""

from typing import Optional

from .base import BaseCriterion
from ...models import DecisionContext, DecisionAction


class CompletionCriterion(BaseCriterion):
    """Critère de taux de complétion.

    Accepte les OFs avec un taux de complétion ≥ seuil configuré.
    """

    CRITERION_ID = "completion"
    CRITERION_NAME = "Completion Rate"
    DESCRIPTION = "Évalue le taux de complétion de l'OF"

    def score(self, context: DecisionContext) -> float:
        # Si pas de résultat de faisabilité → score neutre
        if not context.feasibility_result:
            return 0.5

        if context.feasibility_result.feasible:
            return 1.0  # 100% faisable

        missing = context.feasibility_result.missing_components
        if not missing:
            return 1.0

        # Calculer le taux de complétion (composant limitant)
        of = context.of
        total_needed = of.qte_restante
        total_missing = sum(missing.values())

        completion_rate = 1.0
        for component, qte_missing in missing.items():
            stock = context.initial_stock.get(component, 0)
            if stock + qte_missing > 0:
                component_rate = stock / (stock + qte_missing)
                completion_rate = min(completion_rate, component_rate)

        # Score linéaire : 0.0 si < 80%, 1.0 si ≥ 95%
        min_rate = self.config.get("min_acceptable_rate", 0.80)
        target_rate = self.config.get("target_completion_rate", 0.95)

        if completion_rate >= target_rate:
            return 1.0
        elif completion_rate <= min_rate:
            return 0.0
        else:
            # Interpolation linéaire
            return (completion_rate - min_rate) / (target_rate - min_rate)

    def suggest_action(self, context: DecisionContext, score: float) -> Optional[DecisionAction]:
        if score >= 1.0:
            return DecisionAction.ACCEPT_AS_IS

        # Si score élevé mais pas parfait → proposer acceptation partielle
        if score >= 0.8:
            target_rate = self.config.get("target_completion_rate", 0.95)

            if context.feasibility_result and context.feasibility_result.missing_components:
                missing = context.feasibility_result.missing_components
                total_missing = sum(missing.values())

                # Calculer la nouvelle quantité
                of = context.of
                modified_quantity = int(of.qte_restante * target_rate)

                # Vérifier aussi l'écart absolu max
                max_gap = self.config.get("max_absolute_gap", 10)
                if total_missing <= max_gap:
                    return DecisionAction.ACCEPT_PARTIAL

        return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/decisions/test_criteria/test_completion.py -v`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Update criteria/__init__.py to export CompletionCriterion**

```python
"""Critères de décision pour la couche décision métier."""

from .base import BaseCriterion
from .completion import CompletionCriterion

__all__ = ["BaseCriterion", "CompletionCriterion"]
```

- [ ] **Step 6: Commit**

```bash
git add src/decisions/criteria/completion.py tests/decisions/test_criteria/test_completion.py
git commit -m "feat: add CompletionCriterion with tests"
```

---

## Task 6: Criteria - ClientCriterion

**Files:**
- Create: `src/decisions/criteria/client.py`
- Test: `tests/decisions/test_criteria/test_client.py`

- [ ] **Step 1: Write failing test for ClientCriterion**

Create `tests/decisions/test_criteria/test_client.py`:

```python
"""Tests de ClientCriterion."""

import pytest
from src.decisions.criteria.client import ClientCriterion
from src.decisions.models import DecisionContext, DecisionAction
from src.models.of import OF
from src.models.besoin_client import BesoinClient
from src.checkers.base import FeasibilityResult


def test_client_criterion_priority_client():
    """Test le score pour un client prioritaire (ALDES)."""
    from src.models.besoin_client import NatureBesoin, TypeCommande

    of = OF(num_of="F123", article="TEST", qte_restante=100)
    commande = BesoinClient(
        nom_client="ALDES",
        code_pays="FR",
        type_commande=TypeCommande.MTS,
        num_commande="C123",
        nature_besoin=NatureBesoin.COMMANDE,
        article="TEST",
        of_contremarque="",
        date_expedition_demandee=date(2026, 3, 30),
        qte_commandee=100,
        qte_allouee=0,
        qte_restante=100
    )

    context = DecisionContext(of=of, commande=commande)

    criterion = ClientCriterion({
        "priority_clients": ["ALDES"],
        "strategic_clients": ["AERECO"],
        "priority_client_max_gap": 0.05
    })

    score = criterion.score(context)

    assert score == 1.0


def test_client_criterion_strategic_client():
    """Test le score pour un client stratégique."""
    from src.models.besoin_client import NatureBesoin, TypeCommande

    of = OF(num_of="F123", article="TEST", qte_restante=100)
    commande = BesoinClient(
        nom_client="AERECO",
        code_pays="FR",
        type_commande=TypeCommande.NOR,
        num_commande="C123",
        nature_besoin=NatureBesoin.COMMANDE,
        article="TEST",
        of_contremarque="",
        date_expedition_demandee=date(2026, 3, 30),
        qte_commandee=100,
        qte_allouee=0,
        qte_restante=100
    )

    context = DecisionContext(of=of, commande=commande)

    criterion = ClientCriterion({
        "priority_clients": ["ALDES"],
        "strategic_clients": ["AERECO", "PARTN-AIR"]
    })

    score = criterion.score(context)

    assert score == 0.8


def test_client_criterion_standard_client():
    """Test le score pour un client standard."""
    from src.models.besoin_client import NatureBesoin, TypeCommande

    of = OF(num_of="F123", article="TEST", qte_restante=100)
    commande = BesoinClient(
        nom_client="Other Client",
        code_pays="DE",
        type_commande=TypeCommande.NOR,
        num_commande="C123",
        nature_besoin=NatureBesoin.COMMANDE,
        article="TEST",
        of_contremarque="",
        date_expedition_demandee=date(2026, 3, 30),
        qte_commandee=100,
        qte_allouee=0,
        qte_restante=100
    )

    context = DecisionContext(of=of, commande=commande)

    criterion = ClientCriterion({})

    score = criterion.score(context)

    assert score == 0.5


def test_client_criterion_no_commande():
    """Test le score sans commande."""
    of = OF(num_of="F123", article="TEST", qte_restante=100)

    context = DecisionContext(of=of, commande=None)

    criterion = ClientCriterion({})

    score = criterion.score(context)

    assert score == 0.5


def test_client_criterion_suggest_action_for_priority():
    """Test la suggestion d'action pour client prioritaire."""
    from src.models.besoin_client import NatureBesoin, TypeCommande

    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        date_fin=date.today() + timedelta(days=5)
    )

    commande = BesoinClient(
        nom_client="ALDES",
        code_pays="FR",
        type_commande=TypeCommande.MTS,
        num_commande="C123",
        nature_besoin=NatureBesoin.COMMANDE,
        article="TEST",
        of_contremarque="",
        date_expedition_demandee=date(2026, 3, 30),
        qte_commandee=100,
        qte_allouee=0,
        qte_restante=100
    )

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("COMP1", 3)  # 3% manquant

    context = DecisionContext(
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

    assert action == DecisionAction.ACCEPT_AS_IS
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/decisions/test_criteria/test_client.py -v`
Expected: FAIL - ModuleNotFoundError: No module named 'src.decisions.criteria.client'

- [ ] **Step 3: Implement client.py**

Create `src/decisions/criteria/client.py`:

```python
"""Critère de priorité client."""

from typing import Optional

from .base import BaseCriterion
from ...models import DecisionContext, DecisionAction


class ClientCriterion(BaseCriterion):
    """Critère de priorité client.

    Priorise les clients stratégiques et prioritaires.
    """

    CRITERION_ID = "client"
    CRITERION_NAME = "Client Priority"
    DESCRIPTION = "Priorise les clients stratégiques"

    def score(self, context: DecisionContext) -> float:
        # Pas de commande → neutre
        if not context.commande:
            return 0.5

        # Utiliser nom_client pour identifier le client
        # (car BesoinClient n'a pas de champ code_client)
        client_name = context.commande.nom_client
        priority_clients = self.config.get("priority_clients", [])
        strategic_clients = self.config.get("strategic_clients", [])

        if client_name in priority_clients:
            return 1.0  # Client prioritaire (ALDES)
        elif client_name in strategic_clients:
            return 0.8  # Client stratégique
        else:
            return 0.5  # Client standard

    def suggest_action(self, context: DecisionContext, score: float) -> Optional[DecisionAction]:
        # Client prioritaire avec OF non faisable → forcer
        if score >= 1.0:
            if context.feasibility_result and not context.feasibility_result.feasible:
                # Vérifier si c'est quand même raisonnable
                missing = context.feasibility_result.missing_components
                total_missing = sum(missing.values())
                total_needed = context.of.qte_restante
                gap_pct = total_missing / total_needed if total_needed > 0 else 0

                # Tolérer jusqu'à 5% pour clients prioritaires
                max_gap_pct = self.config.get("priority_client_max_gap", 0.05)
                if gap_pct <= max_gap_pct:
                    return DecisionAction.ACCEPT_AS_IS

        return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/decisions/test_criteria/test_client.py -v`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Update criteria/__init__.py**

```python
"""Critères de décision pour la couche décision métier."""

from .base import BaseCriterion
from .completion import CompletionCriterion
from .client import ClientCriterion

__all__ = ["BaseCriterion", "CompletionCriterion", "ClientCriterion"]
```

- [ ] **Step 6: Commit**

```bash
git add src/decisions/criteria/client.py tests/decisions/test_criteria/test_client.py
git commit -m "feat: add ClientCriterion with tests"
```

---

## Task 7: Criteria - UrgencyCriterion

**Files:**
- Create: `src/decisions/criteria/urgency.py`
- Test: `tests/decisions/test_criteria/test_urgency.py`

- [ ] **Step 1: Write failing test for UrgencyCriterion**

Create `tests/decisions/test_criteria/test_urgency.py`:

```python
"""Tests de UrgencyCriterion."""

import pytest
from datetime import date, timedelta
from src.decisions.criteria.urgency import UrgencyCriterion
from src.decisions.models import DecisionContext, DecisionAction
from src.models.of import OF
from src.checkers.base import FeasibilityResult


def test_urgency_criterion_very_urgent():
    """Test le score pour un OF très urgent (≤ 3 jours)."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        date_fin=date.today() + timedelta(days=2)
    )

    context = DecisionContext(
        of=of,
        current_date=date.today()
    )

    criterion = UrgencyCriterion({
        "very_urgent_days": 3,
        "urgent_days": 7,
        "comfortable_days": 21
    })

    score = criterion.score(context)

    assert score == 1.0


def test_urgency_criterion_urgent():
    """Test le score pour un OF urgent (≤ 7 jours)."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        date_fin=date.today() + timedelta(days=5)
    )

    context = DecisionContext(
        of=of,
        current_date=date.today()
    )

    criterion = UrgencyCriterion({
        "very_urgent_days": 3,
        "urgent_days": 7,
        "comfortable_days": 21
    })

    score = criterion.score(context)

    assert score == 0.8


def test_urgency_criterion_comfortable():
    """Test le score pour un OF comfortable (≤ 21 jours)."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        date_fin=date.today() + timedelta(days=14)
    )

    context = DecisionContext(
        of=of,
        current_date=date.today()
    )

    criterion = UrgencyCriterion({
        "very_urgent_days": 3,
        "urgent_days": 7,
        "comfortable_days": 21
    })

    score = criterion.score(context)

    assert score == 0.5


def test_urgency_criterion_plenty_of_time():
    """Test le score pour un OF avec beaucoup de temps (> 21 jours)."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        date_fin=date.today() + timedelta(days=30)
    )

    context = DecisionContext(
        of=of,
        current_date=date.today()
    )

    criterion = UrgencyCriterion({
        "very_urgent_days": 3,
        "urgent_days": 7,
        "comfortable_days": 21
    })

    score = criterion.score(context)

    assert score == 0.3


def test_urgency_criterion_no_date():
    """Test le score sans date de fin."""
    of = OF(num_of="F123", article="TEST", qte_restante=100)

    context = DecisionContext(
        of=of,
        current_date=date.today()
    )

    criterion = UrgencyCriterion({})

    score = criterion.score(context)

    assert score == 0.5


def test_urgency_criterion_suggest_action_very_urgent():
    """Test la suggestion d'action pour OF très urgent."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        date_fin=date.today() + timedelta(days=2)
    )

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("COMP1", 3)  # 3% manquant

    context = DecisionContext(
        of=of,
        feasibility_result=feasibility,
        current_date=date.today()
    )

    criterion = UrgencyCriterion({
        "very_urgent_days": 3,
        "very_urgent_tolerance": 0.05,
        "urgent_tolerance": 0.02
    })

    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert action == DecisionAction.ACCEPT_AS_IS


def test_urgency_criterion_suggest_action_urgent():
    """Test la suggestion d'action pour OF urgent."""
    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        date_fin=date.today() + timedelta(days=5)
    )

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("COMP1", 1)  # 1% manquant

    context = DecisionContext(
        of=of,
        feasibility_result=feasibility,
        current_date=date.today()
    )

    criterion = UrgencyCriterion({
        "urgent_days": 7,
        "very_urgent_tolerance": 0.05,
        "urgent_tolerance": 0.02
    })

    score = criterion.score(context)
    action = criterion.suggest_action(context, score)

    assert action == DecisionAction.ACCEPT_AS_IS
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/decisions/test_criteria/test_urgency.py -v`
Expected: FAIL - ModuleNotFoundError: No module named 'src.decisions.criteria.urgency'

- [ ] **Step 3: Implement urgency.py**

Create `src/decisions/criteria/urgency.py`:

```python
"""Critère d'urgence temporelle."""

from typing import Optional

from .base import BaseCriterion
from ...models import DecisionContext, DecisionAction


class UrgencyCriterion(BaseCriterion):
    """Critère d'urgence temporelle.

    Évalue l'urgence de l'OF basée sur la date de fin.
    """

    CRITERION_ID = "urgency"
    CRITERION_NAME = "Urgency"
    DESCRIPTION = "Évalue l'urgence de l'OF"

    def score(self, context: DecisionContext) -> float:
        if not context.of.date_fin or not context.current_date:
            return 0.5

        days_until = (context.of.date_fin - context.current_date).days

        # Définir les seuils
        very_urgent = self.config.get("very_urgent_days", 3)
        urgent = self.config.get("urgent_days", 7)
        comfortable = self.config.get("comfortable_days", 21)

        if days_until <= very_urgent:
            return 1.0  # Très urgent
        elif days_until <= urgent:
            return 0.8  # Urgent
        elif days_until <= comfortable:
            return 0.5  # Comfortable
        else:
            return 0.3  # Beaucoup de temps

    def suggest_action(self, context: DecisionContext, score: float) -> Optional[DecisionAction]:
        if not context.feasibility_result or context.feasibility_result.feasible:
            return None

        # Calculer l'écart en %
        missing = context.feasibility_result.missing_components
        total_missing = sum(missing.values())
        total_needed = context.of.qte_restante
        gap_pct = total_missing / total_needed if total_needed > 0 else 0

        # Tolérances selon urgence
        if score >= 1.0:  # Très urgent
            max_gap = self.config.get("very_urgent_tolerance", 0.05)
            if gap_pct <= max_gap:
                return DecisionAction.ACCEPT_AS_IS
        elif score >= 0.8:  # Urgent
            max_gap = self.config.get("urgent_tolerance", 0.02)
            if gap_pct <= max_gap:
                return DecisionAction.ACCEPT_AS_IS

        return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/decisions/test_criteria/test_urgency.py -v`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Update criteria/__init__.py**

```python
"""Critères de décision pour la couche décision métier."""

from .base import BaseCriterion
from .completion import CompletionCriterion
from .client import ClientCriterion
from .urgency import UrgencyCriterion

__all__ = [
    "BaseCriterion",
    "CompletionCriterion",
    "ClientCriterion",
    "UrgencyCriterion"
]
```

- [ ] **Step 6: Commit**

```bash
git add src/decisions/criteria/urgency.py tests/decisions/test_criteria/test_urgency.py
git commit -m "feat: add UrgencyCriterion with tests"
```

---

## Task 8: SmartDecisionRule

**Files:**
- Create: `src/decisions/smart_rule.py`
- Test: `tests/decisions/test_smart_rule.py`

- [ ] **Step 1: Write failing test for SmartDecisionRule**

Create `tests/decisions/test_smart_rule.py`:

```python
"""Tests de SmartDecisionRule."""

import pytest
from datetime import date, timedelta
from src.decisions.smart_rule import SmartDecisionRule
from src.decisions.models import DecisionContext, DecisionAction
from src.models.of import OF
from src.models.besoin_client import BesoinClient
from src.checkers.base import FeasibilityResult


def test_smart_rule_accept_complete():
    """Test l'acceptation d'un OF complet."""
    of = OF(num_of="F123", article="TEST", qte_restante=100)

    feasibility = FeasibilityResult(feasible=True)

    context = DecisionContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"COMP1": 100},
        allocated_stock={},
        remaining_stock={"COMP1": 100}
    )

    rule = SmartDecisionRule("config/decisions.yaml")
    result = rule.evaluate(context)

    assert result.action == DecisionAction.ACCEPT_AS_IS


def test_smart_rule_accept_partial_98_6_percent():
    """Test l'acceptation partielle (cas motivant)."""
    of = OF(num_of="F123", article="TEST", qte_restante=147)

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("11019971", 2)

    context = DecisionContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"11019971": 145},
        allocated_stock={},
        remaining_stock={"11019971": 145}
    )

    rule = SmartDecisionRule("config/decisions.yaml")
    result = rule.evaluate(context)

    assert result.action == DecisionAction.ACCEPT_PARTIAL
    assert result.modified_quantity == 140  # 147 * 0.95
    assert "98.6%" in result.reason


def test_smart_rule_priority_client():
    """Test la priorité client (ALDES)."""
    from src.models.besoin_client import NatureBesoin, TypeCommande

    of = OF(
        num_of="F123",
        article="TEST",
        qte_restante=100,
        date_fin=date.today() + timedelta(days=5)
    )

    commande = BesoinClient(
        nom_client="ALDES",
        code_pays="FR",
        type_commande=TypeCommande.MTS,
        num_commande="C123",
        nature_besoin=NatureBesoin.COMMANDE,
        article="TEST",
        of_contremarque="",
        date_expedition_demandee=date(2026, 3, 30),
        qte_commandee=100,
        qte_allouee=0,
        qte_restante=100
    )

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("COMP1", 3)  # 3%

    context = DecisionContext(
        of=of,
        commande=commande,
        feasibility_result=feasibility,
        initial_stock={"COMP1": 97}
    )

    rule = SmartDecisionRule("config/decisions.yaml")
    result = rule.evaluate(context)

    # Client prioritaire + gap ≤ 5% → ACCEPT_AS_IS
    assert result.action == DecisionAction.ACCEPT_AS_IS


def test_smart_rule_metadata():
    """Test que les métadonnées sont remplies."""
    of = OF(num_of="F123", article="TEST", qte_restante=147)

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("11019971", 2)

    context = DecisionContext(
        of=of,
        feasibility_result=feasibility,
        initial_stock={"11019971": 145},
        allocated_stock={},
        remaining_stock={"11019971": 145}
    )

    rule = SmartDecisionRule("config/decisions.yaml")
    result = rule.evaluate(context)

    assert "weighted_score" in result.metadata
    assert "criteria_scores" in result.metadata
    assert "original_quantity" in result.metadata
    assert result.metadata["original_quantity"] == 147
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/decisions/test_smart_rule.py -v`
Expected: FAIL - ModuleNotFoundError: No module named 'src.decisions.smart_rule'

- [ ] **Step 3: Implement smart_rule.py**

Create `src/decisions/smart_rule.py`:

```python
"""Règle de décision unifiée combinant tous les critères."""

from typing import Dict, Any, List, Tuple

from .config import load_config
from .criteria import BaseCriterion, CompletionCriterion, ClientCriterion, UrgencyCriterion
from .models import DecisionContext, DecisionResult, DecisionAction


class SmartDecisionRule:
    """Règle de décision unifiée combinant tous les critères."""

    RULE_ID = "smart_decision"
    RULE_NAME = "Smart Decision Rule"

    def __init__(self, config_path: str = "config/decisions.yaml"):
        """Initialise la règle unifiée.

        Parameters
        ----------
        config_path : str
            Chemin vers le fichier de configuration
        """
        # Charger la configuration
        self.config = load_config(config_path)

        # Initialiser les critères
        self.criteria = [
            CompletionCriterion(self.config.get("completion", {})),
            ClientCriterion(self.config.get("client", {})),
            UrgencyCriterion(self.config.get("urgency", {}))
        ]

        # Poids des critères
        self.weights = self.config.get("smart_rule", {}).get("criteria_weights", {
            "completion": 0.5,
            "client": 0.3,
            "urgency": 0.2
        })

        # Seuils
        self.accept_threshold = self.config.get("thresholds", {}).get("accept_threshold", 0.7)
        self.reject_threshold = self.config.get("thresholds", {}).get("reject_threshold", 0.3)

    def evaluate(self, context: DecisionContext) -> DecisionResult:
        """Évalue le contexte et retourne une décision.

        Parameters
        ----------
        context : DecisionContext
            Contexte de décision

        Returns
        -------
        DecisionResult
            Décision avec action, raison et métadonnées
        """
        # 1. Calculer les scores de chaque critère
        scores = {}
        suggestions = []

        for criterion in self.criteria:
            if not criterion.is_applicable(context):
                continue

            score = criterion.score(context)
            scores[criterion.CRITERION_ID] = score

            # Vérifier si le critère suggère une action
            action = criterion.suggest_action(context, score)
            if action:
                suggestions.append((criterion.CRITERION_ID, action))

        # 2. Calculer le score pondéré
        weighted_score = 0.0
        for criterion_id, score in scores.items():
            weight = self.weights.get(criterion_id, 0.0)
            weighted_score += score * weight

        # 3. Déterminer l'action
        action = self._decide_action(weighted_score, suggestions, context)

        # 4. Générer la raison et les métadonnées
        reason, metadata = self._generate_reason(
            action, weighted_score, scores, suggestions, context
        )

        # 5. Calculer la quantité modifiée si acceptation partielle
        modified_quantity = None
        if action == DecisionAction.ACCEPT_PARTIAL:
            modified_quantity = self._calculate_partial_quantity(context)

        return DecisionResult(
            action=action,
            reason=reason,
            modified_quantity=modified_quantity,
            metadata=metadata
        )

    def _decide_action(
        self,
        weighted_score: float,
        suggestions: List[Tuple[str, DecisionAction]],
        context: DecisionContext
    ) -> DecisionAction:
        """Décide de l'action basée sur le score et les suggestions."""
        # 1. Priorité aux suggestions explicites des critères
        if suggestions:
            # Prendre la suggestion du critère avec le score le plus élevé
            best_suggestion = max(suggestions, key=lambda x: x[0])
            return best_suggestion[1]

        # 2. Basé sur le score pondéré
        if weighted_score >= self.accept_threshold:
            return DecisionAction.ACCEPT_AS_IS
        elif weighted_score <= self.reject_threshold:
            return DecisionAction.REJECT
        else:
            # Zone grise → vérifier si acceptation partielle possible
            if context.feasibility_result and not context.feasibility_result.feasible:
                return DecisionAction.ACCEPT_PARTIAL
            else:
                return DecisionAction.ACCEPT_AS_IS

    def _calculate_partial_quantity(self, context: DecisionContext) -> int:
        """Calcule la quantité pour acceptation partielle."""
        target_rate = self.config.get("completion", {}).get("target_completion_rate", 0.95)
        return int(context.of.qte_restante * target_rate)

    def _generate_reason(
        self,
        action: DecisionAction,
        weighted_score: float,
        scores: Dict[str, float],
        suggestions: List[Tuple[str, DecisionAction]],
        context: DecisionContext
    ) -> Tuple[str, Dict[str, Any]]:
        """Génère la raison et les métadonnées."""
        # Raison courte
        if action == DecisionAction.ACCEPT_AS_IS:
            reason = f"Score {weighted_score:.2f} → Accepter tel quel"
        elif action == DecisionAction.ACCEPT_PARTIAL:
            completion_rate = scores.get("completion", 0.0)
            new_qty = self._calculate_partial_quantity(context)
            pct = (new_qty / context.of.qte_restante) * 100 if context.of.qte_restante > 0 else 0
            reason = f"Score {weighted_score:.2f} → Accepter {pct:.1f}% ({new_qty}/{context.of.qte_restante})"
        elif action == DecisionAction.REJECT:
            reason = f"Score {weighted_score:.2f} → Rejeter"
        elif action == DecisionAction.DEFER:
            reason = f"Score {weighted_score:.2f} → Reporter"
        else:
            reason = f"Score {weighted_score:.2f} → {action.value}"

        # Métadonnées détaillées
        metadata = {
            "weighted_score": weighted_score,
            "criteria_scores": scores,
            "suggestions": [(c, a.value) for c, a in suggestions],
            "original_quantity": context.of.qte_restante,
            "rule_applied": self.RULE_ID
        }

        if context.feasibility_result:
            metadata["missing_components"] = context.feasibility_result.missing_components

        return reason, metadata
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/decisions/test_smart_rule.py -v`
Expected: PASS (all 4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/decisions/smart_rule.py tests/decisions/test_smart_rule.py
git commit -m "feat: add SmartDecisionRule with tests"
```

---

## Task 9: DecisionEngine

**Files:**
- Create: `src/decisions/engine.py`
- Test: `tests/decisions/test_engine.py`

- [ ] **Step 1: Write failing test for DecisionEngine**

Create `tests/decisions/test_engine.py`:

```python
"""Tests de DecisionEngine."""

import pytest
from datetime import date, timedelta
from unittest.mock import Mock, patch
from src.decisions.engine import DecisionEngine
from src.decisions.models import DecisionAction
from src.models.of import OF
from src.models.besoin_client import BesoinClient
from src.checkers.base import FeasibilityResult


def test_decision_engine_initialization():
    """Test l'initialisation du DecisionEngine."""
    engine = DecisionEngine()

    assert engine.smart_rule is not None
    assert engine.persistence is not None  # Enabled by default


def test_decision_engine_evaluate_pre_allocation():
    """Test l'évaluation pré-allocation."""
    of = OF(num_of="F123", article="TEST", qte_restante=147)

    engine = DecisionEngine()
    result = engine.evaluate_pre_allocation(
        of=of,
        initial_stock={"11019971": 145}
    )

    assert result.action == DecisionAction.ACCEPT_PARTIAL


def test_decision_engine_evaluate_post_allocation():
    """Test l'évaluation post-allocation."""
    of = OF(num_of="F123", article="TEST", qte_restante=100)

    feasibility = FeasibilityResult(feasible=False)

    allocation_result = Mock()
    allocation_result.feasibility_result = feasibility
    allocation_result.status = "NOT_FEASIBLE"

    engine = DecisionEngine()
    result = engine.evaluate_post_allocation(
        of=of,
        allocation_result=allocation_result
    )

    # Résultat dépend du contexte
    assert isinstance(result.action, DecisionAction)


@patch('src.decisions.persistence.DecisionPersistence')
def test_decision_engine_persists_decisions(mock_persistence):
    """Test que les décisions sont persistées."""
    of = OF(num_of="F123", article="TEST", qte_restante=100)

    engine = DecisionEngine()
    engine.evaluate_pre_allocation(of=of, initial_stock={})

    # Vérifier que save_decision a été appelé
    assert engine.persistence.save_decision.called
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/decisions/test_engine.py -v`
Expected: FAIL - ModuleNotFoundError: No module named 'src.decisions.engine'

- [ ] **Step 3: Implement engine.py**

Create `src/decisions/engine.py`:

```python
"""Moteur de décision pour l'ordonnancement."""

from datetime import date
from typing import Dict, List, Optional

from .smart_rule import SmartDecisionRule
from .models import DecisionResult, DecisionContext, DecisionAction
from ..models.of import OF
from ..models.besoin_client import BesoinClient
from .persistence import DecisionPersistence


class DecisionEngine:
    """Orchestrateur de l'évaluation des décisions métier."""

    def __init__(
        self,
        config_path: str = "config/decisions.yaml",
        persistence_enabled: bool = True
    ):
        """Initialise le moteur de décision.

        Parameters
        ----------
        config_path : str
            Chemin vers le fichier de configuration YAML
        persistence_enabled : bool
            Active la persistance des décisions en JSON
        """
        self.smart_rule = SmartDecisionRule(config_path)
        self.persistence = DecisionPersistence(
            file_path="data/decisions_history.json",
            max_entries=10000
        ) if persistence_enabled else None

    def evaluate_pre_allocation(
        self,
        of: OF,
        initial_stock: Dict[str, int],
        competing_ofs: Optional[List[OF]] = None,
        commande: Optional[BesoinClient] = None
    ) -> DecisionResult:
        """Évalue un OF avant allocation virtuelle.

        Parameters
        ----------
        of : OF
            OF à évaluer
        initial_stock : Dict[str, int]
            Stock initial par article
        competing_ofs : Optional[List[OF]]
            Liste des OFs en concurrence
        commande : Optional[BesoinClient]
            Commande associée

        Returns
        -------
        DecisionResult
            Décision avec action possiblement ACCEPT_PARTIAL
        """
        context = DecisionContext(
            of=of,
            commande=commande,
            initial_stock=initial_stock,
            allocated_stock={},
            remaining_stock=initial_stock.copy(),
            competing_ofs=competing_ofs or [],
            current_date=date.today()
        )

        decision = self.smart_rule.evaluate(context)

        # Persister si activé
        if self.persistence:
            self.persistence.save_decision(
                of_num=of.num_of,
                decision=decision,
                allocation_phase="pre"
            )

        return decision

    def evaluate_post_allocation(
        self,
        of: OF,
        allocation_result,
        commande: Optional[BesoinClient] = None,
        allocated_stock: Optional[Dict[str, int]] = None
    ) -> DecisionResult:
        """Évalue un OF après allocation virtuelle (si échec).

        Parameters
        ----------
        of : OF
            OF à évaluer
        allocation_result
            Résultat de l'allocation
        commande : Optional[BesoinClient]
            Commande associée
        allocated_stock : Optional[Dict[str, int]]
            Stock alloué

        Returns
        -------
        DecisionResult
            Décision avec action DEFER, REJECT ou ACCEPT_AS_IS
        """
        context = DecisionContext(
            of=of,
            commande=commande,
            feasibility_result=allocation_result.feasibility_result,
            initial_stock={},
            allocated_stock=allocated_stock or {},
            remaining_stock={},
            competing_ofs=[],
            current_date=date.today()
        )

        decision = self.smart_rule.evaluate(context)

        # Persister si activé
        if self.persistence:
            self.persistence.save_decision(
                of_num=of.num_of,
                decision=decision,
                allocation_phase="post"
            )

        return decision
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/decisions/test_engine.py -v`
Expected: FAIL - NameError: name 'DecisionPersistence' is not defined

C'est normal, on implémente DecisionPersistence dans la tâche suivante. Pour l'instant, on va mock la persistence.

- [ ] **Step 5: Update engine.py to mock persistence temporarily**

```python
"""Moteur de décision pour l'ordonnancement."""

from datetime import date
from typing import Dict, List, Optional

from .smart_rule import SmartDecisionRule
from .models import DecisionResult, DecisionContext
from ..models.of import OF
from ..models.besoin_client import BesoinClient


class DecisionEngine:
    """Orchestrateur de l'évaluation des décisions métier."""

    def __init__(
        self,
        config_path: str = "config/decisions.yaml",
        persistence_enabled: bool = True
    ):
        """Initialise le moteur de décision."""
        self.smart_rule = SmartDecisionRule(config_path)
        self.persistence = None  # Sera implémenté dans la tâche suivante
        self.persistence_enabled = persistence_enabled

    def evaluate_pre_allocation(
        self,
        of: OF,
        initial_stock: Dict[str, int],
        competing_ofs: Optional[List[OF]] = None,
        commande: Optional[BesoinClient] = None
    ) -> DecisionResult:
        """Évalue un OF avant allocation virtuelle."""
        context = DecisionContext(
            of=of,
            commande=commande,
            initial_stock=initial_stock,
            allocated_stock={},
            remaining_stock=initial_stock.copy(),
            competing_ofs=competing_ofs or [],
            current_date=date.today()
        )

        decision = self.smart_rule.evaluate(context)

        # Persister si activé (sera implémenté)
        if self.persistence:
            self.persistence.save_decision(
                of_num=of.num_of,
                decision=decision,
                allocation_phase="pre"
            )

        return decision

    def evaluate_post_allocation(
        self,
        of: OF,
        allocation_result,
        commande: Optional[BesoinClient] = None,
        allocated_stock: Optional[Dict[str, int]] = None
    ) -> DecisionResult:
        """Évalue un OF après allocation virtuelle (si échec)."""
        context = DecisionContext(
            of=of,
            commande=commande,
            feasibility_result=allocation_result.feasibility_result,
            initial_stock={},
            allocated_stock=allocated_stock or {},
            remaining_stock={},
            competing_ofs=[],
            current_date=date.today()
        )

        decision = self.smart_rule.evaluate(context)

        # Persister si activé (sera implémenté)
        if self.persistence:
            self.persistence.save_decision(
                of_num=of.num_of,
                decision=decision,
                allocation_phase="post"
            )

        return decision
```

- [ ] **Step 6: Update test to not mock yet**

```python
"""Tests de DecisionEngine."""

import pytest
from datetime import date, timedelta
from src.decisions.engine import DecisionEngine
from src.decisions.models import DecisionAction
from src.models.of import OF
from src.models.besoin_client import BesoinClient
from src.checkers.base import FeasibilityResult


def test_decision_engine_initialization():
    """Test l'initialisation du DecisionEngine."""
    engine = DecisionEngine()

    assert engine.smart_rule is not None
    assert engine.persistence is None  # Pas encore implémenté


def test_decision_engine_evaluate_pre_allocation():
    """Test l'évaluation pré-allocation."""
    of = OF(num_of="F123", article="TEST", qte_restante=147)

    engine = DecisionEngine()
    result = engine.evaluate_pre_allocation(
        of=of,
        initial_stock={"11019971": 145}
    )

    assert result.action == DecisionAction.ACCEPT_PARTIAL


def test_decision_engine_evaluate_post_allocation():
    """Test l'évaluation post-allocation."""
    of = OF(num_of="F123", article="TEST", qte_restante=100)

    feasibility = FeasibilityResult(feasible=False)

    allocation_result = Mock()
    allocation_result.feasibility_result = feasibility
    allocation_result.status = "NOT_FEASIBLE"
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `pytest tests/decisions/test_engine.py::test_decision_engine_initialization -v`
Run: `pytest tests/decisions/test_engine.py::test_decision_engine_evaluate_pre_allocation -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/decisions/engine.py tests/decisions/test_engine.py
git commit -m "feat: add DecisionEngine with tests (persistence TODO)"
```

---

## Task 10: Persistence

**Files:**
- Create: `src/decisions/persistence.py`
- Test: `tests/decisions/test_persistence.py`

- [ ] **Step 1: Write failing test for DecisionPersistence**

Create `tests/decisions/test_persistence.py`:

```python
"""Tests de DecisionPersistence."""

import pytest
import json
import tempfile
import os
from datetime import datetime
from src.decisions.persistence import DecisionPersistence
from src.decisions.models import DecisionResult, DecisionAction
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
    of = OF(num_of="F123", article="TEST", qte_restante=100)
    decision = DecisionResult(
        action=DecisionAction.ACCEPT_PARTIAL,
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

    of = OF(num_of="F123", article="TEST", qte_restante=100)
    decision = DecisionResult(
        action=DecisionAction.ACCEPT_AS_IS,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/decisions/test_persistence.py -v`
Expected: FAIL - ModuleNotFoundError: No module named 'src.decisions.persistence'

- [ ] **Step 3: Implement persistence.py**

Create `src/decisions/persistence.py`:

```python
"""Persistance des décisions métier en JSON."""

import json
import os
from typing import Dict, List, Any

from .models import DecisionResult


class DecisionPersistence:
    """Gestion de la persistance des décisions."""

    def __init__(self, file_path: str, max_entries: int = 10000):
        """Initialise la persistance.

        Parameters
        ----------
        file_path : str
            Chemin vers le fichier JSON d'historique
        max_entries : int
            Nombre maximum d'entrées avant rotation
        """
        self.file_path = file_path
        self.max_entries = max_entries

    def save_decision(
        self,
        of_num: str,
        decision: DecisionResult,
        allocation_phase: str
    ):
        """Sauvegarde une décision dans l'historique.

        Parameters
        ----------
        of_num : str
            Numéro de l'OF
        decision : DecisionResult
            Décision à sauvegarder
        allocation_phase : str
            Phase d'allocation ("pre" ou "post")
        """
        entry = {
            "timestamp": decision.timestamp.isoformat(),
            "of_num": of_num,
            "phase": allocation_phase,
            "action": decision.action.value,
            "reason": decision.reason,
            "modified_quantity": decision.modified_quantity,
            "metadata": decision.metadata
        }

        # Charger l'historique existant
        history = self._load_history()

        # Ajouter la nouvelle entrée
        history.append(entry)

        # Rotation si nécessaire
        if len(history) > self.max_entries:
            history = history[-self.max_entries:]

        # Sauvegarder
        self._save_history(history)

    def _load_history(self) -> List[Dict]:
        """Charge l'historique depuis le fichier.

        Returns
        -------
        List[Dict]
            Historique des décisions
        """
        if not os.path.exists(self.file_path):
            return []

        with open(self.file_path, 'r') as f:
            return json.load(f)

    def _save_history(self, history: List[Dict]):
        """Sauvegarde l'historique dans le fichier.

        Parameters
        ----------
        history : List[Dict]
            Historique à sauvegarder
        """
        # Créer le répertoire si nécessaire
        os.makedirs(os.path.dirname(self.file_path), exist_ok=True)

        with open(self.file_path, 'w') as f:
            json.dump(history, f, indent=2)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/decisions/test_persistence.py -v`
Expected: PASS (all 2 tests)

- [ ] **Step 5: Update engine.py to use real persistence**

```python
# Dans engine.py, remplacer:
self.persistence = None  # Sera implémenté dans la tâche suivante

# Par:
if persistence_enabled:
    self.persistence = DecisionPersistence(
        file_path="data/decisions_history.json",
        max_entries=10000
    )
else:
    self.persistence = None
```

- [ ] **Step 6: Update engine imports**

```python
from .persistence import DecisionPersistence
```

- [ ] **Step 7: Run engine tests again**

Run: `pytest tests/decisions/test_engine.py -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/decisions/persistence.py tests/decisions/test_persistence.py src/decisions/engine.py
git commit -m "feat: add DecisionPersistence and integrate in engine"
```

---

## Task 11: Reports

**Files:**
- Create: `src/decisions/reports.py`
- Test: `tests/decisions/test_reports.py'

- [ ] **Step 1: Write failing test for DecisionReporter**

Create `tests/decisions/test_reports.py`:

```python
"""Tests de DecisionReporter."""

import pytest
import tempfile
import os
from datetime import date
from unittest.mock import Mock
from src.decisions.reports import DecisionReporter
from src.decisions.models import DecisionResult, DecisionAction
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
    of = OF(num_of="F123", article="TEST", qte_restante=147)

    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("11019971", 2)

    result1 = Mock()
    result1.of_num = "F123"
    result1.status = "FEASIBLE"
    result1.decision = DecisionResult(
        action=DecisionAction.ACCEPT_PARTIAL,
        reason="Score 0.85 → Accepter 98.6% (145/147)",
        modified_quantity=145,
        metadata={"weighted_score": 0.85}
    )

    result2 = Mock()
    result2.of_num = "F456"
    result2.status = "NOT_FEASIBLE"
    result2.decision = DecisionResult(
        action=DecisionAction.REJECT,
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/decisions/test_reports.py -v`
Expected: FAIL - ModuleNotFoundError: No module named 'src.decisions.reports'

- [ ] **Step 3: Implement reports.py**

Create `src/decisions/reports.py`:

```python
"""Génération de rapports de décisions métier."""

import json
import os
from datetime import datetime
from typing import Dict

from .models import DecisionResult
from ..algorithms.allocation import AllocationResult


class DecisionReporter:
    """Génération de rapports de décisions."""

    def generate_markdown_report(
        self,
        results: Dict[str, AllocationResult],
        output_path: str
    ):
        """Génère un rapport Markdown.

        Parameters
        ----------
        results : Dict[str, AllocationResult]
            Résultats d'allocation par numéro d'OF
        output_path : str
            Chemin du fichier de sortie
        """
        lines = []
        lines.append("# Rapport de Décisions Métier")
        lines.append(f"\nGénéré le : {datetime.now().strftime('%d/%m/%Y %H:%M')}\n")

        # Résumé
        decisions = [r.decision for r in results.values() if hasattr(r, 'decision') and r.decision]

        lines.append("## Résumé\n")
        lines.append(f"- Total OFs traités : {len(results)}")
        lines.append(f"- OFs avec décision : {len(decisions)}")

        # Par action
        action_counts = {}
        for d in decisions:
            action = d.action.value
            action_counts[action] = action_counts.get(action, 0) + 1

        lines.append("\n### Par action")
        for action, count in sorted(action_counts.items()):
            lines.append(f"- **{action}** : {count}")

        # Détail par OF
        lines.append("\n## Détail par OF\n")

        for of_num, result in sorted(results.items()):
            if not hasattr(result, 'decision') or not result.decision:
                continue

            d = result.decision
            lines.append(f"### {of_num}")
            lines.append(f"- **Action** : {d.action.value}")
            lines.append(f"- **Raison** : {d.reason}")

            if d.modified_quantity:
                lines.append(f"- **Quantité modifiée** : {d.modified_quantity}")

            if d.metadata.get('weighted_score'):
                lines.append(f"- **Score** : {d.metadata['weighted_score']:.2f}")

            lines.append("")

        # Écrire le fichier
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w') as f:
            f.write('\n'.join(lines))

    def generate_json_report(
        self,
        results: Dict[str, AllocationResult],
        output_path: str
    ):
        """Génère un rapport JSON.

        Parameters
        ----------
        results : Dict[str, AllocationResult]
            Résultats d'allocation par numéro d'OF
        output_path : str
            Chemin du fichier de sortie
        """
        report = {
            "generated_at": datetime.now().isoformat(),
            "summary": {
                "total_ofs": len(results),
                "with_decisions": sum(1 for r in results.values() if hasattr(r, 'decision') and r.decision)
            },
            "decisions": []
        }

        for of_num, result in sorted(results.items()):
            if not hasattr(result, 'decision') or not result.decision:
                continue

            d = result.decision
            report["decisions"].append({
                "of_num": of_num,
                "action": d.action.value,
                "reason": d.reason,
                "modified_quantity": d.modified_quantity,
                "metadata": d.metadata
            })

        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/decisions/test_reports.py -v`
Expected: PASS (all 2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/decisions/reports.py tests/decisions/test_reports.py
git commit -m "feat: add DecisionReporter with Markdown/JSON reports"
```

---

## Task 12: Integration - AllocationManager

**Files:**
- Modify: `src/algorithms/allocation.py`

- [ ] **Step 1: Update AllocationResult to include decision field**

```python
# Dans src/algorithms/allocation.py, ajouter decision field à AllocationResult:

@dataclass
class AllocationResult:
    """Résultat de l'allocation de stock pour un OF."""

    of_num: str
    status: AllocationStatus
    feasibility_result: Optional[FeasibilityResult] = None
    allocated_quantity: dict[str, int] = None
    decision: Optional[DecisionResult] = None  # NOUVEAU
```

- [ ] **Step 2: Import DecisionResult**

```python
# En haut du fichier allocation.py, ajouter:
from ..decisions.models import DecisionResult
```

- [ ] **Step 3: Update AllocationManager __init__**

```python
# Dans AllocationManager.__init__, ajouter le paramètre decision_engine:

def __init__(self, data_loader, checker, decision_engine=None):
    """Initialise le gestionnaire d'allocation.

    Parameters
    ----------
    data_loader : DataLoader
        Loader de données
    checker : BaseChecker
        Checker pour la vérification de faisabilité
    decision_engine : DecisionEngine, optional
        Moteur de décision métier
    """
    self.data_loader = data_loader
    self.checker = checker
    self.decision_engine = decision_engine
```

- [ ] **Step 4: Update allocate_stock method for pre-allocation**

```python
# Dans allocate_stock(), après la création de stock_state, ajouter:

# NOUVEAU : Évaluation pré-allocation
decisions = {}
original_quantities = {}  # Sauvegarder les quantités originales

if self.decision_engine:
    for of in ofs_for_allocation:
        decision = self.decision_engine.evaluate_pre_allocation(
            of=of,
            initial_stock=stock_state.initial_stock
        )
        decisions[of.num_of] = decision

        # Sauvegarder la quantité originale
        original_quantities[of.num_of] = of.qte_restante

        # Appliquer ACCEPT_PARTIAL
        if decision.action == DecisionAction.ACCEPT_PARTIAL:
            of.qte_restante = decision.modified_quantity
```

- [ ] **Step 5: Update allocation results to include decisions**

```python
# Dans allocate_stock(), après avoir créé result, ajouter:

# NOUVEAU : Enrichir avec la décision
if of.num_of in decisions:
    result.decision = decisions[of.num_of]

# Restaurer la quantité originale si nécessaire
if of.num_of in original_quantities:
    of.qte_restante = original_quantities[of.num_of]
```

- [ ] **Step 6: Add post-allocation evaluation**

```python
# À la fin de allocate_stock(), avant le return, ajouter:

# NOUVEAU : Évaluation post-allocation pour les OF non faisables
if self.decision_engine:
    for of_num, result in results.items():
        if result.status == AllocationStatus.NOT_FEASIBLE and not result.decision:
            of = next((o for o in ofs if o.num_of == of_num), None)
            if of:
                post_decision = self.decision_engine.evaluate_post_allocation(
                    of=of,
                    allocation_result=result
                )

                # Appliquer DEFER/REJECT
                if post_decision.action == DecisionAction.DEFER:
                    result.status = AllocationStatus.DEFERRED
                    result.decision = post_decision
                else:
                    result.decision = post_decision
```

- [ ] **Step 7: Add DEFERRED to AllocationStatus enum**

```python
# Dans AllocationStatus, ajouter:

class AllocationStatus(Enum):
    """Statut d'allocation d'un OF."""

    FEASIBLE = "feasible"
    NOT_FEASIBLE = "not_feasible"
    SKIPPED = "skipped"
    DEFERRED = "deferred"  # NOUVEAU
```

- [ ] **Step 8: Run existing tests**

Run: `pytest tests/ -k "allocation" -v`
Expected: Most existing tests should still pass (some may need adaptation)

- [ ] **Step 9: Commit**

```bash
git add src/algorithms/allocation.py
git commit -m "feat: integrate DecisionEngine in AllocationManager"
```

---

## Task 13: Integration Tests

**Files:**
- Create: `tests/decisions/test_integration.py`

- [ ] **Step 1: Write integration test for end-to-end flow**

Create `tests/decisions/test_integration.py`:

```python
"""Tests d'intégration de la couche décision métier."""

import pytest
from datetime import date, timedelta
from src.decisions.engine import DecisionEngine
from src.algorithms.allocation import AllocationManager
from src.loaders.data_loader import DataLoader
from src.checkers.recursive import RecursiveChecker
from src.models.of import OF
from src.models.besoin_client import BesoinClient


@pytest.fixture
def full_system_with_decision():
    """Setup un système complet avec DecisionEngine."""
    # NOTE: Ce test nécessite des données de test
    # Adapté selon votre environnement de test

    loader = DataLoader("data")
    loader.load_all()

    checker = RecursiveChecker(loader, use_receptions=False)
    decision_engine = DecisionEngine("config/decisions.yaml")

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
        qte_restante=147,
        date_fin=date.today() + timedelta(days=10)
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
    of = OF(num_of="F-TEST-002", article="TEST", qte_restante=100)
    full_system_with_decision.allocate_stock([of])

    # Vérifier que le fichier d'historique existe
    assert os.path.exists("data/decisions_history.json")

    # Vérifier le contenu
    with open("data/decisions_history.json", 'r") as f:
        history = json.load(f)

    # Vérifier qu'on a notre décision
    assert any(entry["of_num"] == "F-TEST-002" for entry in history)


def test_report_generation(full_system_with_decision):
    """Test la génération de rapports."""
    from src.decisions.reports import DecisionReporter
    import tempfile
    import os

    # Lancer une allocation
    of = OF(num_of="F-TEST-003", article="TEST", qte_restante=100)
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
```

- [ ] **Step 2: Run integration tests**

Run: `pytest tests/decisions/test_integration.py -v`
Expected: May fail if test data not set up - adjust as needed

- [ ] **Step 3: Commit**

```bash
git add tests/decisions/test_integration.py
git commit -m "test: add integration tests for decision layer"
```

---

## Task 14: Update main.py to use DecisionEngine

**Files:**
- Modify: `src/main.py`

- [ ] **Step 1: Locate where AllocationManager is instantiated**

Run: `grep -n "AllocationManager" src/main.py`
Expected: Line number(s) where AllocationManager is created

- [ ] **Step 2: Update AllocationManager instantiation**

```python
# Dans main.py, lors de la création de AllocationManager, ajouter:

from src.decisions import DecisionEngine

# ... existing code ...

# Créer le DecisionEngine
decision_engine = DecisionEngine()

# Passer à AllocationManager
allocation_manager = AllocationManager(
    data_loader=loader,
    checker=checker,
    decision_engine=decision_engine  # NOUVEAU
)
```

- [ ] **Step 3: Add report generation after allocation**

```python
# Après l'allocation, générer les rapports si activé:

if config.get("reports", {}).get("enabled", False):
    from src.decisions.reports import DecisionReporter

    reporter = DecisionReporter()

    output_dir = config.get("reports", {}).get("output_dir", "reports/decisions")

    # Générer rapports Markdown et JSON
    if "markdown" in config.get("reports", {}).get("format", []):
        md_path = os.path.join(output_dir, "decisions_report.md")
        reporter.generate_markdown_report(results, md_path)
        print(f"✅ Rapport Markdown généré : {md_path}")

    if "json" in config.get("reports", {}).get("format", []):
        json_path = os.path.join(output_dir, "decisions_report.json")
        reporter.generate_json_report(results, json_path)
        print(f"✅ Rapport JSON généré : {json_path}")
```

- [ ] **Step 4: Test the full flow**

Run: `python -m src.main --data-dir data`
Expected: System runs with decision engine, generates reports

- [ ] **Step 5: Commit**

```bash
git add src/main.py
git commit -m "feat: integrate DecisionEngine in main.py with report generation"
```

---

## Task 15: Final Testing and Documentation

**Files:**
- Update: `README.md` (si applicable)
- Update: `CLAUDE.md` (si applicable)

- [ ] **Step 1: Run full test suite**

Run: `pytest tests/decisions/ -v`
Expected: All tests pass

- [ ] **Step 2: Run integration tests**

Run: `pytest tests/decisions/test_integration.py -v`
Expected: Integration tests pass

- [ ] **Step 3: Test with real data**

Run: `python -m src.main --data-dir data --of F426-08419`
Expected: System processes OF with decision engine

- [ ] **Step 4: Verify report generation**

Run: `ls -la reports/decisions/`
Expected: Markdown and JSON reports exist

- [ ] **Step 5: Update README.md** (optional)

```markdown
# Couche Décision Métier

Le système inclut maintenant une couche décision métier qui permet des décisions nuancées :

- **Acceptation partielle** : Accepter un OF même si quelques composants manquent (≥ 95%)
- **Priorité client** : Forcer la faisabilité pour les clients stratégiques (ALDES, etc.)
- **Urgence** : Tolérer de petits écarts pour les OFs urgents

## Configuration

La configuration se trouve dans `config/decisions.yaml`.

## Rapports

Les rapports de décisions sont générés dans `reports/decisions/` :
- `decisions_report.md` : Rapport lisible
- `decisions_report.json` : Rapport machine-readable
```

- [ ] **Step 6: Verify git status**

Run: `git status`
Expected: All changes committed

- [ ] **Step 7: Final commit**

```bash
git add README.md
git commit -m "docs: document decision layer in README"
```

---

## Success Criteria

✅ **Implémentation complète** :
- Tous les critères implémentés et testés
- DecisionEngine fonctionnel
- Intégration avec AllocationManager réussie
- Persistance JSON opérationnelle
- Rapports Markdown/JSON générés

✅ **Tests** :
- Tests unitaires pour chaque composant
- Tests d'intégration passent
- Couverture de tests ≥ 80%

✅ **Performance** :
- Traitement de 100 OFs en < 2 secondes

✅ **Cas motivant** :
- OF 145/147 (98.6%) accepté avec `ACCEPT_PARTIAL`

---

## Notes

- **YAGNI** : DEFER_PARTIAL n'est pas implémenté (pas demandé pour l'instant)
- **TDD** : Chaque composant a d'abord des tests qui échouent
- **Frequent commits** : Chaque tâche fait l'objet d'un commit
- **Non-destructive** : L'intégration est optionnelle (decision_engine=None par défaut)
