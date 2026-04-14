# Intégration Technique LLM - Guide d'Implémentation

> **Date** : 23 mars 2026
> **Objectif** : Guide technique pour intégrer un LLM dans le système de décision

---

## 1. Dépendances Python

Ajouter à `requirements.txt` :

```txt
# LLM Integration
anthropic>=0.25.0  # Claude API client
openai>=1.0.0      # OpenAI API client (optionnel)

# Configuration
python-dotenv>=1.0.0  # Gestion des variables d'environnement
pydantic>=2.0.0       # Validation des réponses LLM
```

Installer :

```bash
pip install anthropic python-dotenv pydantic
# ou si vous utilisez OpenAI :
pip install openai python-dotenv pydantic
```

---

## 2. Configuration des Clés API

### Méthode A : Variables d'environnement (recommandé)

Créer un fichier `.env` à la racine du projet :

```bash
# .env
ANTHROPIC_API_KEY=sk-ant-votre_clé_ici
# ou pour OpenAI :
# OPENAI_API_KEY=sk-votre_clé_ici
```

**IMPORTANT** : Ajouter `.env` à `.gitignore` !

```bash
echo ".env" >> .gitignore
```

### Méthode B : Paramètre directement

```python
client = Anthropic(api_key="sk-ant-votre_clé_ici")
```

---

## 3. Structure du Module LLM

```
src/decisions/llm/
├── __init__.py
├── models.py                 # Modèles de données (LLMAnalysisContext, etc.)
├── context_builder.py         # Construction du contexte
├── prompt_builder.py          # Construction des prompts
├── llm_client.py              # Client API (Claude ou OpenAI)
├── response_parser.py         # Parsing des réponses LLM
└── llm_decision_rule.py       # Règle de décision basée sur LLM
```

---

## 4. Implémentation du LLM Client

### Fichier : `src/decisions/llm/llm_client.py`

```python
"""Client pour appeler l'API LLM."""

import os
from typing import Optional
from enum import Enum

try:
    from anthropic import Anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False

try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


class LLMProvider(Enum):
    """Provider LLM."""
    ANTHROPIC = "anthropic"
    OPENAI = "openai"


class LLMClient:
    """Client pour appeler l'API LLM.

    Supporte Anthropic Claude et OpenAI GPT.
    """

    def __init__(
        self,
        provider: LLMProvider = LLMProvider.ANTHROPIC,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.3,
        timeout: int = 30
    ):
        """Initialise le client LLM.

        Parameters
        ----------
        provider : LLMProvider
            Provider à utiliser (anthropic ou openai)
        model : str, optional
            Modèle à utiliser. Si None, utilise le défaut du provider.
        api_key : str, optional
            Clé API. Si None, lit depuis les variables d'environnement.
        max_tokens : int
            Nombre max de tokens dans la réponse (défaut: 2000)
        temperature : float
            Température pour la génération (0.0 à 1.0, défaut: 0.3)
        timeout : int
            Timeout en secondes (défaut: 30)
        """
        self.provider = provider
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.timeout = timeout

        # Modèles par défaut
        if model is None:
            if provider == LLMProvider.ANTHROPIC:
                model = "claude-3-5-sonnet-20241022"
            else:
                model = "gpt-4o"

        self.model = model

        # Initialiser le client
        if provider == LLMProvider.ANTHROPIC:
            if not ANTHROPIC_AVAILABLE:
                raise ImportError("Package 'anthropic' non installé. Pip install anthropic")

            api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY non définie")

            self.client = Anthropic(api_key=api_key)

        elif provider == LLMProvider.OPENAI:
            if not OPENAI_AVAILABLE:
                raise ImportError("Package 'openai' non installé. Pip install openai")

            api_key = api_key or os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY non définie")

            self.client = OpenAI(api_key=api_key)

    def call_llm(
        self,
        prompt: str,
        system_prompt: Optional[str] = None
    ) -> str:
        """Appelle l'API LLM.

        Parameters
        ----------
        prompt : str
            Prompt utilisateur
        system_prompt : str, optional
            Prompt système

        Returns
        -------
        str
            Réponse du LLM (texte brut)

        Raises
        ------
        Exception
            Si erreur d'API ou timeout
        """
        try:
            if self.provider == LLMProvider.ANTHROPIC:
                return self._call_anthropic(prompt, system_prompt)
            else:
                return self._call_openai(prompt, system_prompt)
        except Exception as e:
            raise Exception(f"Erreur appel LLM {self.provider.value}: {e}")

    def _call_anthropic(
        self,
        prompt: str,
        system_prompt: Optional[str] = None
    ) -> str:
        """Appelle l'API Anthropic Claude."""
        message = self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            system=system_prompt,
            messages=[
                {"role": "user", "content": prompt}
            ],
            timeout=self.timeout
        )

        return message.content[0].text

    def _call_openai(
        self,
        prompt: str,
        system_prompt: Optional[str] = None
    ) -> str:
        """Appelle l'API OpenAI GPT."""
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            timeout=self.timeout
        )

        return response.choices[0].message.content

    def call_llm_with_retry(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_retries: int = 3
    ) -> str:
        """Appelle l'API LLM avec retry en cas d'erreur.

        Parameters
        ----------
        prompt : str
            Prompt utilisateur
        system_prompt : str, optional
            Prompt système
        max_retries : int
            Nombre de tentatives (défaut: 3)

        Returns
        -------
        str
            Réponse du LLM

        Raises
        ------
        Exception
            Si toutes les tentatives échouent
        """
        import time

        last_error = None
        for attempt in range(max_retries):
            try:
                return self.call_llm(prompt, system_prompt)
            except Exception as e:
                last_error = e
                if attempt < max_retries - 1:
                    # Attendre avant de réessayer (exponential backoff)
                    wait_time = 2 ** attempt
                    print(f"Erreur LLM, réessaie dans {wait_time}s... ({attempt + 1}/{max_retries})")
                    time.sleep(wait_time)
                else:
                    raise Exception(f"Toutes les tentatives ont échoué: {last_error}")

        raise last_error
```

