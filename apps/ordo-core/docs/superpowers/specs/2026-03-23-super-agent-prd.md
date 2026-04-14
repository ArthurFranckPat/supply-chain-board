# PRD — Super Agent Ordonnanceur

> **Date** : 23 mars 2026
> **Statut** : Proposition
> **Auteur** : Équipe Ordo v2

---

## 1. Contexte et problème

### Contexte

Le système `ordo v2` calcule déjà :
- La charge par poste de charge (heatmap S+1 → S+4)
- La faisabilité des OF (vérification récursive des composants)
- Le matching commande → OF
- Les KPIs de taux de service

Il expose également **8 outils spécialisés** couvrant l'ensemble du cycle d'ordonnancement hebdomadaire.

### Problème

Ces outils sont aujourd'hui **accessibles uniquement via un menu CLI** (`menu.py`). L'ordonnanceur doit :
1. Savoir quel outil appeler pour répondre à sa question
2. Combiner plusieurs outils à la main pour construire une analyse
3. Interpréter les résultats bruts (chiffres, listes d'OFs)

L'ordonnanceur n'est pas un analyste de données — il pilote une production manufacturière avec des contraintes temps-réel (réunion de charge le mardi, lancement en production en cours de semaine).

### Vision

Un **agent conversationnel** qui comprend les questions métier de l'ordonnanceur, appelle les bons outils dans le bon ordre, et répond en français avec une synthèse actionnelle — comme un assistant spécialisé en ordonnancement industriel.

---

## 2. Cas d'usage cibles

### UC-1 — Briefing quotidien (8h00)
> "Quelle est la situation ce matin ?"

L'agent appelle `summarize_week_status`, synthétise les alertes critiques, les goulots de S+1, le taux de service, et donne 3 actions prioritaires.

### UC-2 — Analyse d'un OF
> "Est-ce que je peux affermir F426-08419 cette semaine ?"

L'agent consulte `get_rescheduling_messages` (retard ?), `get_competing_ofs_for_component` (concurrence composants), `simulate_schedule_impact` (impact charge). Il donne une recommandation AFFIRMER / REPORTER avec justification.

### UC-3 — Gestion des goulots
> "PP_830 est surchargée ce mardi, que faire ?"

L'agent appelle `detect_bottlenecks` pour confirmer, `sequence_ofs_for_poste` pour voir la file d'attente, `simulate_schedule_impact` pour évaluer l'impact de décaler certains OFs. Il propose un réordonnancement.

### UC-4 — Alerte composant
> "On n'a plus de A4168, qui est impacté ?"

L'agent appelle `get_competing_ofs_for_component("A4168")` et `check_late_receptions_impact`. Il liste les OFs bloqués, la réception attendue, et conseille quels OFs prioriser quand le stock arrive.

### UC-5 — Préparation réunion de charge
> "Prépare-moi le point pour la réunion de mardi"

L'agent appelle `summarize_week_status` + `detect_bottlenecks` + `get_service_rate_kpis`. Il génère un compte-rendu structuré : situation de la semaine, décisions à prendre, postes à surveiller.

---

## 3. Architecture technique

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────┐
│                     INTERFACE                           │
│   CLI (menu.py)  |  REPL  |  Future API REST            │
└────────────────────────┬────────────────────────────────┘
                         │ question naturelle
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   SUPER AGENT                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │               Agentic Loop                      │   │
│  │                                                 │   │
│  │  1. LLM reçoit la question + system prompt      │   │
│  │  2. LLM décide quels tools appeler              │   │
│  │  3. Tools s'exécutent (données réelles)         │   │
│  │  4. Résultats renvoyés au LLM                   │   │
│  │  5. LLM synthétise → réponse finale             │   │
│  │  (itère si besoin)                              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Modèle : claude-sonnet-4-5 (tool_use)                  │
│  Context : DataLoader (données CSV en mémoire)          │
└────────────────────┬────────────────────────────────────┘
                     │ appels tools
                     ▼
┌─────────────────────────────────────────────────────────┐
│                  CATALOGUE OUTILS (8)                   │
│                                                         │
│  Tool 1  get_rescheduling_messages                      │
│  Tool 2  check_late_receptions_impact                   │
│  Tool 3  detect_bottlenecks                             │
│  Tool 4  simulate_schedule_impact                       │
│  Tool 5  sequence_ofs_for_poste                         │
│  Tool 6  get_service_rate_kpis                          │
│  Tool 7  get_competing_ofs_for_component                │
│  Tool 8  summarize_week_status                          │
└────────────────────┬────────────────────────────────────┘
                     │ lit
                     ▼
┌─────────────────────────────────────────────────────────┐
│                    DONNÉES (DataLoader)                  │
│                                                         │
│  of_entetes.csv        commandes_clients.csv            │
│  nomenclatures.csv     stock.csv                        │
│  gammes.csv            receptions_oa.csv                │
│  articles.csv          of_composants.csv                │
└─────────────────────────────────────────────────────────┘
```

### Composants

| Composant | Rôle | Fichier |
|-----------|------|---------|
| `SuperAgent` | Orchestrateur principal — agentic loop | `src/agents/super_agent.py` |
| `SuperAgentTools` | Adaptateurs tools → format Anthropic tool_use | `src/agents/super_agent_tools.py` |
| `SuperAgentPrompt` | System prompt et contexte métier | `src/agents/super_agent_prompt.py` |
| `LLMClient` | Client Anthropic (existant) | `src/agents/llm/llm_client.py` |
| `DataLoader` | Accès aux données (existant) | `src/loaders/data_loader.py` |
| Menu CLI | Point d'entrée utilisateur (existant) | `menu.py` |

---

## 4. Agentic Loop (flux d'exécution)

```
Utilisateur → question

SuperAgent.chat(question)
  │
  ├─ Construit messages : [system_prompt, {role: user, content: question}]
  │
  └─ Boucle :
       │
       ├─ client.messages.create(model, messages, tools=[...])
       │
       ├─ Si stop_reason == "end_turn"
       │    └─ Retourner texte de la réponse finale
       │
       └─ Si stop_reason == "tool_use"
            │
            ├─ Pour chaque tool_call dans response.content :
            │    ├─ Identifier le tool par son nom
            │    ├─ Désérialiser les paramètres JSON
            │    ├─ Appeler le tool Python (synchrone)
            │    └─ Sérialiser le résultat en JSON
            │
            ├─ Ajouter au messages :
            │    {role: assistant, content: response.content}
            │    {role: user, content: [tool_results...]}
            │
            └─ Recommencer la boucle (max 10 itérations)
```

**Limite** : 10 itérations maximum pour éviter les boucles infinies. Si la limite est atteinte, l'agent répond avec ce qu'il a.

---

## 5. Catalogue des tools (format tool_use Anthropic)

### Tool 1 — get_rescheduling_messages
```json
{
  "name": "get_rescheduling_messages",
  "description": "Retourne les messages de réordonnancement pour les OFs actifs. Détecte les OFs en retard, les retards imminents, les urgences commandes et les déblocages composants. Utiliser pour : alertes OF, situation de la semaine, priorisation.",
  "input_schema": {
    "type": "object",
    "properties": {
      "max_retard_days": {
        "type": "integer",
        "description": "Filtre les OFs en retard de plus de N jours (zombies). Défaut : 90.",
        "default": 90
      },
      "horizon_urgence_days": {
        "type": "integer",
        "description": "Seuil commande urgente en jours. Défaut : 5.",
        "default": 5
      }
    }
  }
}
```

### Tool 2 — check_late_receptions_impact
```json
{
  "name": "check_late_receptions_impact",
  "description": "Identifie les réceptions fournisseurs en retard et les OFs/commandes bloqués en cascade. Utiliser pour : ruptures composants achetés, alertes fournisseurs, impact sur les OFs.",
  "input_schema": {
    "type": "object",
    "properties": {
      "max_retard_days": {
        "type": "integer",
        "description": "Filtre les réceptions trop anciennes (données stale). Défaut : 90.",
        "default": 90
      }
    }
  }
}
```

### Tool 3 — detect_bottlenecks
```json
{
  "name": "detect_bottlenecks",
  "description": "Détecte les postes de charge saturés (>100%), en tension (80-100%) et sous-chargés (<50%). Utiliser pour : réunion de charge, décision d'organisation (2x8, 3x8), identification des goulots.",
  "input_schema": {
    "type": "object",
    "properties": {
      "semaine": {
        "type": "string",
        "description": "Semaine à analyser : S+1, S+2, S+3, S+4. Si absent, analyse toutes les semaines."
      },
      "capacite_defaut": {
        "type": "number",
        "description": "Capacité nominale par poste en heures/semaine. Défaut : 35h.",
        "default": 35.0
      }
    }
  }
}
```

### Tool 4 — simulate_schedule_impact
```json
{
  "name": "simulate_schedule_impact",
  "description": "Simule l'impact sur la charge si on ajoute une liste d'OFs au planning. Calcule le delta de charge par poste et semaine, et détecte les nouveaux goulots créés. Utiliser pour : évaluer l'affermissement d'OFs, tester des scénarios.",
  "input_schema": {
    "type": "object",
    "properties": {
      "num_ofs": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Liste de numéros d'OF à simuler."
      },
      "capacite_defaut": {
        "type": "number",
        "description": "Capacité nominale par poste en heures/semaine. Défaut : 35h.",
        "default": 35.0
      }
    },
    "required": ["num_ofs"]
  }
}
```

### Tool 5 — sequence_ofs_for_poste
```json
{
  "name": "sequence_ofs_for_poste",
  "description": "Séquence les OFs sur un poste de charge selon une règle de priorité. Règles : EDD (date échéance croissante), FIFO (date fin OF croissante), SPT (durée opération croissante). Utiliser pour : organiser la file d'attente d'un poste, réduire les retards.",
  "input_schema": {
    "type": "object",
    "properties": {
      "poste_charge": {
        "type": "string",
        "description": "Code du poste de charge (ex: PP_830)."
      },
      "regle": {
        "type": "string",
        "enum": ["EDD", "FIFO", "SPT"],
        "description": "Règle de séquencement. EDD = Earliest Due Date, FIFO = First In First Out, SPT = Shortest Processing Time.",
        "default": "EDD"
      },
      "only_feasible": {
        "type": "boolean",
        "description": "Si true, exclut les OFs non faisables (composants en rupture). Défaut : false.",
        "default": false
      }
    },
    "required": ["poste_charge"]
  }
}
```

### Tool 6 — get_service_rate_kpis
```json
{
  "name": "get_service_rate_kpis",
  "description": "Calcule les KPIs de taux de service : taux global (commandes soldées / total), détail par client, commandes en retard, OFs actifs affermis/suggérés, utilisation des postes S+1. Utiliser pour : bilan hebdomadaire, reporting, suivi clients.",
  "input_schema": {
    "type": "object",
    "properties": {
      "capacite_defaut": {
        "type": "number",
        "description": "Capacité nominale par poste en heures/semaine. Défaut : 35h.",
        "default": 35.0
      }
    }
  }
}
```

### Tool 7 — get_competing_ofs_for_component
```json
{
  "name": "get_competing_ofs_for_component",
  "description": "Pour un composant donné, liste tous les OFs actifs qui en ont besoin, calcule le besoin total, le déficit, et désigne l'OF prioritaire. Utiliser pour : arbitrer une rupture composant, décider quel OF affermir en premier.",
  "input_schema": {
    "type": "object",
    "properties": {
      "article_composant": {
        "type": "string",
        "description": "Code article du composant (ex: A4168, 11011857)."
      }
    },
    "required": ["article_composant"]
  }
}
```

### Tool 8 — summarize_week_status
```json
{
  "name": "summarize_week_status",
  "description": "Agrège les outils 1, 2, 3 et 6 en un briefing complet de la semaine. Retourne : messages critiques/importants, alertes goulots, réceptions en retard, KPIs de service, texte de briefing prêt à lire. Utiliser en priorité pour les questions générales sur la situation.",
  "input_schema": {
    "type": "object",
    "properties": {}
  }
}
```

---

## 6. System prompt

```
Tu es ORDO, un assistant expert en ordonnancement de production manufacturière.
Tu aides l'ordonnanceur d'une usine industrielle utilisant Sage X3 v12.

