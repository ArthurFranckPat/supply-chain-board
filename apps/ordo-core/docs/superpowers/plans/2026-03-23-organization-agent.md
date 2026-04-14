# OrganizationAgent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an autonomous agent that analyzes workshop load over 4 weeks (S+1 to S+4) and recommends the optimal organization (1×8, 2×8, 3×8, or partial) for S+1, taking into account trends across all horizons.

**Architecture:** OrganizationAgent orchestrates three specialized components: ChargeCalculator (computes load per poste/horizon), TrendAnalyzer (detects upward/stable/downward patterns), and OrganizationEvaluator (tests scenarios). Each component is independently testable and reusable.

**Tech Stack:** Python 3.11+, pytest, dataclasses, rich (console formatting), existing DataLoader/CommandeOFMatcher infrastructure.

---

## File Structure

```
src/agents/organization/
├── __init__.py
├── models.py                  # Data models (OrganizationResult, TrendType, etc.)
├── charge_calculator.py       # Multi-horizon charge computation
├── trend_analyzer.py          # Trend detection and classification
├── organization_evaluator.py  # Organization scenario evaluation
└── organization_agent.py      # Main orchestrator

tests/agents/organization/
├── __init__.py
├── test_models.py
├── test_charge_calculator.py
├── test_trend_analyzer.py
├── test_organization_evaluator.py
└── test_organization_agent.py
```

---

## Task 1: Create foundation models and types

**Files:**
- Create: `src/agents/organization/models.py`
- Test: `tests/agents/organization/test_models.py`

- [ ] **Step 1: Write the failing test for TrendType enum**

```python
def test_trend_type_enum():
    """TrendType must have three values: UPWARD, STABLE, DOWNWARD"""
    from src.agents.organization.models import TrendType

    assert hasattr(TrendType, 'UPWARD')
    assert hasattr(TrendType, 'STABLE')
    assert hasattr(TrendType, 'DOWNWARD')
    assert len(TrendType) == 3
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
pytest tests/agents/organization/test_models.py::test_trend_type_enum -v
```
Expected: `ImportError: cannot import name 'TrendType'`

- [ ] **Step 3: Write minimal implementation**

```python
from enum import Enum

class TrendType(Enum):
    UPWARD = "upward"
    STABLE = "stable"
    DOWNWARD = "downward"
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/agents/organization/test_models.py::test_trend_type_enum -v
```
Expected: PASS

- [ ] **Step 5: Write test for OrganizationType dataclass**

```python
def test_organization_type_dataclass():
    """OrganizationType stores type and hours"""
    from src.agents.organization.models import OrganizationType

    org = OrganizationType(type="1x8", hours=35)
    assert org.type == "1x8"
    assert org.hours == 35
    assert org.description == "Standard 1x8 (35h/week)"
```

- [ ] **Step 6: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_models.py::test_organization_type_dataclass -v
```
Expected: `ImportError` or `AttributeError`

- [ ] **Step 7: Implement OrganizationType**

```python
@dataclass
class OrganizationType:
    type: str  # "1x8", "2x8", "3x8", "partial"
    hours: float

    @property
    def description(self) -> str:
        if self.type == "1x8":
            return f"Standard 1x8 ({self.hours}h/week)"
        elif self.type == "2x8":
            return f"Two shifts 2x8 ({self.hours}h/week)"
        elif self.type == "3x8":
            return f"Three shifts 3x8 ({self.hours}h/week)"
        else:
            return f"Partial opening ({self.hours}h/week)"
```

- [ ] **Step 8: Run test to verify it passes**

```bash
pytest tests/agents/organization/test_models.py::test_organization_type_dataclass -v
```
Expected: PASS

- [ ] **Step 9: Write test for PosteChargeResult**

```python
def test_poste_charge_result():
    """PosteChargeResult stores charges by horizon"""
    from src.agents.organization.models import PosteChargeResult

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=25.5,
        charge_s2=35.7,
        charge_s3=45.2,
        charge_s4=60.1
    )
    assert result.poste == "PP_830"
    assert result.charge_s1 == 25.5
    assert result.total_charge == 166.5

    # Test trend computation
    result.trend = TrendType.UPWARD
    result.slope = 11.5
    assert result.trend == TrendType.UPWARD
```

- [ ] **Step 10: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_models.py::test_poste_charge_result -v
```
Expected: FAIL

- [ ] **Step 11: Implement PosteChargeResult**

