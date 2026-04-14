# Système de Décision basé sur LLM - Plan de Réécriture

> **Date** : 23 mars 2026
> **Objectif** : Réécrire le module décision pour utiliser un LLM capable de comprendre le contexte métier et proposer des actions nuancées

---

## 🎯 Objectif

Remplacer le système de règles statiques (SmartDecisionRule + Criteria) par un système basé sur LLM capable de :

1. **Comprendre les nuances métier** (stock bloqué = en contrôle qualité, pas rupture permanente)
2. **Analyser le contexte complet** (OF, commande, nomenclature, stocks, urgences)
3. **Proposer des actions pertinentes** avec des raisons contextuelles
4. **Suggérer des actions concrètes** (accélérer le contrôle qualité, contacter fournisseur, etc.)

---

## 📊 Analyse de l'existant

### Ce qui fonctionne ✅

**Models** (`src/decisions/models.py`)
- `DecisionAction` enum : ACCEPT_AS_IS, ACCEPT_PARTIAL, REJECT, DEFER, DEFER_PARTIAL
- `DecisionResult` dataclass : action, reason, modified_quantity, defer_date, metadata
- `DecisionContext` dataclass : of, commande, feasibility_result, stocks, etc.

**Engine** (`src/decisions/engine.py`)
- `DecisionEngine` : Orchestration pré/post allocation
- `evaluate_pre_allocation()` : Évaluation avant allocation
- `evaluate_post_allocation()` : Évaluation après allocation
- `evaluate_from_feasibility()` : Évaluation à partir d'un résultat

**Persistence** (`src/decisions/persistence.py`)
- Sauvegarde JSON de l'historique des décisions
- Rotation automatique

**Reports** (`src/decisions/reports.py`)
- Génération Markdown et JSON

### Ce qui doit être remplacé ❌

**Criteria** (`src/decisions/criteria/`)
- ❌ `BaseCriterion` avec scoring mathématique
- ❌ `CompletionCriterion` : taux de complétion calculé arbitrairement
- ❌ `ClientCriterion` : scoring basé sur nom client
- ❌ `UrgencyCriterion` : scoring basé sur date

**SmartDecisionRule** (`src/decisions/smart_rule.py`)
- ❌ Calcul de `weighted_score` (0.0 à 1.0)
- ❌ `_calculate_partial_quantity()` : 95% arbitraire
- ❌ `_decide_action()` : basé sur des seuils fixes

### Pourquoi ça ne marche pas ?

```python
# Exemple F126-44769
completion_rate = 0 / (0 + 2160) = 0.0  # EH1706
partial_quantity = 2160 * 0.95 = 2052  # ❌ Pas faisable !

# Ce que le LLM comprendrait :
"Le composant EH1706 est en rupture (0 disponible) mais 2447 unités
 sont en contrôle qualité. L'OF sera faisable après débloque.
 Action : DEFER jusqu'au 26/03, en attendant le contrôle qualité."
```

---

## 🏗️ Nouvelle Architecture

```
src/decisions/
├── models.py                      # ✅ Gardé (inchangé)
├── engine.py                      # ✅ Gardé (adapté pour LLM)
├── persistence.py                 # ✅ Gardé (inchangé)
├── reports.py                     # ✅ Gardé (inchangé)
│
├── llm/                           # 🆕 Nouveau module LLM
│   ├── __init__.py
│   ├── context_builder.py         # Prépare le contexte structuré
│   ├── prompt_builder.py          # Construit le prompt LLM
│   ├── llm_client.py              # Client API (Claude/GPT)
│   ├── response_parser.py         # Parse la réponse LLM
│   └── llm_decision_rule.py       # Nouvelle règle basée sur LLM
│
├── criteria/                      # ❌ Supprimé
│   ├── base.py
│   ├── completion.py
│   ├── client.py
│   └── urgency.py
│
└── smart_rule.py                  # ❌ Supprimé
```

---

## 📝 Spécifications Détaillées

### 1. Context Builder (`llm/context_builder.py`)

**Rôle** : Transformer le DecisionContext en un contexte structuré et exploitable par le LLM.