CONTEXTE MÉTIER :
- Usine avec des postes de charge (PP_830, PP_128, etc.) organisés en lignes de production
- Deux types d'OFs : Fermes/affermis (statut 1, WOP) et Suggérés (statut 3, WOS)
- Deux types de commandes : MTS (contre-marque, allocation automatique) et NOR/MTO (allocation manuelle)
- Réunion de charge hebdomadaire le mardi : décider l'organisation (2×8, 3×8) pour S+1 à S+3
- Règle d'affermissement : INTERDIT si un composant ACHAT est en rupture

PRINCIPES DE RÉPONSE :
- Réponds en français, de façon concise et directe
- Commence toujours par la conclusion (décision recommandée), puis explique
- Utilise les vrais numéros d'OF, codes articles, noms de postes issus des données
- Si tu n'es pas sûr, dis-le et propose une vérification manuelle
- Les données sont celles du jour — elles reflètent la réalité terrain

QUAND UTILISER LES OUTILS :
- Question générale / "situation" / "briefing" → summarize_week_status
- Question sur un OF précis → get_rescheduling_messages + simulate_schedule_impact
- Problème de composant → get_competing_ofs_for_component + check_late_receptions_impact
- Poste surchargé → detect_bottlenecks + sequence_ofs_for_poste
- Préparation réunion de charge → summarize_week_status + detect_bottlenecks
```

---

## 7. Implémentation

### Fichiers à créer

```
src/agents/
├── super_agent.py          # Classe SuperAgent + agentic loop
├── super_agent_tools.py    # Définitions tools (format Anthropic) + dispatchers
└── super_agent_prompt.py   # System prompt + helpers de formatage résultats
```

### Interface CLI (ajout à menu.py)

Nouvelle option dans le menu questionary existant :

```
> Parler avec l'agent ORDO (conversation libre)
```

Lance une session REPL :
```
ORDO> Quelle est la situation ce matin ?
...
ORDO> Est-ce que je peux affermir F426-08419 ?
...
ORDO> exit
```

### Classe SuperAgent

```python
class SuperAgent:
    def __init__(self, loader: DataLoader, model: str = "claude-sonnet-4-5"):
        self.loader = loader
        self.client = Anthropic()
        self.model = model
        self.tools = build_tools_schema()        # Liste des 8 tools (format Anthropic)
        self.dispatchers = build_dispatchers(loader)  # dict[str, Callable]
        self.system_prompt = ORDO_SYSTEM_PROMPT

    def chat(self, question: str) -> str:
        """Traite une question et retourne la réponse."""
        messages = [{"role": "user", "content": question}]

        for _ in range(10):  # max 10 itérations
            response = self.client.messages.create(
                model=self.model,
                max_tokens=4096,
                system=self.system_prompt,
                tools=self.tools,
                messages=messages,
            )

            if response.stop_reason == "end_turn":
                return response.content[0].text

            if response.stop_reason == "tool_use":
                messages.append({"role": "assistant", "content": response.content})
                tool_results = self._execute_tools(response.content)
                messages.append({"role": "user", "content": tool_results})

        return "Limite d'itérations atteinte. Résultat partiel ci-dessus."

    def _execute_tools(self, content_blocks) -> list:
        """Exécute les tool_use et retourne les résultats."""
        results = []
        for block in content_blocks:
            if block.type == "tool_use":
                try:
                    output = self.dispatchers[block.name](**block.input)
                    result = json.dumps(output, ensure_ascii=False, default=str)
                except Exception as e:
                    result = json.dumps({"error": str(e)})
                results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })
        return results
