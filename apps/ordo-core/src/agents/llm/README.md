# Module LLM - Système de Décision

## 🎯 Objectif

Système de décision basé sur LLM pour l'ordonnancement production, permettant des décisions métier nuancées :

- **ACCEPT_AS_IS** : OF faisable tel quel
- **ACCEPT_PARTIAL** : Accepter une quantité réduite
- **DEFER** : Reporter (faisable après déblocage)
- **DEFER_PARTIAL** : Reporter avec acceptation partielle
- **REJECT** : Rejeter (non faisable)

## 🏗️ Architecture

```
LLMBasedDecisionRule (orchestrateur)
    ↓
    ├─→ LLMContextBuilder (analyse allocation + composants)
    ├─→ LLMPromptBuilder (construit prompts structurés)
    ├─→ BaseLLMClient (interface abstraite)
    │   ├─→ MockLLMClient (tests, pas d'API)
    │   └─→ MistralLLMClient (vraie API Mistral)
    └─→ LLMResponseParser (valide et parse JSON)
```

## 📦 Installation

```bash
# Pour les tests (mock)
# Aucune dépendance externe requise

# Pour le vrai LLM Mistral
pip install mistralai
export MISTRAL_API_KEY='votre_clé_ici'
```

## 🚀 Utilisation Rapide

### 1. Avec le Mock (tests)

```python
from src.loaders.data_loader import DataLoader
from src.decisions.llm import MockLLMClient, LLMBasedDecisionRule

# Charger les données
loader = DataLoader(data_dir="data")
of = loader.get_of_by_num("F126-44769")

# Créer le client mock
llm_client = MockLLMClient()

# Créer la règle de décision
decision_rule = LLMBasedDecisionRule(llm_client=llm_client)

# Évaluer
decision = decision_rule.evaluate(of=of, commande=None, loader=loader)

print(f"Action: {decision.action.value}")
# Output: defer
```

### 2. Avec le vrai LLM Mistral

```python
import os
from src.decisions.llm import MistralLLMClient, LLMBasedDecisionRule

# Créer le client Mistral
llm_client = MistralLLMClient(
    api_key=os.environ.get("MISTRAL_API_KEY"),
    model="mistral-large-latest",
    temperature=0.3
)

# Créer la règle de décision
decision_rule = LLMBasedDecisionRule(llm_client=llm_client)

# Évaluer (même code qu'avec mock)
decision = decision_rule.evaluate(of=of, commande=None, loader=loader)
```

## 🔍 Analyse Allocation-First

Le système vérifie **en premier** les allocations déjà faites pour l'OF :

```python
# Dans LLMContextBuilder.build_context()
allocations_of = loader.get_allocations_of(of.num_of)

# Pour chaque composant :
stock_net_pour_of = stock_disponible + stock_alloué_à_cet_of

# C'est ce qui est RÉELLEMENT disponible pour la production
```

C'est **critical** car :
- Les allocations déjà faites sont des engagements
- Elles doivent être respectées
- Le stock net est plus réaliste que le stock brut

## 📊 Contexte d'Analyse

Pour chaque OF, le LLM reçoit :

1. **Infos OF** : numéro, article, quantité, date, statut
2. **Infos Commande** : client, urgence (si disponible)
3. **Analyse Composants** :
   - Article, niveau, type (Acheté/Fabriqué)
   - Quantité requise
   - Stock physique, alloué total, alloué à cet OF
   - Stock bloqué (contrôle qualité)
   - Stock disponible et stock net
   - Situation (disponible, rupture, bloqué, tension)
   - Ratio de couverture

4. **Composants Critiques** : Ceux avec ratio < 80%
5. **Situation Globale** : Faisabilité, conditions de déblocage, délai

## 🎨 Format de Réponse LLM

```json
{
  "action": "ACCEPT_AS_IS" | "ACCEPT_PARTIAL" | "REJECT" | "DEFER" | "DEFER_PARTIAL",
  "reason": "Explication détaillée (2-3 phrases)",
  "modified_quantity": null | <int>,
  "defer_date": null | "YYYY-MM-DD",
  "action_required": "Action concrète à entreprendre",
  "confidence": 0.0 à 1.0,
  "metadata": {
    "composants_limitants": ["comp1", "comp2"],
    "situation": "bloqué_temporaire" | "rupture" | "autre",
    "delai_estime": "2-3 jours" | null
  }
}
```

## 🛡️ Fallback

Si le LLM échoue (API down, réponse invalide, etc.), le système utilise un **fallback conservatif** basé sur l'analyse contextuelle :

- **faisable** → ACCEPT_AS_IS
- **faisable_avec_conditions** → DEFER (2-3 jours)
- **non_faisable** → REJECT

## 🧪 Tests

```bash
# Test avec mock (pas de clé API requise)
python test_llm_decision.py

# Test avec vrai LLM (nécessite MISTRAL_API_KEY)
export MISTRAL_API_KEY='votre_clé_ici'
python test_mistral_real.py
```

## 📁 Fichiers

| Fichier | Responsabilité |
|---------|----------------|
| `models.py` | Dataclasses pour le contexte d'analyse |
| `llm_client.py` | Interface abstraite + Mock |
| `mistral_client.py` | Client Mistral avec retry |
| `context_builder.py` | Analyse allocation + composants |
| `prompt_builder.py` | Construction prompts structurés |
| `response_parser.py` | Validation et parsing JSON |
| `llm_decision_rule.py` | Orchestration complète |

## 💡 Coûts

**Estimation avec Mistral Large** : ~0.01€ par décision

- Prompt : ~2000 tokens
- Réponse : ~200-300 tokens
- Total : ~2500 tokens
- Tarif : ~2-4€ / million tokens

Voir [MISTRAL_INTEGRATION.md](../../../MISTRAL_INTEGRATION.md) pour les détails.

## 🔄 Extensibilité

Pour ajouter un nouveau provider LLM (Anthropic, OpenAI, etc.) :

1. Créer `AnthropicLLMClient` implémentant `BaseLLMClient`
2. Implémenter `call_llm()` et `call_llm_with_retry()`
3. Ajouter dans `config/decisions_llm.yaml`
4. Utiliser de la même manière :

```python
llm_client = AnthropicLLMClient(api_key="...")
decision_rule = LLMBasedDecisionRule(llm_client=llm_client)
```

## 📚 Documentation

- [MISTRAL_INTEGRATION.md](../../../MISTRAL_INTEGRATION.md) : Guide complet Mistral
- [config/decisions_llm.yaml](../../../config/decisions_llm.yaml) : Configuration

---

**Version** : 1.0
**Date** : 2025-03-23
