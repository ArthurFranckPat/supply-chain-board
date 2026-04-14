# Évolution : Couche Décision Métier pour Ordonnancement Intelligente

## Contexte

**Problème identifié** : Le système actuel de vérification de faisabilité est binaire (faisable/non faisable). Dans certains cas, une approche nuancée permettrait de maximiser le service client.

**Cas motivant** : Composant 11019971
- Besoin : 147 unités
- Stock disponible : 145 unités
- Manque : 2 unités (1.4%)
- **Comportement actuel** : ❌ Non faisable → Toutes les commandes retardées
- **Approche intelligente** : ✅ Produire 145 unités (98.6%) → Satisfaire immédiatement la demande

**Objectif** : Ajouter une **couche décision métier** non-destructive qui applique des règles business avant/après l'allocation pour optimiser les décisions de production.

---

## Architecture proposée

### Flux actuel

```
Données (CSV) → DataLoader → Checkers → AllocationManager → Résultats
```

### Nouveau flux avec couche décision

```
┌─────────────────────────────────────────────────────────────┐
│                    Flux avec Décision Métier                 │
└─────────────────────────────────────────────────────────────┘

DataLoader
    ↓
DecisionEngine (NOUVEAU)
    ├─ Pré-allocation : Évaluer les OFs avant allocation virtuelle
    └─ Post-allocation : Ajuster les décisions après allocation
    ↓
AllocationManager (avec allocation virtuelle)
    ↓
Résultats enrichis (décisions métier appliquées)
```

### Structure des fichiers

```
src/
├── decisions/                    # NOUVEAU MODULE
│   ├── __init__.py
│   ├── engine.py                 # DecisionEngine (orchestrateur)
│   ├── base.py                   # BaseDecisionRule (interface)
│   ├── models.py                 # DecisionResult, DecisionContext
│   └── rules/                    # Règles métier
│       ├── __init__.py
│       ├── partial_acceptance.py # Gère le cas 98.6%
│       ├── client_priority.py    # Priorité clients (ALDES, etc.)
│       └── urgency.py            # Urgence date-based
```

---

## Implémentation

### 1. Modèles de décision (`src/decisions/models.py`)

**Classes clés** :

```python
class DecisionAction(Enum):
    """Actions possibles après décision."""
    ACCEPT_AS_IS = "accept_as_is"      # Pas de changement
    ACCEPT_PARTIAL = "accept_partial"  # Accepter quantité réduite
    REJECT = "reject"                  # Impossible à satisfaire
    DEFER = "defer"                    # Retarder à plus tard
    SPLIT = "split"                    # Diviser en plusieurs OFs


@dataclass
class DecisionContext:
    """Contexte disponible pour les règles."""
    of: OF                              # OF à évaluer
    commande: Optional[CommandeClient] # Commande associée
    feasibility_result: Optional[FeasibilityResult]
    available_stock: Dict[str, int]     # Stock par composant
    allocated_stock: Dict[str, int]     # Stock alloué
    competing_ofs: List[OF]             # OFs en concurrence


@dataclass
class DecisionResult:
    """Résultat d'une règle métier."""
    action: DecisionAction
    reason: str                         # Explication
    modified_quantity: Optional[int]     # Pour ACCEPT_PARTIAL
    defer_date: Optional[date]           # Pour DEFER
    priority_override: bool = False      # Priorité forcée
    metadata: Dict = field(default_factory=dict)
```

---

### 2. Interface de règle (`src/decisions/base.py`)

```python
class BaseDecisionRule(ABC):
    """Interface pour les règles métier."""

    PRIORITY: int = 100           # Priorité d'évaluation
    RULE_ID: str = "base_rule"
    RULE_NAME: str = "Base Rule"

    def __init__(self, enabled: bool = True, config: Optional[dict] = None):
        self.enabled = enabled
        self.config = config or {}

    @abstractmethod
    def evaluate(self, context: DecisionContext) -> Optional[DecisionResult]:
        """Évalue la règle et retourne une décision."""
        pass

    def is_applicable(self, context: DecisionContext) -> bool:
        """Vérifie si la règle s'applique."""
        return self.enabled
```

---

### 3. Moteur de décision (`src/decisions/engine.py`)