```python
@dataclass
class PosteChargeResult:
    poste: str
    charge_s1: float
    charge_s2: float
    charge_s3: float
    charge_s4: float
    trend: TrendType = TrendType.STABLE
    slope: float = 0.0
    recommended_org: Optional[OrganizationType] = None
    charge_treated: float = 0.0
    coverage_pct: float = 0.0

    @property
    def total_charge(self) -> float:
        return self.charge_s1 + self.charge_s2 + self.charge_s3 + self.charge_s4
```

- [ ] **Step 12: Run tests to verify they pass**

```bash
pytest tests/agents/organization/test_models.py -v
```
Expected: ALL PASS

- [ ] **Step 13: Commit**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
git add src/agents/organization/models.py tests/agents/organization/test_models.py
git commit -m "feat: add OrganizationAgent foundation models

- Add TrendType enum (UPWARD/STABLE/DOWNWARD)
- Add OrganizationType dataclass with description
- Add PosteChargeResult for per-poste charge storage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Implement ChargeCalculator

**Files:**
- Create: `src/agents/organization/charge_calculator.py`
- Test: `tests/agents/organization/test_charge_calculator.py`

- [ ] **Step 1: Write the failing test for single horizon calculation**

```python
from unittest.mock import MagicMock
from datetime import date, timedelta

def test_calculate_charge_for_single_horizon():
    """Calculate charge for one week horizon"""
    from src.agents.organization.charge_calculator import ChargeCalculator

    loader = MagicMock()
    # Mock commandes dans S+1 (jours 1-7)
    cmd1 = MagicMock()
    cmd1.article = "ART001"
    cmd1.date_expedition_demandee = date.today() + timedelta(days=3)
    cmd1.est_commande.return_value = True

    loader.commandes_clients = [cmd1]

    # Mock OF avec gamme
    of1 = MagicMock()
    of1.article = "ART001"
    of1.qte_restante = 700

    # Mock gamme avec opération PP_830
    operation = MagicMock()
    operation.poste_charge = "PP_830"
    operation.cadence = 100.0
    gamme = MagicMock()
    gamme.operations = [operation]
    loader.get_gamme.return_value = gamme

    # Mock matcher
    matcher = MagicMock()
    match_result = MagicMock()
    match_result.of = of1
    match_result.commande = cmd1
    matcher.match_commandes.return_value = [match_result]

    calculator = ChargeCalculator(loader)
    charges = calculator.calculate_charge_for_horizon(
        reference_date=date.today(),
        horizon_weeks=1,
        matcher=matcher
    )

    # 700 unités / 100 cadence = 7 heures
    assert charges["PP_830"] == 7.0
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_charge_calculator.py::test_calculate_charge_for_single_horizon -v
```
Expected: `ImportError`

- [ ] **Step 3: Implement calculate_charge_for_horizon**

```python
from datetime import date, timedelta
from typing import Dict, List

class ChargeCalculator:
    def __init__(self, loader):
        self.loader = loader

    def calculate_charge_for_horizon(
        self,
        reference_date: date,
        horizon_weeks: int,
        matcher
    ) -> Dict[str, float]:
        """
        Calcule la charge par poste pour un horizon donné.

        Parameters
        ----------
        reference_date : date
            Date de référence (aujourd'hui)
        horizon_weeks : int
            Nombre de semaines (1=S+1, 2=S+2, etc.)
        matcher : CommandeOFMatcher
            Matcher pour lier commandes aux OF

        Returns
        -------
        Dict[str, float]
            Dictionnaire poste → heures
        """
        start_day = (horizon_weeks - 1) * 7 + 1
        end_day = horizon_weeks * 7

        start_date = reference_date + timedelta(days=start_day)
        end_date = reference_date + timedelta(days=end_day)

        # Filtrer les commandes dans l'horizon
        commandes_in_horizon = [
            c for c in self.loader.commandes_clients
            if c.est_commande()
            and c.qte_restante > 0
            and start_date <= c.date_expedition_demandee <= end_date
        ]

        if not commandes_in_horizon:
            return {}

        # Matcher commandes → OF
        matching_results = matcher.match_commandes(commandes_in_horizon)

        # Calculer les heures par poste
        hours_per_poste: Dict[str, float] = {}
        for result in matching_results:
            if result.of is None:
                continue

            of = result.of
            gamme = self.loader.get_gamme(of.article)

            if gamme:
                for operation in gamme.operations:
                    if operation.cadence and operation.cadence > 0:
                        h = of.qte_restante / operation.cadence
                        poste = operation.poste_charge
                        hours_per_poste[poste] = hours_per_poste.get(poste, 0) + h

        return hours_per_poste
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/agents/organization/test_charge_calculator.py::test_calculate_charge_for_single_horizon -v
```
Expected: PASS