```

### Sérialisation des résultats tools

Chaque tool retourne un dataclass Python. Il faut le convertir en JSON lisible par le LLM via `dataclasses.asdict()` + sérialisation `date` → `str`.

---

## 8. Modèle LLM

| Paramètre | Valeur |
|-----------|--------|
| Provider | Anthropic |
| Modèle | `claude-sonnet-4-5` |
| Max tokens | 4 096 |
| Temperature | 0 (déterministe) |
| Fallback | `claude-haiku-4-5` si latence > 10s |
| Auth | `ANTHROPIC_API_KEY` via `.env` |

**Pourquoi `claude-sonnet-4-5` ?**
- Supporte nativement `tool_use` avec appels parallèles
- Qualité suffisante pour le raisonnement métier ordonnancement
- Latence acceptable pour un usage CLI (~3-8s par tour)

---

## 9. Critères d'acceptation

| ID | Critère | Mesure |
|----|---------|--------|
| CA-1 | L'agent répond en < 15s pour les questions simples (1 tool) | Chronométrage |
| CA-2 | L'agent utilise le bon tool sans guide explicite pour les 5 UC cibles | Test manuel |
| CA-3 | Les réponses citent des numéros d'OF et codes postes réels | Review |
| CA-4 | L'agent enchaîne 2+ tools sans intervention pour les UC-2 et UC-3 | Test manuel |
| CA-5 | Aucune hallucination sur les données (OFs, stocks, dates) | Vérification croisée CSV |
| CA-6 | Tourne sans erreur sur les données réelles du jour | Smoke test quotidien |

---

## 10. Contraintes et non-objectifs

### Contraintes
- Données en lecture seule — l'agent ne modifie aucun fichier CSV ni aucune donnée Sage X3
- Pas d'accès internet — toutes les données viennent du `DataLoader` local
- Pas de persistance de session — chaque `chat()` est indépendant (pas de mémoire conversationnelle entre redémarrages)
- Langue : français uniquement dans les réponses

### Non-objectifs (v1)
- Interface web / chat UI
- Intégration directe avec Sage X3 API
- Persistance de l'historique de conversation
- Modification automatique des OFs (affermissement automatique)
- Multi-utilisateurs simultanés
- Mode temps réel (streaming)

---

## 11. Estimations de coût API

Pour un usage quotidien de l'ordonnanceur (estimation 20 questions/jour) :

| Scénario | Tokens/question | Coût/question | Coût/mois |
|----------|----------------|---------------|-----------|
| Simple (1 tool) | ~3 000 | ~$0.003 | ~$2 |
| Complexe (3 tools) | ~8 000 | ~$0.008 | ~$5 |
| Briefing complet | ~12 000 | ~$0.012 | ~$7 |

**Estimation totale : $5–15/mois** avec `claude-sonnet-4-5`.

---

## 12. Plan d'implémentation

| Étape | Tâche | Priorité |
|-------|-------|----------|
| 1 | `SuperAgentTools` — sérialisation des 8 tools en format Anthropic | Haute |
| 2 | `SuperAgent` — agentic loop (chat + execute_tools) | Haute |
| 3 | `SuperAgentPrompt` — system prompt + formatage JSON → texte lisible | Haute |
| 4 | Intégration dans `menu.py` (mode REPL) | Haute |
| 5 | Tests d'intégration sur les 5 UC cibles | Haute |
| 6 | Streaming des réponses (affichage progressif) | Basse |
| 7 | Persistance historique de session (fichier JSONL) | Basse |

---

## Annexe A — Données disponibles au runtime

Toutes les données sont chargées en mémoire au démarrage via `DataLoader("data")` :

| Source | Taille | Contenu |
|--------|--------|---------|
| `of_entetes.csv` | 15 285 OF | Statut, article, dates, quantités |
| `nomenclatures.csv` | 25 028 lignes | Relations parent → composant |
| `stock.csv` | 6 833 articles | Stock physique, alloué, bloqué |
| `receptions_oa.csv` | 1 805 lignes | Réceptions fournisseurs attendues |
| `commandes_clients.csv` | 835 commandes | Besoins clients MTS/NOR/MTO |
| `gammes.csv` | 2 954 lignes | Postes de charge + cadences |
| `articles.csv` | 6 910 articles | Type ACHAT/FABRICATION, délais |

**Temps de chargement** : ~2s au démarrage. Les tools interrogent le DataLoader déjà en mémoire (< 50ms par appel).

---

## Annexe B — Diagramme de séquence (UC-2)

```
Ordonnanceur          SuperAgent             LLM (Claude)           Tools
     │                    │                       │                    │
     │ "Puis-je affermir  │                       │                    │
     │  F426-08419 ?"     │                       │                    │
     │───────────────────>│                       │                    │
     │                    │ messages.create()     │                    │
     │                    │──────────────────────>│                    │
     │                    │                       │ [think]            │
     │                    │                       │ tool_use:          │
     │                    │<──────────────────────│ get_rescheduling.. │
     │                    │                       │ simulate_schedule..│
     │                    │ execute_tools()       │                    │
     │                    │──────────────────────────────────────────>│
     │                    │<─────────────────────────────────────────-│
     │                    │ messages.create()     │                    │
     │                    │──────────────────────>│                    │
     │                    │                       │ [synthèse]         │
     │                    │<──────────────────────│                    │
     │ "OF F426-08419 :   │                       │                    │
     │  REPORTER.         │                       │                    │
     │  Composant A4168   │                       │                    │
     │  en rupture (70u   │                       │                    │
     │  dispo / 200u      │                       │                    │
     │  besoin). Réception│                       │                    │
     │  prévue 26/03."    │                       │                    │
     │<───────────────────│                       │                    │
```