---

## 5. Configuration

### Fichier : `config/decisions_llm.yaml`

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

## 6. Parsing des Réponses LLM

### Fichier : `src/decisions/llm/response_parser.py`

```python
"""Parsing des réponses LLM."""

import json
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class ParsedLLMDecision:
    """Décision parsée depuis la réponse LLM."""
    action: str  # "ACCEPT_AS_IS", "ACCEPT_PARTIAL", etc.
    reason: str
    modified_quantity: Optional[int]
    defer_date: Optional[str]
    action_required: str
    confidence: float
    metadata: Dict[str, Any]


class LLMResponseParser:
    """Parse la réponse JSON du LLM."""

    def parse_decision(self, response: str) -> ParsedLLMDecision:
        """Parse la réponse JSON du LLM.

        Parameters
        ----------
        response : str
            Réponse brute du LLM

        Returns
        -------
        ParsedLLMDecision
            Décision parsée

        Raises
        ------
        ValueError
            Si la réponse n'est pas un JSON valide
            Si des champs requis sont manquants
            Si des valeurs sont invalides
        """
        # Nettoyer la réponse (enlever les marques de code markdown)
        response = response.strip()
        if response.startswith("```"):
            # Enlever les marques de code (```json, ```)
            lines = response.split("\n")
            if len(lines) > 1:
                response = "\n".join(lines[1:-1])
            else:
                response = lines[0].replace("```json", "").replace("```", "")

        # Parser le JSON
        try:
            data = json.loads(response)
        except json.JSONDecodeError as e:
            raise ValueError(f"Réponse n'est pas un JSON valide: {e}\nRéponse: {response[:500]}")

        # Valider les champs requis
        required_fields = ["action", "reason", "action_required", "confidence"]
        for field in required_fields:
            if field not in data:
                raise ValueError(f"Champ requis manquant: {field}")

        # Valider l'action
        valid_actions = ["ACCEPT_AS_IS", "ACCEPT_PARTIAL", "REJECT", "DEFER", "DEFER_PARTIAL"]
        if data["action"] not in valid_actions:
            raise ValueError(f"Action invalide: {data['action']}. Actions valides: {valid_actions}")

        # Valider la confidence
        confidence = float(data["confidence"])
        if not 0.0 <= confidence <= 1.0:
            raise ValueError(f"Confidence doit être entre 0.0 et 1.0: {confidence}")

        # Créer la décision parsée
        return ParsedLLMDecision(
            action=data["action"],
            reason=self._sanitize_reason(data["reason"]),
            modified_quantity=data.get("modified_quantity"),
            defer_date=data.get("defer_date"),
            action_required=data["action_required"],
            confidence=confidence,
            metadata=data.get("metadata", {})
        )

    def _sanitize_reason(self, reason: str) -> str:
        """Nettoie et formate la raison."""
        # Limiter la longueur
        if len(reason) > 500:
            reason = reason[:497] + "..."
        return reason.strip()

    def validate_decision(self, decision: ParsedLLMDecision) -> bool:
        """Valide la cohérence de la décision.

        Parameters
        ----------
        decision : ParsedLLMDecision
            Décision à valider

        Returns
        -------
        bool
            True si valide, False sinon
        """
        # Valider la cohérence action/champs
        if decision.action == "ACCEPT_PARTIAL":
            if decision.modified_quantity is None:
                return False
            if decision.modified_quantity <= 0:
                return False

        if decision.action in ["DEFER", "DEFER_PARTIAL"]:
            if decision.defer_date is None:
                return False

        # Valider la confidence
        if decision.confidence < 0.5:
            return False

        return True