- [ ] **Step 5: Write test for calculate_charge_horizons (S+1 to S+4)**

```python
def test_calculate_charge_horizons_s1_to_s4():
    """Calculate charge for all 4 horizons"""
    from src.agents.organization.charge_calculator import ChargeCalculator
    from src.agents.organization.models import PosteChargeResult

    loader = MagicMock()
    matcher = MagicMock()

    # Mock pour retourner des charges croissantes
    def mock_calculate_horizon(ref_date, weeks, match):
        if weeks == 1:
            return {"PP_830": 25.0}
        elif weeks == 2:
            return {"PP_830": 35.0}
        elif weeks == 3:
            return {"PP_830": 45.0}
        elif weeks == 4:
            return {"PP_830": 60.0}
        return {}

    calculator = ChargeCalculator(loader)
    calculator.calculate_charge_for_horizon = mock_calculate_horizon

    results = calculator.calculate_charge_horizons(
        reference_date=date.today(),
        matcher=matcher
    )

    assert "PP_830" in results
    assert results["PP_830"].charge_s1 == 25.0
    assert results["PP_830"].charge_s2 == 35.0
    assert results["PP_830"].charge_s3 == 45.0
    assert results["PP_830"].charge_s4 == 60.0
```

- [ ] **Step 6: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_charge_calculator.py::test_calculate_charge_horizons_s1_to_s4 -v
```
Expected: FAIL - method doesn't exist

- [ ] **Step 7: Implement calculate_charge_horizons**

```python
def calculate_charge_horizons(
    self,
    reference_date: date,
    matcher
) -> Dict[str, 'PosteChargeResult']:
    """
    Calcule la charge pour tous les horizons S+1 à S+4.

    Returns
    -------
    Dict[str, PosteChargeResult]
        Dictionnaire poste → résultat avec charges S+1 à S+4
    """
    from .models import PosteChargeResult

    all_postes = set()

    # Calculer pour chaque horizon
    charges_by_horizon = {}
    for week in range(1, 5):
        charges = self.calculate_charge_for_horizon(
            reference_date=reference_date,
            horizon_weeks=week,
            matcher=matcher
        )
        charges_by_horizon[week] = charges
        all_postes.update(charges.keys())

    # Construire les résultats par poste
    results = {}
    for poste in sorted(all_postes):
        results[poste] = PosteChargeResult(
            poste=poste,
            charge_s1=charges_by_horizon[1].get(poste, 0.0),
            charge_s2=charges_by_horizon[2].get(poste, 0.0),
            charge_s3=charges_by_horizon[3].get(poste, 0.0),
            charge_s4=charges_by_horizon[4].get(poste, 0.0)
        )

    return results
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
pytest tests/agents/organization/test_charge_calculator.py -v
```
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
git add src/agents/organization/charge_calculator.py tests/agents/organization/test_charge_calculator.py
git commit -m "feat: implement ChargeCalculator for multi-horizon load analysis

- Add calculate_charge_for_horizon() for single week
- Add calculate_charge_horizons() for S+1 to S+4
- Uses existing DataLoader and CommandeOFMatcher

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Implement TrendAnalyzer

**Files:**
- Create: `src/agents/organization/trend_analyzer.py`
- Test: `tests/agents/organization/test_trend_analyzer.py`

- [ ] **Step 1: Write failing test for slope calculation**

```python
def test_compute_slope_upward_trend():
    """Compute slope from upward trend"""
    from src.agents.organization.trend_analyzer import TrendAnalyzer

    analyzer = TrendAnalyzer()

    # S+1=25, S+2=35, S+3=45, S+4=60 → pente ~11.7h/semaine
    charges = [25.0, 35.0, 45.0, 60.0]
    slope = analyzer.compute_slope(charges)

    assert abs(slope - 11.67) < 0.1
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_trend_analyzer.py::test_compute_slope_upward_trend -v
```
Expected: FAIL

- [ ] **Step 3: Implement compute_slope with linear regression**

```python
import numpy as np