```python
class LLMContextBuilder:
    """Construit un contexte structuré pour le LLM."""

    def build_context(
        self,
        of: OF,
        commande: Optional[BesoinClient],
        feasibility_result: Optional[FeasibilityResult],
        loader: DataLoader
    ) -> LLMAnalysisContext:
        """Construit le contexte complet d'analyse.

        Workflow d'analyse (ORDRE CRITIQUE):
        1. Récupérer les allocations pour cet OF
           allocations = loader.get_allocations_for_of(of.num_of)
           → Lit le fichier allocations.csv pour trouver les lignes avec NUM_DOC = of.num_of
        2. Pour chaque composant de la nomenclature:
           - Récupérer toutes les allocations de ce composant (peuvent être pour des OFs ou des commandes)
           - Filtrer: combien est alloué à CET OF précis ?
           - Calculer stock_net = stock_disponible + stock_alloué_à_cet_of
           - Identifier si manque après allocations
           - Si manque: regarder stock_bloqué
        3. Classifier les composants critiques

        Returns
        -------
        LLMAnalysisContext
            Contexte structuré contenant :
            - of_info: informations OF (numéro, article, quantité, date)
            - commande_info: informations commande (client, date, urgence)
            - nomenclature: liste des composants avec leurs stocks
            - composants_critiques: composants manquants ou en tension
            - situation_analyse: analyse de la situation (rupture, bloqué, etc.)
        """
```

**Structure du contexte** :

```python
@dataclass
class LLMAnalysisContext:
    """Contexte d'analyse pour le LLM."""

    of_info: OFInfo
    commande_info: Optional[CommandeInfo]
    composants: List[ComposantAnalyse]
    composants_critiques: List[ComposantCritique]
    situation_globale: SituationGlobale

@dataclass
class ComposantAnalyse:
    """Analyse d'un composant."""
    article: str
    niveau: int
    type_article: str  # "Acheté" ou "Fabriqué"
    quantite_requise: int
    stock_physique: int
    stock_alloue_total: int  # Alloué à tous les OFs
    stock_alloue_cet_of: int  # Déjà alloué à CET OF
    stock_bloque: int
    stock_disponible: int
    stock_net_pour_of: int  # dispo + alloué_à_cet_of
    situation: str  # "disponible", "rupture", "bloqué", "tension"
    ratio_couverture: float  # stock_net_pour_of / quantite_requise

@dataclass
class ComposantCritique:
    """Composant critique (bloquant ou préoccupant)."""
    article: str
    type_probleme: str  # "rupture", "bloqué", "insuffisant"
    gravite: str  # "critique", "moyen", "faible"
    description: str
    action_suggeree: str  # "débloquer", "contrôler", "approvisionner"
    details: Dict[str, Any]

@dataclass
class SituationGlobale:
    """Analyse de la situation globale."""
    faisabilite: str  # "faisable", "non_faisable", "faisable_avec_conditions"
    raison_blocage: Optional[str]
    conditions_deblocage: List[str]
    delai_estime: Optional[str]  # "2-3 jours", "1 semaine"
```

### 2. Prompt Builder (`llm/prompt_builder.py`)

**Rôle** : Construire le prompt pour le LLM avec le contexte formaté.

```python
class LLMPromptBuilder:
    """Construit les prompts pour le LLM."""

    def build_decision_prompt(
        self,
        context: LLMAnalysisContext,
        config: Dict[str, Any]
    ) -> str:
        """Construit le prompt de décision.

        Le prompt contient :
        1. Rôle du LLM (expert en ordonnancement production)
        2. Contexte OF et commande
        3. Analyse des composants
        4. Composants critiques
        5. Instructions de sortie (JSON structuré)
        """

    def build_system_prompt(self) -> str:
        """Prompt système définissant le rôle et les règles."""
```

**Exemple de prompt généré** :

