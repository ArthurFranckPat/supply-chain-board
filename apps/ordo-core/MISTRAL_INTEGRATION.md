# Guide d'Intégration Mistral AI

## 📋 Table des matières

1. [Configuration du compte](#1-configuration-du-compte)
2. [Installation](#2-installation)
3. [Utilisation](#3-utilisation)
4. [Coûts](#4-coûts)
5. [Bonnes pratiques](#5-bonnes-pratiques)

---

## 1. Configuration du compte

### Étapes préalables

1. **Créer un compte Mistral**
   - Aller sur https://console.mistral.ai
   - Créer un compte ou se connecter

2. **Configurer l'organisation et les paiements**
   - Aller sur https://admin.mistral.ai
   - Section "Administration" → "Billing"
   - **IMPORTANT**: Activer les paiements (obligatoire pour utiliser l'API)
   - Choisir un plan :
     - **Experiment** : Gratuit pour tester
     - **Scale** : Pay-as-you-go pour la production

3. **Créer une clé API**
   - Retourner sur https://console.mistral.ai
   - Workspace → API Keys
   - Cliquer "Create new key"
   - **Copier et sauvegarder** la clé (ne pas la partager !)

---

## 2. Installation

### Installer le SDK

```bash
pip install mistralai
```

### Configurer la clé API

**Option 1: Variable d'environnement (recommandé)**

```bash
export MISTRAL_API_KEY='votre_clé_ici'
```

**Option 2: Dans un fichier .env**

```bash
MISTRAL_API_KEY=votre_clé_ici
```

Puis charger avec :
```python
from dotenv import load_dotenv
load_dotenv()
```

**Option 3: Directement dans le code (non recommandé)**

```python
llm_client = MistralLLMClient(api_key="votre_clé_ici")
```

---

## 3. Utilisation

### Code minimal

```python
from src.decisions.llm.mistral_client import MistralLLMClient
from src.decisions.llm.llm_decision_rule import LLMBasedDecisionRule
from src.loaders.data_loader import DataLoader

# 1. Créer le client
llm_client = MistralLLMClient(
    model="mistral-large-latest",
    temperature=0.3
)

# 2. Créer la règle de décision
decision_rule = LLMBasedDecisionRule(
    llm_client=llm_client,
    config_path="config/decisions_llm.yaml"
)

# 3. Charger les données
loader = DataLoader(data_dir="data")

# 4. Évaluer un OF
of = loader.get_of_by_num("F126-44769")
decision = decision_rule.evaluate(
    of=of,
    commande=None,
    loader=loader
)

print(f"Action: {decision.action.value}")
print(f"Raison: {decision.reason}")
```

### Script de test

```bash
# Exécuter le script de test
export MISTRAL_API_KEY='votre_clé_ici'
python test_mistral_real.py
```

### Modèles disponibles

| Modèle | Description | Utilisation |
|--------|-------------|-------------|
| `mistral-large-latest` | Modèle le plus capable | **Recommandé** pour décisions complexes |
| `mistral-medium-latest` | Modèle équilibré | Pour tâches standards |
| `mistral-small-latest` | Modèle rapide | Pour tests/développement |

### Paramètres

| Paramètre | Description | Valeur recommandée |
|-----------|-------------|-------------------|
| `temperature` | Créativité (0.0 = déterministe) | **0.3** (décisions fiables) |
| `max_tokens` | Longueur max de réponse | **2000** (suffisant) |

---

## 4. Coûts

### Estimation

Basé sur les tarifs Mistral (2025) :

| Modèle | Prix / Million tokens | Coût / décision ~ |
|--------|----------------------|-------------------|
| mistral-large | ~2-4€ | **0.01-0.02€** |
| mistral-medium | ~0.5-1€ | **0.003-0.005€** |
| mistral-small | ~0.1-0.2€ | **0.001-0.002€** |

**Estimation par décision** :
- Prompt : ~2000 tokens (contexte OF + composants)
- Réponse : ~200-300 tokens (décision JSON)
- Total : ~2500 tokens
- **Coût estimé avec mistral-large** : **~0.01€ par décision**

### Exemple de volume

| Volume | Coût estimé (mensuel) |
|--------|----------------------|
| 100 décisions/jour | ~30€ |
| 1000 décisions/jour | ~300€ |
| 10000 décisions/jour | ~3000€ |

---

## 5. Bonnes pratiques

### Gestion des erreurs

Le système inclut automatiquement :
- **Retry avec exponentiel backoff** (jusqu'à 3 tentatives)
- **Fallback vers décisions conservatives** si LLM échoue
- **Logging détaillé** pour debugging

### Monitoring

```python
import logging

# Activer le logging DEBUG pour voir les appels API
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("src.decisions.llm")
logger.setLevel(logging.DEBUG)
```

### Performance

1. **Batch processing** : Pour traiter plusieurs OFs, utiliser un ThreadPoolExecutor
2. **Caching** : Les décisions LLM peuvent être mises en cache (TODO)
3. **Async** : Le SDK Mistral supporte les appels asynchrones (TODO)

### Sécurité

- ✅ **Jamais** commiter les clés API dans le code
- ✅ Utiliser des variables d'environnement
- ✅ Utiliser des fichiers `.env` dans `.gitignore`
- ✅ Tourner les clés API régulièrement

### Configuration

Le fichier `config/decisions_llm.yaml` permet de configurer :

```yaml
llm_provider:
  name: "mistral"  # Changer de "mock" à "mistral"
  api_key: null  # Utiliser MISTRAL_API_KEY
  model: "mistral-large-latest"
  temperature: 0.3
  max_tokens: 2000

retry:
  max_retries: 3
  retry_delay: 1.0
```

---

## 🚀 Checklist de déploiement

Avant de passer en production avec le vrai LLM :

- [ ] Compte Mistral créé avec paiement activé
- [ ] Clé API générée et stockée sécurisément
- [ ] SDK `mistralai` installé
- [ ] Tests exécutés avec succès (`test_mistral_real.py`)
- [ ] Coûts estimés et validés
- [ ] Monitoring en place
- [ ] Fallback testé (couper internet pour tester)
- [ ] Variables d'environnement configurées en production

---

## 📚 Ressources

- **Documentation Mistral** : https://docs.mistral.ai
- **Console** : https://console.mistral.ai
- **Tarifs** : https://mistral.ai/pricing
- **Modèles** : https://docs.mistral.ai/getting-started/models/

---

## 🐛 Dépannage

### Erreur: "Clé API manquante"

```bash
export MISTRAL_API_KEY='votre_clé_ici'
python test_mistral_real.py
```

### Erreur: "Payments not enabled"

- Aller sur https://admin.mistral.ai
- Section Administration → Billing
- Activer les paiements (même plan gratuit)

### Erreur: "ImportError: mistralai"

```bash
pip install mistralai
```

### Réponse vide ou invalide

- Vérifier les logs avec `logging.basicConfig(level=logging.DEBUG)`
- Réduire `temperature` à 0.0 pour plus de déterminisme
- Vérifier que le prompt ne dépasse pas la limite de tokens

---

**Fichier créé** : 2025-03-23
**Version** : 1.0