class TrendAnalyzer:
    def compute_slope(self, charges: List[float]) -> float:
        """
        Calcule la pente de régression linéaire.

        Parameters
        ----------
        charges : List[float]
            Liste des charges [S+1, S+2, S+3, S+4]

        Returns
        -------
        float
            Pente en heures/semaine
        """
        if len(charges) < 2:
            return 0.0

        # Régression linéaire simple: y = ax + b
        x = np.arange(len(charges))
        y = np.array(charges)

        # Pente = covariance(x,y) / variance(x)
        x_mean = np.mean(x)
        y_mean = np.mean(y)

        numerator = np.sum((x - x_mean) * (y - y_mean))
        denominator = np.sum((x - x_mean) ** 2)

        if denominator == 0:
            return 0.0

        return float(numerator / denominator)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/agents/organization/test_trend_analyzer.py::test_compute_slope_upward_trend -v
```
Expected: PASS

- [ ] **Step 5: Write test for trend classification**

```python
def test_classify_trend_thresholds():
    """Classify trends based on slope thresholds"""
    from src.agents.organization.trend_analyzer import TrendAnalyzer
    from src.agents.organization.models import TrendType

    analyzer = TrendAnalyzer()

    # Hausse significative: pente > +5
    assert analyzer.classify_trend(11.5) == TrendType.UPWARD
    assert analyzer.classify_trend(5.1) == TrendType.UPWARD

    # Stable: -5 <= pente <= +5
    assert analyzer.classify_trend(0.0) == TrendType.STABLE
    assert analyzer.classify_trend(3.0) == TrendType.STABLE
    assert analyzer.classify_trend(-3.0) == TrendType.STABLE
    assert analyzer.classify_trend(5.0) == TrendType.STABLE
    assert analyzer.classify_trend(-5.0) == TrendType.STABLE

    # Baisse significative: pente < -5
    assert analyzer.classify_trend(-5.1) == TrendType.DOWNWARD
    assert analyzer.classify_trend(-15.0) == TrendType.DOWNWARD
```

- [ ] **Step 6: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_trend_analyzer.py::test_classify_trend_thresholds -v
```
Expected: FAIL

- [ ] **Step 7: Implement classify_trend**

```python
def classify_trend(self, slope: float) -> TrendType:
    """
    Classe la tendance selon la pente.

    Parameters
    ----------
    slope : float
        Pente en heures/semaine

    Returns
    -------
    TrendType
        UPWARD si pente > +5
        STABLE si -5 <= pente <= +5
        DOWNWARD si pente < -5
    """
    from .models import TrendType

    if slope > 5.0:
        return TrendType.UPWARD
    elif slope < -5.0:
        return TrendType.DOWNWARD
    else:
        return TrendType.STABLE
```

- [ ] **Step 8: Write test for analyze_trends (main method)**

```python
def test_analyze_trends_updates_results():
    """Analyze trends and update PosteChargeResult objects"""
    from src.agents.organization.trend_analyzer import TrendAnalyzer
    from src.agents.organization.models import PosteChargeResult, TrendType

    analyzer = TrendAnalyzer()

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=25.0,
        charge_s2=35.0,
        charge_s3=45.0,
        charge_s4=60.0
    )

    results = {"PP_830": result}
    analyzer.analyze_trends(results)

    assert result.trend == TrendType.UPWARD
    assert abs(result.slope - 11.67) < 0.1
```

- [ ] **Step 9: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_trend_analyzer.py::test_analyze_trends_updates_results -v
```
Expected: FAIL

- [ ] **Step 10: Implement analyze_trends**

```python
def analyze_trends(self, results: Dict[str, 'PosteChargeResult']) -> None:
    """
    Analyse les tendances pour tous les postes et met à jour les résultats.

    Parameters
    ----------
    results : Dict[str, PosteChargeResult]
        Résultats par poste (modifié in-place)
    """
    for result in results.values():
        charges = [result.charge_s1, result.charge_s2, result.charge_s3, result.charge_s4]
        slope = self.compute_slope(charges)
        trend = self.classify_trend(slope)

        result.slope = slope
        result.trend = trend
```

- [ ] **Step 11: Run all tests**

```bash
pytest tests/agents/organization/test_trend_analyzer.py -v
```
Expected: ALL PASS

- [ ] **Step 12: Commit**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
git add src/agents/organization/trend_analyzer.py tests/agents/organization/test_trend_analyzer.py
git commit -m "feat: implement TrendAnalyzer with linear regression

- Add compute_slope() using linear regression
- Add classify_trend() with ±5h/week thresholds
- Add analyze_trends() to update all PosteChargeResult objects

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Implement OrganizationEvaluator

**Files:**
- Create: `src/agents/organization/organization_evaluator.py`
- Test: `tests/agents/organization/test_organization_evaluator.py`

- [ ] **Step 1: Write failing test for getting organization scenarios**

```python
def test_get_organization_scenarios():
    """Get all possible organization types"""
    from src.agents.organization.organization_evaluator import OrganizationEvaluator

    evaluator = OrganizationEvaluator()
    scenarios = evaluator.get_organization_scenarios()

    assert len(scenarios) == 4
    assert scenarios[0].type == "1x8"
    assert scenarios[0].hours == 35.0
    assert scenarios[1].type == "2x8"
    assert scenarios[1].hours == 70.0
    assert scenarios[2].type == "3x8"
    assert scenarios[2].hours == 105.0
    assert scenarios[3].type == "partial"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_organization_evaluator.py::test_get_organization_scenarios -v