```python
class DecisionEngine:
    """Orchestrateur de l'évaluation des règles métier."""

    def __init__(self, rules: Optional[List[BaseDecisionRule]] = None):
        self.rules = rules or []
        # Trier par priorité (décroissante)
        self.rules.sort(key=lambda r: r.PRIORITY, reverse=True)

    def evaluate_pre_allocation(
        self,
        of: OF,
        commande: Optional[CommandeClient] = None,
        available_stock: Optional[Dict[str, int]] = None
    ) -> DecisionResult:
        """Évalue les règles AVANT allocation virtuelle.

        Utilisation : Décider si un OF doit être traité, avec quelle
        quantité, ou quelle priorité.
        """
        context = DecisionContext(
            of=of,
            commande=commande,
            available_stock=available_stock or {}
        )
        return self._evaluate_rules(context)

    def evaluate_post_allocation(
        self,
        of: OF,
        feasibility_result: FeasibilityResult,
        allocated_stock: Dict[str, int],
        competing_ofs: Optional[List[OF]] = None
    ) -> DecisionResult:
        """Évalue les règles APRÈS allocation virtuelle.

        Utilisation : Ajuster les décisions basées sur les résultats
        réels d'allocation (defer, split, etc.).
        """
        context = DecisionContext(
            of=of,
            feasibility_result=feasibility_result,
            allocated_stock=allocated_stock,
            competing_ofs=competing_ofs or []
        )
        return self._evaluate_rules(context)

    def _evaluate_rules(self, context: DecisionContext) -> DecisionResult:
        """Évalue les règles dans l'ordre de priorité."""
        for rule in self.rules:
            if not rule.is_applicable(context):
                continue

            result = rule.evaluate(context)
            if result is not None:
                # Règle applicable → retourner la décision
                if result.action in (
                    DecisionAction.ACCEPT_AS_IS,
                    DecisionAction.ACCEPT_PARTIAL,
                    DecisionAction.REJECT
                ):
                    return result

        # Aucune règle applicable → accepter par défaut
        return DecisionResult(
            action=DecisionAction.ACCEPT_AS_IS,
            reason="No applicable rules"
        )
```

---

### 4. Règle : Acceptation Partielle (`src/decisions/rules/partial_acceptance.py`)

**Gère le cas motivant : 145/147 unités (98.6%)**

```python
class PartialAcceptanceRule(BaseDecisionRule):
    """Accepte les OFs avec taux de complétion ≥ 95%.

    Configuration :
    - min_completion_rate : Taux minimum (défaut: 0.95)
    - min_absolute_gap : Écart max autorisé (défaut: 10 unités)
    - priority_clients : Clients qui nécessitent 100% (défaut: ["ALDES"])
    """

    PRIORITY = 200              # Haute priorité
    RULE_ID = "partial_acceptance"
    RULE_NAME = "Partial Acceptance"

    def evaluate(self, context: DecisionContext) -> Optional[DecisionResult]:
        # Uniquement si faisabilité montre des manquants
        if not context.feasibility_result:
            return None

        if context.feasibility_result.feasible:
            return None  # Déjà faisable

        missing = context.feasibility_result.missing_components
        if not missing:
            return None

        # Calculer le taux de complétion
        of = context.of
        total_needed = of.qte_restante
        total_missing = sum(missing.values())

        # Trouver le composant limitant
        completion_rate = 1.0
        for component, qte_missing in missing.items():
            stock = context.available_stock.get(component, 0)
            component_rate = stock / (stock + qte_missing)
            completion_rate = min(completion_rate, component_rate)

        # Seuils de configuration
        min_completion_rate = self.config.get("min_completion_rate", 0.95)
        min_absolute_gap = self.config.get("min_absolute_gap", 10)
        priority_clients = self.config.get("priority_clients", ["ALDES"])

        # Clients prioritaires → 100% requis
        if context.commande and context.commande.code_client in priority_clients:
            if completion_rate < 1.0:
                return DecisionResult(
                    action=DecisionAction.REJECT,
                    reason=f"Client prioritaire {context.commande.code_client} → 100% requis (actuel {completion_rate:.1%})"
                )

        # Vérifier critères d'acceptation partielle
        if completion_rate >= min_completion_rate and total_missing <= min_absolute_gap:
            modified_quantity = int(total_needed * completion_rate)

            return DecisionResult(
                action=DecisionAction.ACCEPT_PARTIAL,
                reason=f"Accepter {completion_rate:.1%} ({modified_quantity}/{total_needed}) - manque {total_missing} u",
                modified_quantity=modified_quantity,
                metadata={
                    "completion_rate": completion_rate,
                    "original_quantity": total_needed,
                    "missing_components": missing
                }
            )

        return None
```

---

### 5. Règle : Priorité Client (`src/decisions/rules/client_priority.py`)

```python
class ClientPriorityRule(BaseDecisionRule):
    """Priorise les clients stratégiques (ALDES, etc.)."""

    PRIORITY = 190
    RULE_ID = "client_priority"
    RULE_NAME = "Client Priority"

    def evaluate(self, context: DecisionContext) -> Optional[DecisionResult]:
        if not context.commande:
            return None

        priority_clients = self.config.get("priority_clients", ["ALDES"])
        client_code = context.commande.code_client

        # Client prioritaire : toujours essayer de satisfaire
        if client_code in priority_clients:
            if context.feasibility_result and not context.feasibility_result.feasible:
                return DecisionResult(
                    action=DecisionAction.ACCEPT_AS_IS,
                    reason=f"Client prioritaire {client_code} → forcer faisabilité",
                    priority_override=True
                )

        return None
```

