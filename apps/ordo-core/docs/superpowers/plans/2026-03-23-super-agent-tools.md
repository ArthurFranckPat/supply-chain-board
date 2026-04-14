# Plan : Outils Super-Agent Ordonnanceur

Date : 2026-03-23
Branche : `feature/super-agent-tools`
Status : **IMPLEMENTÉ** — 9/9 outils, 70 tests

---

## Contexte

L'agent actuel couvre bien la **préparation de la réunion du mardi** (charge S+1→S+3, faisabilité, organisation atelier). Il manquait tout ce qui est **gestion du quotidien** : séquencement, aléas, KPIs, réordonnancement.

Ce plan implémente **9 outils** répartis en 3 priorités.

---

## Priorité 1 — Quotidien de l'ordonnanceur (critique)

### Outil 1 : `get_rescheduling_messages` ✅

**Fichier** : `src/agents/tools/rescheduling_messages.py`

**Quoi** : Détecte les OFs qui nécessitent un réordonnancement (analogue aux messages X3).

**Logique** :
- OF dont `date_fin` est dans le passé → message "EN RETARD, rejalonner"
- OF suggéré (statut=3) dont un composant a réception imminente (<3j) → message "DÉBLOCAGE possible"
- OF suggéré avec date commande associée < 5 jours → message "URGENCE : affermir"
- OF affermi (statut=1) dont date fin < date commande - 2j → message "RETARD IMMINENT"

**Fix appliqué** (2026-03-24) :
- Ajout `max_retard_days=90` pour filtrer les OFs "zombies" (OFs non fermés depuis 1000+ jours dans Sage X3)

**Output** :
```python
@dataclass
class ReschedulingMessage:
    num_of: str
    article: str
    type: Literal["RETARD", "DEBLOCAGE", "URGENCE", "RETARD_IMMINENT"]
    message: str
    action_recommandee: str
    priorite: int  # 1=critique, 2=important, 3=info
```

**Tests** : 8 tests — ✅ passent

---

### Outil 2 : `check_late_receptions_impact` ✅

**Fichier** : `src/agents/tools/late_receptions.py`

**Quoi** : Identifie les réceptions fournisseurs en retard et liste les OFs bloqués en conséquence.

**Logique** :
- Réceptions dont `date_reception_prevue` < aujourd'hui et `quantite_restante` > 0
- Pour chaque réception : trouver les OFs qui ont besoin de cet article (via nomenclatures)
- Propagation du retard aux commandes client liées

**Fix appliqué** (2026-03-24) :
- Ajout `max_retard_days=90` pour exclure les réceptions "fantômes" (16 ans de retard dans les données)

**Output** :
```python
@dataclass
class LateReceptionImpact:
    article: str
    fournisseur: str
    date_prevue: date
    jours_retard: int
    qte_attendue: float
    ofs_bloques: List[str]
    commandes_impactees: List[str]
    niveau_risque: Literal["CRITIQUE", "ELEVE", "MOYEN"]
```

**Tests** : 8 tests — ✅ passent

---

### Outil 3 : `detect_bottlenecks` ✅

**Fichier** : `src/agents/tools/bottleneck_detector.py`

**Quoi** : Identifie automatiquement les postes en saturation à partir de la heatmap de charge.

**Logique** :
- Calculer la charge hebdomadaire via `calculate_weekly_charge_heatmap`
- Seuils : >100% = SATURÉ, 85-100% = TENSION, <60% = SOUS-CHARGE
- Identifier les OFs les plus contributeurs à la surcharge

**Output** :
```python
@dataclass
class BottleneckAlert:
    poste: str
    libelle: str
    semaine: str
    charge_heures: float
    capacite_heures: float
    taux_charge: float
    statut: Literal["SATURE", "TENSION", "NORMAL", "SOUS_CHARGE"]
    top_ofs: List[str]
    suggestion: str
```

**Tests** : 7 tests — ✅ passent

---

## Priorité 2 — Valeur ajoutée forte

### Outil 4 : `simulate_schedule_impact` ✅

**Fichier** : `src/agents/tools/schedule_simulator.py`

**Quoi** : Simule l'ajout d'OFs sur la charge hebdomadaire sans modifier l'état réel.

**Logique** :
- Baseline = heatmap actuelle
- Calculer charge des OFs à simuler via `calculate_article_charge`
- Retourner delta et goulots créés/résolus