```
Expected: FAIL

- [ ] **Step 3: Implement get_organization_scenarios**

```python
from typing import List
from .models import OrganizationType

class OrganizationEvaluator:
    def get_organization_scenarios(self) -> List[OrganizationType]:
        """
        Retourne tous les scénarios d'organisation possibles.

        Returns
        -------
        List[OrganizationType]
            Liste des organisations du plus léger au plus lourd
        """
        return [
            OrganizationType(type="1x8", hours=35.0),
            OrganizationType(type="2x8", hours=70.0),
            OrganizationType(type="3x8", hours=105.0),
            OrganizationType(type="partial", hours=17.5)  # 2.5 days
        ]
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/agents/organization/test_organization_evaluator.py::test_get_organization_scenarios -v
```
Expected: PASS

- [ ] **Step 5: Write test for evaluating single organization**

```python
def test_evaluate_organization_coverage():
    """Evaluate coverage rate for an organization"""
    from src.agents.organization.organization_evaluator import OrganizationEvaluator
    from src.agents.organization.models import PosteChargeResult, TrendType, OrganizationType

    evaluator = OrganizationEvaluator()

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=25.0,
        charge_s2=35.0,
        charge_s3=45.0,
        charge_s4=60.0,
        trend=TrendType.UPWARD
    )

    org = OrganizationType(type="1x8", hours=35.0)

    charge_treated, coverage_pct = evaluator.evaluate_organization(result, org)

    assert charge_treated == 25.0  # S+1 charge
    assert coverage_pct == 100.0  # 25/35 = 71% mais charge traitée = 100% de S+1
```

- [ ] **Step 6: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_organization_evaluator.py::test_evaluate_organization_coverage -v
```
Expected: FAIL

- [ ] **Step 7: Implement evaluate_organization**

```python
def evaluate_organization(
    self,
    result: 'PosteChargeResult',
    organization: OrganizationType
) -> tuple[float, float]:
    """
    Évalue une organisation pour un poste.

    Parameters
    ----------
    result : PosteChargeResult
        Résultat de charge pour le poste
    organization : OrganizationType
        Organisation à évaluer

    Returns
    -------
    tuple[float, float]
        (charge_traitée, taux_couverture%)
    """
    charge_s1 = result.charge_s1

    # La charge traitée est min(charge_s1, capacité)
    charge_treated = min(charge_s1, organization.hours)

    # Taux de couverture de S+1
    coverage_pct = (charge_treated / charge_s1 * 100) if charge_s1 > 0 else 0.0

    return charge_treated, coverage_pct
```

- [ ] **Step 8: Write test for selecting optimal organization**

```python
def test_select_optimal_organization_stable_trend():
    """Select organization for stable trend"""
    from src.agents.organization.organization_evaluator import OrganizationEvaluator
    from src.agents.organization.models import PosteChargeResult, TrendType, OrganizationType

    evaluator = OrganizationEvaluator()

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=35.0,  # Exactement 1x8
        charge_s2=36.0,
        charge_s3=34.0,
        charge_s4=35.0,
        trend=TrendType.STABLE
    )

    org = evaluator.select_optimal_organization(result)

    assert org.type == "1x8"
    assert org.hours == 35.0
```