---

### 6. Règle : Urgence (`src/decisions/rules/urgency.py`)

```python
class UrgencyOverrideRule(BaseDecisionRule):
    """Permet aux OFs urgents de passer malgré des écarts mineurs."""

    PRIORITY = 180
    RULE_ID = "urgency"
    RULE_NAME = "Urgency Override"

    def evaluate(self, context: DecisionContext) -> Optional[DecisionResult]:
        if not context.feasibility_result or context.feasibility_result.feasible:
            return None

        if not context.of.date_fin:
            return None

        # Seuils de configuration
        very_urgent_days = self.config.get("very_urgent_days", 3)
        urgent_days = self.config.get("urgent_days", 7)
        very_urgent_tolerance = self.config.get("very_urgent_tolerance", 0.05)  # 5%
        urgent_tolerance = self.config.get("urgent_tolerance", 0.02)  # 2%

        # Jours restants
        if context.current_date:
            days_until = (context.of.date_fin - context.current_date).days
        else:
            days_until = 0

        # Calculer écart en %
        missing = context.feasibility_result.missing_components
        total_needed = context.of.qte_restante
        total_missing = sum(missing.values())
        gap_pct = total_missing / total_needed if total_needed > 0 else 0

        # Très urgent (≤ 3 jours) : tolérer jusqu'à 5%
        if days_until <= very_urgent_days and gap_pct <= very_urgent_tolerance:
            return DecisionResult(
                action=DecisionAction.ACCEPT_AS_IS,
                reason=f"Très urgent ({days_until} j) - écart {gap_pct:.1%} acceptable",
                priority_override=True
            )

        # Urgent (≤ 7 jours) : tolérer jusqu'à 2%
        if days_until <= urgent_days and gap_pct <= urgent_tolerance:
            return DecisionResult(
                action=DecisionAction.ACCEPT_AS_IS,
                reason=f"Urgent ({days_until} j) - écart {gap_pct:.1%} acceptable",
                priority_override=True
            )

        return None
```

---

### 7. Intégration dans AllocationManager (`src/algorithms/allocation.py`)

**Modification minimale et non-destructive** :

```python
class AllocationManager:
    def __init__(
        self,
        data_loader,
        checker,
        decision_engine: Optional[DecisionEngine] = None  # NOUVEAU
    ):
        self.data_loader = data_loader
        self.checker = checker
        self.decision_engine = decision_engine  # NOUVEAU

    def allocate_stock(self, ofs: list[OF]) -> dict[str, AllocationResult]:
        # ... code existant ...

        # NOUVEAU : Évaluation pré-allocation
        decisions = {}
        if self.decision_engine:
            for of in ofs:
                decision = self.decision_engine.evaluate_pre_allocation(
                    of=of,
                    available_stock=stock_state.initial_stock
                )
                decisions[of.num_of] = decision

                # Gérer ACCEPT_PARTIAL : modifier la quantité
                if decision.action == DecisionAction.ACCEPT_PARTIAL:
                    # Sauvegarder la quantité originale
                    original_quantity = of.qte_restante
                    of.qte_restante = decision.modified_quantity

                    # Stocker pour restauration éventuelle
                    decision.metadata["original_quantity"] = original_quantity

        # ... allocation existante ...

        # NOUVEAU : Évaluation post-allocation
        if self.decision_engine:
            for of_num, result in results.items():
                if result.status == AllocationStatus.NOT_FEASIBLE:
                    of = next(o for o in ofs if o.num_of == of_num)
                    decision = self.decision_engine.evaluate_post_allocation(
                        of=of,
                        feasibility_result=result.feasibility_result,
                        allocated_stock=result.allocated_quantity or {},
                        competing_ofs=ofs
                    )

                    # Appliquer la décision (ex: DEFER)
                    if decision.action == DecisionAction.DEFER:
                        result.status = AllocationStatus.DEFERRED
                        result.metadata["deferral_reason"] = decision.reason

        return results
```

---

### 8. Utilisation dans main.py

```python
from src.decisions import DecisionEngine
from src.decisions.rules import (
    PartialAcceptanceRule,
    ClientPriorityRule,
    UrgencyOverrideRule
)

def main():
    # ... chargement des données ...

    # NOUVEAU : Configurer le moteur de décision
    decision_engine = DecisionEngine()

    # Ajouter les règles (activables/désactivables)
    decision_engine.add_rule(PartialAcceptanceRule(
        enabled=True,
        config={"min_completion_rate": 0.95}
    ))
    decision_engine.add_rule(ClientPriorityRule(
        enabled=True,
        config={"priority_clients": ["ALDES"]}
    ))
    decision_engine.add_rule(UrgencyOverrideRule(
        enabled=True,
        config={"very_urgent_days": 3}
    ))

    # Passer à AllocationManager
    allocation_manager = AllocationManager(
        data_loader=loader,
        checker=checker,
        decision_engine=decision_engine  # NOUVEAU
    )

    # ... suite du flux existant ...
```