```

---

## 7. Utilisation dans le DecisionEngine

### Fichier : `src/decisions/engine.py` (modifications)

```python
from .llm.llm_client import LLMClient, LLMProvider
from .llm.llm_decision_rule import LLMBasedDecisionRule


class DecisionEngine:
    """Moteur de décision métier."""

    def __init__(
        self,
        config_path: str = "config/decisions_llm.yaml",
        use_llm: bool = True,
        llm_provider: str = "anthropic",
        llm_model: Optional[str] = None,
        persistence_enabled: bool = True
    ):
        """Initialise le moteur de décision.

        Parameters
        ----------
        config_path : str
            Chemin vers le fichier de configuration YAML
        use_llm : bool
            Si True, utilise LLMBasedDecisionRule
            Si False, utilise SmartDecisionRule (legacy)
        llm_provider : str
            Provider LLM ("anthropic" ou "openai")
        llm_model : str, optional
            Modèle LLM. Si None, utilise le défaut du provider.
        """
        if use_llm:
            # Créer le client LLM
            provider = LLMProvider.ANTHROPIC if llm_provider == "anthropic" else LLMProvider.OPENAI
            llm_client = LLMClient(
                provider=provider,
                model=llm_model
            )

            # Créer la règle basée sur LLM
            self.decision_rule = LLMBasedDecisionRule(
                config_path=config_path,
                llm_client=llm_client
            )
        else:
            # Fallback vers les règles statiques (legacy)
            from .smart_rule import SmartDecisionRule
            self.decision_rule = SmartDecisionRule(config_path)

        # Persistance (inchangée)
        if persistence_enabled:
            self.persistence = DecisionPersistence(
                file_path="data/decisions_history.json",
                max_entries=10000
            )
        else:
            self.persistence = None

        self.persistence_enabled = persistence_enabled
```

---

## 8. Tests

### Fichier : `tests/decisions/test_llm_client.py`

```python
"""Tests du client LLM."""

import os
import pytest
from src.decisions.llm.llm_client import LLMClient, LLMProvider


@pytest.mark.skipif(
    os.getenv("ANTHROPIC_API_KEY") is None,
    reason="ANTHROPIC_API_KEY non définie"
)
def test_anthropic_client_call():
    """Test l'appel à l'API Anthropic."""
    client = LLMClient(
        provider=LLMProvider.ANTHROPIC,
        model="claude-3-5-haiku-20241022"  # Plus économique pour les tests
    )

    response = client.call_llm(
        prompt="Qu'est-ce que 2 + 2 ? Réponds uniquement avec le chiffre.",
        system_prompt="Tu es un assistant mathématique."
    )

    assert "4" in response