**Output** :
```python
@dataclass
class SimulationResult:
    baseline: Dict[str, Dict[str, float]]
    simulated: Dict[str, Dict[str, float]]
    delta: Dict[str, Dict[str, float]]
    ofs_added: List[str]
    bottlenecks_created: List[str]
    bottlenecks_resolved: List[str]
    recommendation: str
```

**Tests** : 5 tests — ✅ passent

---

### Outil 5 : `sequence_ofs_for_poste` ✅

**Fichier** : `src/agents/tools/of_sequencer.py`

**Quoi** : Pour un poste donné, séquence les OFs faisables selon EDD/FIFO/SPT.

**Logique** :
- Récupérer OFs dont la gamme inclut ce poste
- Filtrer les faisables via `RecursiveChecker`
- Trier par EDD (Earliest Due Date), FIFO, ou SPT

**Output** :
```python
@dataclass
class OFSequence:
    poste: str
    regle: Literal["EDD", "FIFO", "SPT"]
    sequence: List[SequencedOF]
    charge_totale_heures: float
    premier_retard_prevu: Optional[date]

@dataclass
class SequencedOF:
    num_of: str
    article: str
    rang: int
    heures_sur_poste: float
    date_fin_prevue: date
    commande: Optional[str]
    en_retard: bool
```

**Tests** : 6 tests — ✅ passent

---

### Outil 6 : `get_service_rate_kpis` ✅

**Fichier** : `src/agents/tools/service_rate_kpis.py`

**Quoi** : Calcule les KPIs de taux de service à partir des commandes clients.

**Logique** :
- **Taux de service global** : commandes avec `qte_restante == 0` / total
- **Taux par client** : idem ventilé par CODE_CLIENT
- **Retards** : commandes où DATE_EXPEDITION_DEMANDEE < aujourd'hui et QTE_RESTANTE > 0
- **Utilisation postes** : charge / capacité nominale (S+1)

**Fix appliqué** (2026-03-24) :
- Correction : `nb_servies` utilise `qte_restante == 0` (commande soldée) au lieu de `qte_allouee >= qte_commandee`
- Raison : dans Sage X3 NOR/MTO, `qte_allouee` est rarement renseignée (allocation manuelle)

**Output** :
```python
@dataclass
class ServiceRateKPIs:
    taux_service_global: float
    taux_service_par_client: Dict[str, float]
    commandes_en_retard: int
    commandes_en_retard_details: List[str]
    utilisation_postes: Dict[str, float]
    ofs_affermis_en_cours: int
    ofs_bloques: int
    ofs_en_retard: int
    date_calcul: date
```

**Tests** : 6 tests — ✅ passent

---

## Priorité 3 — Bonus

### Outil 7 : `get_competing_ofs_for_component` ✅

**Fichier** : `src/agents/tools/component_competition.py`

**Quoi** : Pour un article composant, liste tous les OFs qui en ont besoin (conflits de stock).

**Logique** :
- Parcourir nomenclatures des OFs actifs
- Trouver ceux qui consomment l'article cible
- Calculer stock disponible vs besoin cumulé

**Output** :
```python
@dataclass
class ComponentCompetition:
    article_composant: str
    stock_disponible: float
    besoin_total: float
    deficit: float
    ofs_concurrents: List[CompetingOF]

@dataclass
class CompetingOF:
    num_of: str
    article_parent: str
    qte_besoin: float
    date_besoin: date
    statut: int
    priorite_relative: int
```

**Tests** : 7 tests — ✅ passent

---

### Outil 8 : `summarize_week_status` ✅

**Fichier** : `src/agents/tools/week_summary.py`

**Quoi** : Agrège tous les signaux de la semaine en un briefing structuré.

**Logique** : Appelle en cascade les outils 1, 2, 3, 6 et synthétise en texte.

**Output** : Objet `WeekSummary` structuré + texte synthétique pour le LLM.

**Tests** : 6 tests — ✅ passent

---

## Priorité 4 — Prescription (nouveau)

### Outil 9 : `suggest_ofs_to_affirm` ✅

**Fichier** : `src/agents/tools/of_affirm_suggester.py`

**Quoi** : Propose les OFs à affermir en priorité pour maximiser le taux de service.

**Logique** :
1. **Candidats** : OFs planifiés (statut=2) + suggérés (statut=3)
2. **Règle canal FR** :
   - Exclure WOS liés à prévisions FR directes
   - Inclure WOS liés à commandes fermes FR
   - Inclure WOS pour articles utilisés comme composants