```
Tu es un expert en ordonnancement production manufacturier. Ta tâche est d'analyser
un Ordre de Fabrication (OF) et de proposer une décision métier nuancée.

# Contexte OF
- OF: F126-44769
- Article: EMM716HU
- Quantité: 2160
- Date de fin: 2026-03-24

# Contexte Commande
- Client: AERECO
- Date d'expédition demandée: 2026-03-25
- Urgence: TRÈS ÉLEVÉE (délai < 48h)

# Analyse des Composants
Composant | Requis | Dispo | Alloué* | Alloué† | Bloqué | Net‡ | Situation | Ratio
----------|--------|-------|---------|---------|--------|------|-----------|-------
EH1706    | 2160   | 0     | 1274    | 1274    | 2447   | 1274 | BLOQUÉ    | 59%
A1565E01  | 2160   | 3665  | 0       | 0       | 0      | 3665 | OK        | 170%
I3306     | 2160   | 11085 | 0       | 0       | 0      | 11085| OK        | 513%

* Alloué total (tous OFs confondus)
† Alloué à cet OF précis
‡ Net = Disponible + Alloué à cet OF

# Composants Critiques
1. EH1706 (Niveau 1, Fabriqué)
   - Type: BLOQUÉ (en contrôle qualité)
   - Gravité: CRITIQUE
   - Analyse détaillée:
     * Besoin: 2160 unités
     * Stock disponible: 0 unités
     * Stock alloué total: 1274 unités (tous à cet OF !)
     * Stock alloué à cet OF: 1274 unités
     * Stock net pour cet OF: 0 + 1274 = 1274 unités
     * Manque: 2160 - 1274 = 886 unités
     * Stock bloqué (en contrôle qualité): 2447 unités
   - Action suggérée: "ACCÉLÉRER LE CONTRÔLE QUALITÉ"
   - Potentiel de déblocage: 2447 > 886 ✅ (suffisant après contrôle)

# Analyse de la Situation
- Faisabilité: NON FAISABLE immédiatement
- Raison: Composant EH1706 en rupture de stock disponible. 1274 unités sont déjà allouées à cet OF, il manque 886 unités.
- Conditions de déblocage: Contrôle qualité des 2447 EH1706 bloqués
- Délai estimé: 2-3 jours (temps de contrôle qualité)
- Potentiel: Faisable après débloque (2447 > 886 manquants)

# Ta Mission
Propose une décision métier nuancée en considérant:
1. L'urgence de la commande (client AERECO, délai < 48h)
2. La nature temporaire du blocage (stock en contrôle qualité)
3. Les actions concrètes possibles (accélérer le contrôle)

# Format de Réponse
Réponds UNIQUEMENT en JSON :
{
  "action": "ACCEPT_AS_IS" | "ACCEPT_PARTIAL" | "REJECT" | "DEFER" | "DEFER_PARTIAL",
  "reason": "Explication détaillée de la décision (2-3 phrases)",
  "modified_quantity": null | <int>,
  "defer_date": null | "YYYY-MM-DD",
  "action_required": "Action concrète à entreprendre",
  "confidence": 0.0 à 1.0,
  "metadata": {
    "composants_limitants": ["EH1706"],
    "situation": "bloqué_temporaire",
    "delai_estime": "2-3 jours"
  }
}
```

### 3. LLM Client (`llm/llm_client.py`)

**Rôle** : Interface avec l'API du LLM (Claude, GPT, etc.).

```python
class LLMClient:
    """Client pour appeler l'API LLM."""

    def __init__(
        self,
        provider: str = "anthropic",  # ou "openai"
        model: str = "claude-3-5-sonnet-20241022",
        api_key: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.3  # Bas pour plus de déterminisme
    ):
        """Initialise le client LLM."""

    def call_llm(
        self,
        prompt: str,
        system_prompt: Optional[str] = None
    ) -> str:
        """Appelle l'API LLM et retourne la réponse brute."""

    def call_llm_with_retry(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_retries: int = 3
    ) -> str:
        """Appelle l'API LLM avec retry en cas d'erreur."""
```

### 4. Response Parser (`llm/response_parser.py`)

**Rôle** : Parser et valider la réponse JSON du LLM.