@pytest.mark.skipif(
    os.getenv("OPENAI_API_KEY") is None,
    reason="OPENAI_API_KEY non définie"
)
def test_openai_client_call():
    """Test l'appel à l'API OpenAI."""
    client = LLMClient(
        provider=LLMProvider.OPENAI,
        model="gpt-4o-mini"
    )

    response = client.call_llm(
        prompt="Qu'est-ce que 2 + 2 ? Réponds uniquement avec le chiffre.",
        system_prompt="Tu es un assistant mathématique."
    )

    assert "4" in response


def test_llm_client_missing_api_key():
    """Test que le client lève une erreur si pas de clé API."""
    # Supprimer temporairement la clé d'environnement
    original_key = os.getenv("ANTHROPIC_API_KEY")
    os.environ["ANTHROPIC_API_KEY"] = ""

    try:
        client = LLMClient(provider=LLMProvider.ANTHROPIC)
        pytest.fail("Devrait lever ValueError")
    except ValueError as e:
        assert "ANTHROPIC_API_KEY" in str(e)
    finally:
        # Restaurer la clé
        if original_key:
            os.environ["ANTHROPIC_API_KEY"] = original_key
        else:
            os.environ.pop("ANTHROPIC_API_KEY", None)
```

---

## 9. Coûts Estimés

### Pour 1000 décisions LLM par jour

**Claude Sonnet** (`claude-3-5-sonnet-20241022`) :
- Input : ~1500 tokens/decision (contexte OF + nomenclature)
- Output : ~500 tokens/decision (réponse JSON)
- Total : ~2000 tokens/decision
- Coût : 2000 * 1000 / 1M * $3 = **$6/jour** = **~$180/mois**

**Claude Haiku** (`claude-3-5-haiku-20241022`) :
- Coût : 2000 * 1000 / 1M * $0.25 = **$0.50/jour** = **~$15/mois**

**Recommandation** : Commencer avec Haiku pour les tests, passer à Sonnet pour la production si la qualité nécessite.

---

## 10. Monitoring

### Ajouter du logging

```python
import logging

logger = logging.getLogger(__name__)

class LLMClient:
    # ...

    def _call_anthropic(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Appelle l'API Anthropic Claude."""
        logger.info(f"Appel LLM Anthropic: model={self.model}, prompt_tokens={len(prompt)//4}")

        start_time = time.time()
        message = self.client.messages.create(...)
        elapsed = time.time() - start_time

        logger.info(f"Réponse LLM reçue en {elapsed:.2f}s, output_tokens={message.usage.output_tokens}")
        return message.content[0].text
```

---

## 11. Gestion des Erreurs

```python
def call_llm_with_fallback(
    self,
    prompt: str,
    system_prompt: Optional[str] = None
) -> str:
    """Appelle le LLM avec fallback si erreur.

    Essaie:
    1. Provider principal (ex: Anthropic)
    2. Provider de secours (ex: OpenAI)
    3. Lève une exception si les deux échouent
    """
    try:
        return self.call_llm(prompt, system_prompt)
    except Exception as e:
        logger.warning(f"Erreur provider principal {self.provider.value}: {e}")

        # Fallback vers l'autre provider
        if self.provider == LLMProvider.ANTHROPIC:
            logger.info("Fallback vers OpenAI")
            fallback_client = LLMClient(provider=LLMProvider.OPENAI)
        else:
            logger.info("Fallback vers Anthropic")
            fallback_client = LLMClient(provider=LLMProvider.ANTHROPIC)

        return fallback_client.call_llm(prompt, system_prompt)
```

---

## 12. Checklist déploiement

- [ ] Installer les dépendances (`pip install anthropic python-dotenv pydantic`)
- [ ] Créer le fichier `.env` avec la clé API
- [ ] Ajouter `.env` à `.gitignore`
- [ ] Tester la clé API : `python -c "from anthropic import Anthropic; print(Anthropic().models.list())"`
- [ ] Configurer `config/decisions_llm.yaml`
- [ ] Tester avec un cas simple (F126-44769)
- [ ] Monitoring : Ajouter le logging
- [ ] Calculer les coûts estimés
- [ ] Configurer le fallback si provider principal down

---

**Document sauvegardé** : `docs/superpowers/specs/llm-integration-technique.md`