3. **Faisabilité** : `RecursiveChecker` sur les top candidats
4. **Optimisation** : Greedy knapsack dans la capacité disponible par poste

**Output** :
```python
@dataclass
class OFAffirmSuggestion:
    num_of: str
    article: str
    description: str
    date_fin: date
    qte_restante: float
    faisable: bool
    raison_infaisabilite: Optional[str]
    commandes_couvertes: List[str]
    nb_commandes_urgentes: int
    jours_avant_echeance: int
    charge_par_poste: Dict[str, float]
    score_priorite: float

@dataclass
class AffirmationPlan:
    ofs_recommandes: List[OFAffirmSuggestion]
    ofs_infaisables: List[OFAffirmSuggestion]
    ofs_hors_capacite: List[OFAffirmSuggestion]
    charge_additionnelle: Dict[str, float]
    capacite_consommee: Dict[str, float]
    nb_commandes_couvertes: int
    nb_candidates: int
    texte_recommandation: str
```

**Résultats sur données réelles** (S+1, 100 candidats) :
- 248 OFs candidats analysés
- 30 OFs recommandés → couvrent 45 commandes
- 16 OFs bloqués (composants manquants)
- 4 OFs hors capacité

**Exemple** :
```
PLAN D'AFFERMISSEMENT — 23/03/2026

30 OF(s) à affermir :
  • SGAE10625162536 (BDH2251AL) — 2026-03-23 → 4 commande(s) (2 urgente(s))
  • SGAE10625162537 (BDH2251AL) — 2026-03-23 → 4 commande(s) (2 urgente(s))
  ...
Charge additionnelle : PP_145: 35.0h, PP_148: 24.3h, PP_153: 20.4h
```

**Tests** : 12 tests — ✅ passent

---

## Structure des fichiers

```
src/agents/tools/
├── __init__.py
├── rescheduling_messages.py    # Outil 1
├── late_receptions.py          # Outil 2
├── bottleneck_detector.py      # Outil 3
├── schedule_simulator.py       # Outil 4
├── of_sequencer.py             # Outil 5
├── service_rate_kpis.py        # Outil 6
├── component_competition.py    # Outil 7
├── week_summary.py             # Outil 8
└── of_affirm_suggester.py      # Outil 9 (nouveau)

tests/agents/tools/
├── conftest.py
├── test_rescheduling_messages.py    # 8 tests
├── test_late_receptions.py          # 8 tests
├── test_bottleneck_detector.py      # 7 tests
├── test_schedule_simulator.py       # 5 tests
├── test_of_sequencer.py             # 6 tests
├── test_service_rate_kpis.py        # 6 tests
├── test_component_competition.py    # 7 tests
├── test_week_summary.py             # 6 tests
└── test_of_affirm_suggester.py      # 12 tests (nouveau)
                                     ─────────
                                     70 tests total
```

---

## Historique d'implémentation

| Date | Action | Status |
|------|--------|--------|
| 2026-03-23 | Implémentation outils 1-8 | ✅ |
| 2026-03-23 | Tests unitaires 8×8=64 | ✅ |
| 2026-03-24 | Fix Tool 1 : `max_retard_days=90` | ✅ |
| 2026-03-24 | Fix Tool 2 : `max_retard_days=90` | ✅ |
| 2026-03-24 | Fix Tool 6 : `qte_restante == 0` | ✅ |
| 2026-03-24 | Implémentation Tool 9 | ✅ |
| 2026-03-24 | Tests Tool 9 (12) | ✅ |
| 2026-03-24 | Validation sur données réelles | ✅ |

---

## Capacités de l'agent conversationnel

**Questions que l'agent peut maintenant répondre** :

| Question | Outils utilisés |
|----------|-----------------|
| "Qu'est-ce qui bloque la production ce matin ?" | 1, 2, 3 |
| "Quels OFs dois-je affermir cette semaine ?" | 9 |
| "Dans quel ordre traiter PP_830 ?" | 5 |
| "Si j'afferme ces 3 OFs, ça charge quels postes ?" | 4 |
| "Pourquoi manque-t-il du composant X ?" | 7 |
| "Quel est le taux de service S+1 ?" | 6 |
| "Résume la situation de la semaine" | 8 |

**Architecture Tool-Use** :
- Chaque outil = fonction pure (DataLoader → données structurées)
- Le LLM orchestre les appels selon la question
- Possibilité de chaînage : outil 9 utilise internement le matching OF→besoin