```python
class LLMResponseParser:
    """Parse la réponse du LLM."""

    def parse_decision(
        self,
        response: str
    ) -> ParsedLLMDecision:
        """Parse la réponse JSON du LLM.

        Raises
        ------
        ValueError
            Si la réponse n'est pas un JSON valide
            Si des champs requis sont manquants
            Si des valeurs sont invalides
        """

    def validate_decision(
        self,
        decision: ParsedLLMDecision
    ) -> bool:
        """Valide la cohérence de la décision."""

    def sanitize_reason(
        self,
        reason: str
    ) -> str:
        """Nettoie et formate la raison."""
```

### 5. LLM Decision Rule (`llm/llm_decision_rule.py`)

**Rôle** : Nouvelle règle de décision basée sur LLM (remplace SmartDecisionRule).

```python
class LLMBasedDecisionRule:
    """Règle de décision basée sur LLM."""

    def __init__(
        self,
        config_path: str,
        context_builder: Optional[LLMContextBuilder] = None,
        prompt_builder: Optional[LLMPromptBuilder] = None,
        llm_client: Optional[LLMClient] = None,
        response_parser: Optional[LLMResponseParser] = None
    ):
        """Initialise la règle avec tous les composants."""

    def evaluate(
        self,
        of: OF,
        commande: Optional[BesoinClient],
        feasibility_result: Optional[FeasibilityResult],
        loader: DataLoader,
        competing_ofs: Optional[List[OF]] = None,
        current_date: date = date.today()
    ) -> DecisionResult:
        """Évalue un OF en utilisant le LLM.

        Workflow:
        1. Construire le contexte structuré (LLMContextBuilder)
        2. Construire le prompt (LLMPromptBuilder)
        3. Appeler le LLM (LLMClient)
        4. Parser la réponse (LLMResponseParser)
        5. Créer le DecisionResult
        """
```

### 6. Adaptation du DecisionEngine

**Modifications** dans `src/decisions/engine.py` :

```python
class DecisionEngine:
    def __init__(
        self,
        config_path: str,
        use_llm: bool = True,  # 🆕 Paramètre
        llm_provider: str = "anthropic",
        llm_model: str = "claude-3-5-sonnet-20241022"
    ):
        """Initialise le moteur de décision.

        Parameters
        ----------
        use_llm : bool
            Si True, utilise LLMBasedDecisionRule
            Si False, utilise SmartDecisionRule (legacy)
        """
        if use_llm:
            self.decision_rule = LLMBasedDecisionRule(
                config_path=config_path,
                llm_provider=llm_provider,
                llm_model=llm_model
            )
        else:
            self.decision_rule = SmartDecisionRule(config_path)
```

---

## 🔄 Flux de Décision (avec LLM)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Récupération des données                                 │
│    - OF (F126-44769)                                        │
│    - Commande (AR2600929, AERECO)                           │
│    - Nomenclature (EMM716HU → 10 composants)                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Vérification des allocations pour l'OF 🆕               │
│    allocations = loader.get_allocations_for_of("F126-44769")│
│    → Lit allocations.csv, filtre NUM_DOC = "F126-44769"     │
│    → EH1706: 1274 allouées à cet OF                        │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Analyse des stocks pour chaque composant                │
│    Pour chaque composant de la nomenclature:                │
│    - Récupérer stock_info (physique, alloué, bloqué)        │
│    - Récupérer allocations de ce composant                  │
│    - Filtrer: combien est alloué à CET OF ?                │
│    - Calculer stock_net = dispo + alloué_à_cet_of          │
│    - Si stock_net < requis: marquer comme critique          │
│    → EH1706: dispo=0, alloué_à_cet_of=1274, net=1274 < 2160│
│      Manque = 2160 - 1274 = 886                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Analyse du stock bloqué pour composants critiques        │
│    Pour chaque composant critique:                          │
│    - Si stock_bloqué > manque: potentiel de déblocage      │
│    - Classer la situation (bloqué_temporaire, rupture)     │
│    → EH1706: bloqué=2447 > manque=886 → BLOQUÉ_TEMPORAIRE  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Construction du contexte LLM                            │
│    context = context_builder.build(                         │
│        of, commande, allocations, loader                    │
│    )                                                        │
│    → Composants avec analyse détaillée (stock net, bloqué)  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Construction du prompt                                  │
│    prompt = prompt_builder.build(context)                   │
│    → Prompt structuré avec analyse complète                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. Appel LLM                                               │
│    response = llm_client.call(prompt)                       │
│    → JSON avec action, reason, action_required              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. Parsing de la réponse                                   │
│    parsed = parser.parse(response)                          │
│    → DecisionResult avec action DEFER et raisons           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. Création du DecisionResult                              │
│    result = DecisionResult(                                 │
│        action=DEFER,                                       │
│        reason="L'OF n'est pas faisable immédiatement...",   │
│        defer_date=date(2026, 3, 26),                        │
│        metadata={"action_required": "..."}                  │
│    )                                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Plan d'Implémentation