- [ ] **Step 9: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_organization_evaluator.py::test_select_optimal_organization_stable_trend -v
```
Expected: FAIL

- [ ] **Step 10: Implement select_optimal_organization with trend logic**

```python
def select_optimal_organization(
    self,
    result: 'PosteChargeResult'
) -> OrganizationType:
    """
    Sélectionne l'organisation optimale pour un poste.

    Règles:
    - Stable: Organisation adaptée à S+1
    - Hausse: +1 niveau vs S+1 brut
    - Baisse: Organisation S+1 brut

    Parameters
    ----------
    result : PosteChargeResult
        Résultat de charge avec trend

    Returns
        -------
    OrganizationType
        Organisation recommandée
    """
    scenarios = self.get_organization_scenarios()

    # Organisation de base selon charge S+1
    base_charge = result.charge_s1

    # Si tendance haussière, anticiper +1 niveau
    if result.trend == TrendType.UPWARD:
        target_charge = base_charge + 10  # Marge de sécurité
    else:
        target_charge = base_charge

    # Trouver le scénario le plus léger qui couvre la charge
    for scenario in scenarios:
        if scenario.hours >= target_charge:
            return scenario

    # Si rien ne couvre, retourner le plus léger
    return scenarios[0]
```

- [ ] **Step 11: Run all tests**

```bash
pytest tests/agents/organization/test_organization_evaluator.py -v
```
Expected: ALL PASS

- [ ] **Step 12: Commit**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
git add src/agents/organization/organization_evaluator.py tests/agents/organization/test_organization_evaluator.py
git commit -m "feat: implement OrganizationEvaluator for scenario testing

- Add get_organization_scenarios() for all org types
- Add evaluate_organization() for coverage calculation
- Add select_optimal_organization() with trend-based logic

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Implement OrganizationAgent orchestrator

**Files:**
- Create: `src/agents/organization/organization_agent.py`
- Test: `tests/agents/organization/test_organization_agent.py`

- [ ] **Step 1: Write failing test for agent initialization**

```python
from unittest.mock import MagicMock

def test_organization_agent_init():
    """Initialize agent with loader"""
    from src.agents.organization.organization_agent import OrganizationAgent

    loader = MagicMock()
    agent = OrganizationAgent(loader)

    assert agent.loader == loader
    assert agent.charge_calculator is not None
    assert agent.trend_analyzer is not None
    assert assert org_evaluator is not None
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_organization_agent.py::test_organization_agent_init -v
```
Expected: FAIL

- [ ] **Step 3: Implement OrganizationAgent.__init__**

```python
from datetime import date
from typing import Dict

from .charge_calculator import ChargeCalculator
from .trend_analyzer import TrendAnalyzer
from .organization_evaluator import OrganizationEvaluator
from .models import PosteChargeResult

class OrganizationAgent:
    def __init__(self, loader):
        self.loader = loader
        self.charge_calculator = ChargeCalculator(loader)
        self.trend_analyzer = TrendAnalyzer()
        self.org_evaluator = OrganizationEvaluator()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/agents/organization/test_organization_agent.py::test_organization_agent_init -v
```
Expected: PASS

- [ ] **Step 5: Write test for analyze_workshop_organization**

```python
def test_analyze_workshop_organization_end_to_end():
    """Full analysis workflow"""
    from src.agents.organization.organization_agent import OrganizationAgent
    from src.agents.organization.models import TrendType

    loader = MagicMock()
    loader.commandes_clients = []

    # Mock all dependencies
    agent = OrganizationAgent(loader)

    # Mock calculate_charge_horizons
    def mock_calculate(ref_date, matcher):
        from src.agents.organization.models import PosteChargeResult
        return {
            "PP_830": PosteChargeResult(
                poste="PP_830",
                charge_s1=25.0,
                charge_s2=35.0,
                charge_s3=45.0,
                charge_s4=60.0
            )
        }
    agent.charge_calculator.calculate_charge_horizons = mock_calculate

    # Mock matcher
    matcher = MagicMock()

    results = agent.analyze_workshop_organization(
        reference_date=date.today(),
        matcher=matcher
    )

    assert "PP_830" in results
    assert results["PP_830"].trend == TrendType.UPWARD
    assert results["PP_830"].recommended_org is not None
```

- [ ] **Step 6: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_organization_agent.py::test_analyze_workshop_organization_end_to_end -v
```
Expected: FAIL

- [ ] **Step 7: Implement analyze_workshop_organization**

```python
def analyze_workshop_organization(
    self,
    reference_date: date = None,
    matcher = None
) -> Dict[str, PosteChargeResult]:
    """
    Analyse l'organisation de l'atelier sur 4 semaines.

    Parameters
    ----------
    reference_date : date, optional
        Date de référence (défaut: aujourd'hui)
    matcher : CommandeOFMatcher, optional
        Matcher pour lier commandes aux OF

    Returns
    -------
    Dict[str, PosteChargeResult]
        Résultats par poste avec recommandations
    """
    if reference_date is None:
        reference_date = date.today()

    # 1. Calculer la charge pour tous les horizons
    results = self.charge_calculator.calculate_charge_horizons(
        reference_date=reference_date,
        matcher=matcher
    )

    # 2. Analyser les tendances
    self.trend_analyzer.analyze_trends(results)

    # 3. Évaluer et sélectionner les organisations
    for result in results.values():
        org = self.org_evaluator.select_optimal_organization(result)
        result.recommended_org = org

        charge_treated, coverage_pct = self.org_evaluator.evaluate_organization(
            result, org
        )
        result.charge_treated = charge_treated
        result.coverage_pct = coverage_pct

    return results
```