---

## Validation

### Tests unitaires

**Test du cas motivant (11019971)** :

```python
def test_partial_acceptance_98_6_percent():
    """Test : 145/147 unités (98.6%)"""

    of = OF(
        num_of="F426-TEST",
        article="TEST_ART",
        qte_restante=147,
        # ...
    )

    # Simuler faisabilité : 2 unités manquantes
    feasibility = FeasibilityResult(feasible=False)
    feasibility.add_missing("11019971", 2)

    context = DecisionContext(
        of=of,
        feasibility_result=feasibility,
        available_stock={"11019971": 145}
    )

    # Appliquer la règle
    rule = PartialAcceptanceRule(
        enabled=True,
        config={"min_completion_rate": 0.95}
    )
    result = rule.evaluate(context)

    # Assertions
    assert result.action == DecisionAction.ACCEPT_PARTIAL
    assert result.modified_quantity == 145
    assert "98.6%" in result.reason
```

### Test d'intégration

```python
def test_decision_engine_with_allocation():
    """Test : DecisionEngine + AllocationManager"""

    loader = DataLoader("data")
    loader.load_all()

    # Setup
    checker = RecursiveChecker(loader, use_receptions=True)
    decision_engine = DecisionEngine()
    decision_engine.add_rule(PartialAcceptanceRule())

    allocation_manager = AllocationManager(
        loader, checker, decision_engine
    )

    # Test avec OF problématique
    ofs = loader.get_ofs_to_check()[:10]
    results = allocation_manager.allocate_stock(ofs)

    # Vérifier que les décisions sont appliquées
    # ...
```

---

## Fichiers à modifier/créer

### Nouveaux fichiers

1. **`src/decisions/__init__.py`** - Module décision
2. **`src/decisions/models.py`** - Modèles (DecisionResult, DecisionContext)
3. **`src/decisions/base.py`** - Interface BaseDecisionRule
4. **`src/decisions/engine.py`** - DecisionEngine (orchestrateur)
5. **`src/decisions/rules/__init__.py`** - Module règles
6. **`src/decisions/rules/partial_acceptance.py`** - Règle acceptation partielle
7. **`src/decisions/rules/client_priority.py`** - Règle priorité client
8. **`src/decisions/rules/urgency.py`** - Règle urgence

### Fichiers modifiés

1. **`src/algorithms/allocation.py`** - Ajouter `decision_engine` paramètre
2. **`src/main.py`** - Configurer et passer DecisionEngine

### Tests

1. **`tests/decisions/test_partial_acceptance.py`** - Tests règle partielle
2. **`tests/decisions/test_client_priority.py`** - Tests priorité client
3. **`tests/decisions/test_urgency.py`** - Tests urgence
4. **`tests/decisions/test_decision_engine.py`** - Tests moteur
5. **`tests/decisions/test_integration.py`** - Tests intégration AllocationManager

---

## Résultats attendus

### Avant

```
Composant 11019971 : Besoin 147, Stock 145
→ OF non faisable
→ Toutes les commandes retardées (0/147)
```

### Après

```
Composant 11019971 : Besoin 147, Stock 145
→ DecisionEngine détecte : 98.6% faisable
→ Action : ACCEPT_PARTIAL avec 145 unités
→ 145/147 commandes satisfaites immédiatement (98.6%)
→ Seulement 2 unités à reporter
```

---

## Avantages de l'approche

✅ **Non-destructif** : S'ajoute au système existant sans le modifier
✅ **Extensible** : Facile d'ajouter de nouvelles règles
✅ **Configurable** : Règles activables/désactivables via config
✅ **Testable** : Couche isolée, facile à tester unitairement
✅ **Maintenable** : Logique métier concentrée en un seul endroit
✅ **Explicable** : Chaque décision est documentée (reason)
✅ **Évolutif** : Prêt pour intégration LLM future

---

## Configuration YAML (futur)

```yaml
# config/decisions.yaml
rules:
  partial_acceptance:
    enabled: true
    config:
      min_completion_rate: 0.95
      min_absolute_gap: 10
      priority_clients: [ALDES]

  client_priority:
    enabled: true
    config:
      priority_clients: [ALDES]
      strategic_clients: [AERECO, PARTN-AIR]

  urgency_override:
    enabled: true
    config:
      very_urgent_days: 3
      urgent_days: 7
      very_urgent_tolerance: 0.05
      urgent_tolerance: 0.02
```