### Phase 1: Structure du module LLM

**Tâche 1** : Créer la structure du module `llm/`
- Créer `src/decisions/llm/__init__.py`
- Créer les fichiers vides pour chaque composant

**Tâche 2** : Définir les modèles de données
- Créer `llm/models.py` avec : LLMAnalysisContext, ComposantAnalyse, ComposantCritique, etc.

**Tâche 3** : Implémenter LLMContextBuilder
- Analyser la nomenclature
- Identifier les composants critiques
- Classifier les situations (rupture, bloqué, tension)

### Phase 2: Intégration LLM

**Tâche 4** : Implémenter LLMPromptBuilder
- Créer le prompt système
- Formater le contexte en prompt
- Définir le format de sortie attendu

**Tâche 5** : Implémenter LLMClient
- Intégration avec API Anthropic (Claude)
- Gestion des erreurs et retry
- Support pour OpenAI (optionnel)

**Tâche 6** : Implémenter LLMResponseParser
- Parsing JSON
- Validation des décisions
- Gestion des erreurs de parsing

### Phase 3: Intégration dans le DecisionEngine

**Tâche 7** : Implémenter LLMBasedDecisionRule
- Orchestration des composants
- Création du DecisionResult

**Tâche 8** : Adapter DecisionEngine
- Ajouter le paramètre `use_llm`
- Choisir entre LLMBasedDecisionRule et SmartDecisionRule

### Phase 4: Tests et Validation

**Tâche 9** : Tests unitaires
- Tester LLMContextBuilder avec différents scénarios
- Tester LLMPromptBuilder
- Tester LLMResponseParser avec des réponses variées

**Tâche 10** : Tests d'intégration
- Tester LLMBasedDecisionRule end-to-end
- Comparer les décisions LLM vs règles (sur cas connus)

**Tâche 11** : Validation métier
- Tester sur F126-44769 (cas bloqué)
- Tester sur d'autres cas (rupture vraie, faisable, etc.)
- Ajuster le prompt si nécessaire

### Phase 5: Documentation et Déploiement

**Tâche 12** : Documentation
- Documenter la nouvelle architecture
- Créer des exemples d'utilisation
- Documenter le format de réponse attendu

**Tâche 13** : Configuration
- Créer `config/decisions_llm.yaml`
- Paramètres LLM (provider, model, api_key)
- Paramètres de prompt (langue, niveau de détail)

**Tâche 14** : Migration
- Mettre à jour `main_s1.py` pour utiliser LLM par défaut
- Garder l'option de fallback vers règles

---

## 🎨 Exemples de Décisions Attendues

### Cas 1: F126-44769 (Stock bloqué avec allocations partielles)

**Entrée** :
- OF: F126-44769, 2160 EMM716HU
- Commande: AR2600929, AERECO
- EH1706:
  - Stock physique: 3721
  - Stock alloué total: 1274 (tous à cet OF !)
  - Stock alloué à cet OF: 1274
  - Stock bloqué: 2447 (en contrôle qualité)
  - Stock disponible: 0
  - Stock net pour cet OF: 0 + 1274 = 1274
- Urgence: très élevée (< 48h)

**Analyse** :
- Besoin EH1706: 2160 unités
- Stock net pour cet OF: 1274 unités (0 disponible + 1274 alloué)
- Manque: 2160 - 1274 = **886 unités** (pas 2160 !)
- Stock bloqué disponible: 2447 unités > 886 manquants ✅