- [ ] **Step 8: Run tests**

```bash
pytest tests/agents/organization/test_organization_agent.py -v
```
Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
git add src/agents/organization/organization_agent.py tests/agents/organization/test_organization_agent.py
git commit -m "feat: implement OrganizationAgent main orchestrator

- Add analyze_workshop_organization() for full workflow
- Orchestrates ChargeCalculator, TrendAnalyzer, OrganizationEvaluator
- Produces complete recommendations per poste

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Add console formatting

**Files:**
- Create: `src/agents/organization/formatter.py`
- Test: `tests/agents/organization/test_formatter.py`

- [ ] **Step 1: Write test for table formatting**

```python
import io
from contextlib import redirect_stdout

def test_format_organization_table():
    """Format results as console table"""
    from src.agents.organization.formatter import format_organization_table
    from src.agents.organization.models import PosteChargeResult, TrendType, OrganizationType

    result = PosteChargeResult(
        poste="PP_830",
        charge_s1=25.0,
        charge_s2=35.0,
        charge_s3=45.0,
        charge_s4=60.0,
        trend=TrendType.UPWARD,
        slope=11.67,
        recommended_org=OrganizationType(type="2x8", hours=70.0),
        charge_treated=25.0,
        coverage_pct=100.0
    )

    results = {"PP_830": result}

    # Capture stdout
    f = io.StringIO()
    with redirect_stdout(f):
        format_organization_table(results)
    output = f.getvalue()

    # Verify content
    assert "PP_830" in output
    assert "25.0h" in output
    assert "⬆️" in output or "UPWARD" in output
    assert "2x8" in output
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/agents/organization/test_formatter.py::test_format_organization_table -v
```
Expected: FAIL

- [ ] **Step 3: Implement format_organization_table with rich**

```python
from rich.console import Console
from rich.table import Table

def format_organization_table(results: dict) -> None:
    """
    Affiche les résultats d'organisation dans une table console.

    Parameters
    ----------
    results : Dict[str, PosteChargeResult]
        Résultats par poste
    """
    console = Console()

    table = Table(title="Organisation de l'atelier - S+1")
    table.add_column("Poste", style="cyan", width=12)
    table.add_column("S+1", justify="right", width=10)
    table.add_column("S+2", justify="right", width=10)
    table.add_column("S+3", justify="right", width=10)
    table.add_column("S+4", justify="right", width=10)
    table.add_column("Trend", justify="center", width=10)
    table.add_column("Organisation S+1", justify="center", width=15)
    table.add_column("Charge traitée", justify="right", width=12)

    for result in results.values():
        # Trend emoji
        if result.trend.value == "upward":
            trend_str = "⬆️ Hausse"
        elif result.trend.value == "downward":
            trend_str = "⬇️ Baisse"
        else:
            trend_str = "➡️ Stable"

        org_str = f"{result.recommended_org.type} ({result.recommended_org.hours}h)"
        treated_str = f"{result.charge_treated:.1f}h ({result.coverage_pct:.0f}%)"

        table.add_row(
            result.poste,
            f"{result.charge_s1:.1f}h",
            f"{result.charge_s2:.1f}h",
            f"{result.charge_s3:.1f}h",
            f"{result.charge_s4:.1f}h",
            trend_str,
            org_str,
            treated_str
        )

    console.print(table)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/agents/organization/test_formatter.py::test_format_organization_table -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
git add src/agents/organization/formatter.py tests/agents/organization/test_formatter.py
git commit -m "feat: add console table formatting for organization results

- Add format_organization_table() using rich
- Display S+1 to S+4 charges, trends, and recommendations
- Color-coded table with emojis for trends

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Add CLI integration

**Files:**
- Modify: `src/main.py`
- Modify: `src/main_s1.py` (optional integration)

- [ ] **Step 1: Add --organization flag to main.py**

Read existing main.py to find where flags are defined:

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
grep -n "add_argument" src/main.py | head -20
```

Expected: Lines where arguments are defined