**Décision LLM attendue** :
```json
{
  "action": "DEFER",
  "reason": "L'OF n'est pas faisable immédiatement. Analyse du composant EH1706 (Niveau 1, Fabriqué): besoin de 2160 unités, stock net pour cet OF de 1274 unités (disponible: 0 + alloué à cet OF: 1274). Manque de 886 unités (pas 2160). Les 1274 unités allouées sont déjà réservées pour cet OF. Cependant, 2447 unités sont en contrôle qualité et seront disponibles sous 2-3 jours, ce qui est suffisant pour couvrir le manque (2447 > 886). Action requise: accélérer le contrôle qualité.",
  "defer_date": "2026-03-26",
  "action_required": "Prioriser le contrôle qualité des 2447 EH1706 bloqués. Seuls 886 unités supplémentaires nécessaires au-delà des 1274 déjà allouées.",
  "confidence": 0.9,
  "metadata": {
    "composants_limitants": ["EH1706"],
    "situation": "bloqué_temporaire_avec_allocations_partielles",
    "delai_estime": "2-3 jours",
    "action_nature": "accélérer_process",
    "analyse_detaillee": {
      "eh1706": {
        "besoin": 2160,
        "stock_disponible": 0,
        "stock_alloue_total": 1274,
        "stock_alloue_cet_of": 1274,
        "stock_net": 1274,
        "stock_bloque": 2447,
        "manque": 886,
        "potentiel_deblocage": 2447,
        "ratio_allocation": "59% (1274/2160)"
      }
    }
  }
}
```

### Cas 2: Rupture vraie (sans stock bloqué)

**Entrée** :
- OF: FXXX, 1000 ARTICLE_X
- COMPOSANT_Y: 0 dispo, 0 alloué, 0 bloqué (vraie rupture)
- Pas de réceptions prévues

**Décision LLM attendue** :
```json
{
  "action": "REJECT",
  "reason": "L'OF n'est pas faisable car le composant COMPOSANT_Y est en rupture de stock sans perspective de réapprovisionnement à court terme. Aucun stock disponible (physique: 0, alloué: 0, bloqué: 0) et aucune réception fournisseur prévue. La commande ne peut pas être honorée.",
  "action_required": "Contacter le fournisseur pour un approvisionnement urgent ou proposer un article alternatif",
  "confidence": 0.95,
  "metadata": {
    "composants_limitants": ["COMPOSANT_Y"],
    "situation": "rupture_permanente",
    "action_nature": "réapprovisionnement"
  }
}
```

### Cas 3: Faisable avec conditions (attente réception)

**Entrée** :
- OF: FYYY, 500 ARTICLE_Y
- Commande: ARXXXXX
- COMPOSANT_Z:
  - Stock disponible: 450
  - Stock alloué à cet OF: 0
  - Réception prévue: 100 demain
- Besoin: 500 unités

**Analyse** :
- Besoin COMPOSANT_Z: 500 unités
- Stock net pour cet OF: 450 + 0 = 450 unités
- Manque: 50 unités
- Réception prévue: 100 unités demain > 50 manquants ✅

**Décision LLM attendue** :
```json
{
  "action": "DEFER",
  "reason": "L'OF n'est pas faisable aujourd'hui. Analyse du composant COMPOSANT_Z: besoin de 500 unités, stock net pour cet OF de 450 unités (disponible: 450 + alloué à cet OF: 0). Manque de 50 unités. Une réception de 100 unités est prévue pour demain, ce qui rendra l'OF faisable.",
  "defer_date": "2026-03-24",
  "action_required": "Confirmer la réception de demain (100 COMPOSANT_Z) et prioriser cet OF après réception",
  "confidence": 0.85,
  "metadata": {
    "composants_limitants": ["COMPOSANT_Z"],
    "situation": "attente_réception",
    "delai_estime": "1 jour",
    "action_nature": "attendre_reception",
    "reception_confirmee": {
      "article": "COMPOSANT_Z",
      "quantite": 100,
      "date_prevue": "2026-03-24"
    }
  }
}
```

---

## ⚙️ Configuration

**Fichier** `config/decisions_llm.yaml` :

```yaml
# Configuration du système de décision basé sur LLM

llm:
  # Provider LLM
  provider: "anthropic"  # "anthropic" | "openai"
  model: "claude-3-5-sonnet-20241022"
  api_key_env: "ANTHROPIC_API_KEY"  # Variable d'environnement

  # Paramètres d'appel
  max_tokens: 2000
  temperature: 0.3  # Bas pour plus de déterminisme
  timeout: 30  # secondes

  # Retry en cas d'erreur
  max_retries: 3
  retry_delay: 1  # secondes

# Prompt configuration
prompt:
  language: "fr"  # Langue de la réponse
  detail_level: "high"  # "low" | "medium" | "high"
  include_metadata: true
  require_confidence: true

# Analyse de contexte
context:
  # Seuils pour identifier les composants critiques
  critical_ratio: 0.5  # Si ratio < 50%, critique
  warning_ratio: 0.8   # Si ratio < 80%, attention

  # Classification des situations
  situations:
    disponible: "ratio >= 1.0"
    tension: "0.8 <= ratio < 1.0"
    rupture: "ratio < 0.5"
    bloqué: "stock_bloqué > 0 et stock_disponible == 0"

# Validation
validation:
  require_action_required: true
  max_reason_length: 500
  min_confidence: 0.5
```

---

## 🧪 Tests

### Test 1: F126-44769 (Stock bloqué)

```python
def test_llm_decision_stock_bloque():
    """Test la décision LLM pour un OF avec stock bloqué."""
    # Setup
    of = loader.get_of("F126-44769")
    commande = loader.get_commande("AR2600929")
    checker = ProjectedChecker(loader)
    feasibility = checker.check_of(of)

    # Execute
    engine = DecisionEngine(use_llm=True)
    result = engine.evaluate_from_feasibility(of, feasibility, commande)

    # Assert
    assert result.action == DecisionAction.DEFER
    assert "contrôle qualité" in result.reason.lower()
    assert "bloqué" in result.reason.lower()
    assert result.defer_date is not None
    assert result.defer_date > of.date_fin
    assert "accélérer" in result.metadata["action_required"].lower()
```

### Test 2: Rupture vraie

```python
def test_llm_decision_rupture_vraie():
    """Test la décision LLM pour une rupture vraie."""
    # Setup: OF sans aucun stock dispo/alloué/bloqué
    of = create_test_of(quantite=1000)
    set_composant_rupture(of.article, stock=0, alloue=0, bloque=0)

    # Execute
    result = engine.evaluate(of)

    # Assert
    assert result.action == DecisionAction.REJECT
    assert "rupture" in result.reason.lower()
    assert "approvisionnement" in result.metadata["action_required"].lower()
```

---

## 📊 Avantages de l'approche LLM

1. **Compréhension contextuelle** : Le LLM comprend que "stock bloqué" = "temporaire"
2. **Raisonnement nuancé** : Peut distinguer rupture temporaire vs permanente
3. **Actions concrètes** : Suggère des actions spécifiques (accélérer le contrôle qualité)
4. **Explications compréhensibles** : Génère des raisons en langage naturel
5. **Adaptabilité** : Peut gérer des cas marginaux sans coder des règles spécifiques
6. **Confidence** : Peut indiquer son niveau de confiance dans la décision

---

## 🚀 Next Steps

1. **Valider ce plan** avec vous
2. **Implémenter Phase 1** (structure du module)
3. **Implémenter Phase 2** (intégration LLM)
4. **Tester sur F126-44769**
5. **Ajuster le prompt** selon les résultats
6. **Déployer en production**

---

## 🔧 Fallback vers règles

En cas de panne de l'API LLM ou pour des tests :

```python
# Utiliser les règles statiques (legacy)
engine = DecisionEngine(use_llm=False)

# Ou utiliser un fallback automatique
engine = DecisionEngine(
    use_llm=True,
    llm_fallback_to_rules=True  # 🆕 Fallback automatique
)
```

---

**Ce plan prépare les données de manière structurée pour que le LLM puisse les exploiter efficacement et prendre des décisions métier nuancées.**