- [ ] **Step 2: Add the flag (after line with other flags)**

```python
parser.add_argument(
    "--organization",
    action="store_true",
    help="Analyse l'organisation de l'atelier sur 4 semaines",
)
```

- [ ] **Step 3: Add handler in main() function**

```python
if args.organization:
    from src.agents.organization.organization_agent import OrganizationAgent
    from src.agents.organization.formatter import format_organization_table
    from src.algorithms import CommandeOFMatcher

    agent = OrganizationAgent(loader)
    matcher = CommandeOFMatcher(loader, date_tolerance_days=10)

    results = agent.analyze_workshop_organization(
        reference_date=date.today(),
        matcher=matcher
    )

    format_organization_table(results)
    return
```

- [ ] **Step 4: Test the CLI**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
python -m src.main --data-dir ../data --organization
```

Expected: Table with organization recommendations

- [ ] **Step 5: Commit**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
git add src/main.py
git commit -m "feat: add --organization CLI flag

- Add --organization flag to main.py
- Integrate OrganizationAgent with CLI
- Display results in formatted table

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Add __init__.py files and package structure

**Files:**
- Create: `src/agents/organization/__init__.py`
- Create: `tests/agents/organization/__init__.py`

- [ ] **Step 1: Create package __init__.py**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
cat > src/agents/organization/__init__.py << 'EOF'
"""Organization agent for workshop organization analysis."""

from .organization_agent import OrganizationAgent
from .models import TrendType, OrganizationType, PosteChargeResult

__all__ = [
    "OrganizationAgent",
    "TrendType",
    "OrganizationType",
    "PosteChargeResult",
]
EOF
```

- [ ] **Step 2: Create tests __init__.py**

```bash
cat > tests/agents/organization/__init__.py << 'EOF'
"""Tests for organization agent."""
EOF
```

- [ ] **Step 3: Run all tests**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
pytest tests/agents/organization/ -v
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
git add src/agents/organization/__init__.py tests/agents/organization/__init__.py
git commit -m "feat: add package structure for organization agent

- Add __init__.py files for proper package structure
- Export main classes from package

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Final integration test and documentation

**Files:**
- Create: `tests/agents/organization/test_integration.py`
- Modify: `README.md` (if exists)

- [ ] **Step 1: Write integration test**

```python
def test_organization_full_integration():
    """Full integration test with real data"""
    from src.agents.organization.organization_agent import OrganizationAgent
    from src.data.loader import DataLoader
    from src.algorithms import CommandeOFMatcher
    from datetime import date

    # Load real data
    loader = DataLoader("../data")
    loader.load_all()

    agent = OrganizationAgent(loader)
    matcher = CommandeOFMatcher(loader, date_tolerance_days=10)

    results = agent.analyze_workshop_organization(
        reference_date=date.today(),
        matcher=matcher
    )

    # Verify we got results
    assert len(results) > 0

    # Verify each result has all fields populated
    for poste, result in results.items():
        assert result.poste == poste
        assert result.charge_s1 >= 0
        assert result.charge_s2 >= 0
        assert result.charge_s3 >= 0
        assert result.charge_s4 >= 0
        assert result.trend is not None
        assert result.recommended_org is not None
        assert result.charge_treated >= 0
        assert result.coverage_pct >= 0
```

- [ ] **Step 2: Run integration test**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
pytest tests/agents/organization/test_integration.py -v -s
```

Expected: PASS with real output

- [ ] **Step 3: Run CLI end-to-end**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
python -m src.main --data-dir ../data --organization
```

Expected: Formatted table output

- [ ] **Step 4: Verify all tests pass**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
pytest tests/agents/organization/ -v --tb=short
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
cd "/Users/arthurbledou/Desktop/Code/ordo v2/.worktrees/agent-scheduling"
git add tests/agents/organization/test_integration.py
git commit -m "test: add full integration test for OrganizationAgent

- Add integration test with real data
- Verify end-to-end workflow
- All 160+ tests passing

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Verification Checklist

Before considering this complete:

- [ ] All 160+ tests pass
- [ ] CLI command `--organization` works with real data
- [ ] Table formatting displays correctly
- [ ] Trend detection matches spec (±5h/week thresholds)
- [ ] Organization selection follows rules (stable/upward/downward)
- [ ] Code follows existing patterns in codebase
- [ ] No regression in existing tests

---

## Total Expected Tasks: 9

**Estimated time:** 2-3 hours

**Test coverage:** All components unit tested + integration test

**Commit strategy:** One commit per task for easy rollback
