# Mémoire Projet — `supply-chain-board` / `planning-engine`

> Cette mémoire est la référence vivante du projet. Mise à jour automatiquement ou manuellement après chaque session de travail.

---

## 1. Identity — Ce qu'est vraiment ce projet

**Nom usuel** : `planning-engine`  
**Codename interne** : Ordo v2  
**Répertoire** : `apps/planning-engine/`  
**Mission** : **Vérifier la faisabilité des ordres de fabrication (OF)** et **générer des plannings de production** pour un site manufacturier.

Ce n'est **PAS** un MRP classique. C'est un **moteur d'aide à la décision** pour l'ordonnanceur Sage X3 :
- L'ERP est la source de vérité (extractions CSV).
- Le moteur **propose** (matching, faisabilité, planning).
- L'ordonnanceur **valide** et saisit manuellement dans Sage X3.

---

## 2. Architecture — Ce qu'on lit dans le code

### 2.1 Structure des modules

```
planning_engine/
├── models/              # Data classes métier (pas de logique)
│   ├── article.py       # Article (ACHAT/FABRICATION, délai, catégorie)
│   ├── of.py            # OF (num_of, article, statut, date_fin, qte_restante)
│   ├── stock.py         # Stock (physique, alloué, bloqué)
│   ├── besoin_client.py # BesoinClient (MTS/NOR/MTO, COMMANDE/PRÉVISION)
│   ├── nomenclature.py  # Nomenclature (parent → composants)
│   ├── gamme.py         # Gamme (poste, cadence u/h)
│   └── reception.py     # Réception fournisseur
│
├── loaders/
│   ├── data_loader.py   # Charge TOUS les CSV depuis ORDO_EXTRACTIONS_DIR
│   └── csv_loader.py    # Parsing CSV → modèles
│
├── feasibility/         # ⭐ Cœur métier : vérification composants
│   ├── recursive.py     # Vérification BOM récursive (514 lignes)
│   ├── immediate.py     # Mode immédiat : stock physique seul
│   ├── projected.py     # Mode projeté : stock + réceptions ≤ date_besoin
│   ├── feasibility_service.py  # UC3: check() / promise_date() / reschedule()
│   └── analyse_rupture.py       # Analyse détaillée des ruptures
│
├── orders/              # ⭐ Cœur métier : matching commandes ↔ OF
│   ├── matching.py      # Algorithme de matching (602 lignes)
│   ├── allocation.py    # StockState + AllocationManager (367 lignes)
│   └── forecast_consumption.py # COMMANDE consomme PRÉVISION
│
├── planning/           # Configuration opérationnelle
│   ├── charge_calculator.py  # Calcul charge par poste (367 lignes)
│   ├── calendar_config.py   # Jours ouvrés + jours fériés FR
│   ├── capacity_config.py    # Capacité par poste (1×8/2×8/3×8)
│   ├── weights.py           # Pondération KPIs
│   └── holidays.py          # API Nager.Date + cache local
│
├── scheduling/         # ⭐ Pipeline complet d'ordonnancement
│   ├── engine.py           # run_schedule() — 970 lignes, orchestrateur principal
│   ├── lines.py             # GenericLineScheduler — planification par ligne
│   ├── heuristics.py        # 12 critères de tri des OF
│   ├── material.py          # État matière (comfortable/tight/blocked)
│   ├── reporting.py         # Génération des CSV de sortie
│   └── models.py            # CandidateOF, DaySchedule, SchedulerResult
│
├── availability/        # Calcul dates de disponibilité composants
│   └── kernel.py
│
├── services/           # Services вспомогательные
│   ├── stock_history_analyzer.py
│   ├── x3_client.py
│   └── x3_parser.py
│
├── api/
│   └── server.py       # FastAPI — endpoints HTTP
│
├── app/
│   └── gui_service.py  # Service GUI interne
│
├── domain_rules.py     # ⭐ RÈGLES MÉTIER CENTRALISÉES
│                        # is_firm_of_status, is_purchase_article,
│                        # should_include_besoin_for_scheduler,
│                        # order_priority_key
│
└── main.py             # CLI entry point (parse args → lance le bon mode)
```

### 2.2 Les données (ce qu'on charge)

**Source** : `ORDO_EXTRACTIONS_DIR` → 8 fichiers CSV exportés de Sage X3

| Fichier | Ce qu'il contient |
|---------|-------------------|
| `Articles.csv` | Catalogue : ARTICLE, TYPE_APPRO, CATEGORIE, DELAI_REAPPRO |
| `Ordres de fabrication.csv` | OF : NUM_OF, ARTICLE, STATUT (F/P/S), DATE_FIN, QTE_RESTANTE, NUM_ORDRE_ORIGINE |
| `Besoins Clients.csv` | **Uniﬁé** : commandes + prévisions, NUM_ORDRE, TYPE_COMMANDE (MTS/NOR/MTO), SOURCE_ORIGINE_BESOIN (VENT*→COMMANDE, sinon PRÉVISION), OF_CONTREMARQUE |
| `Nomenclatures.csv` | Arbre BOM : ARTICLE_PARENT → ARTICLE_COMPOSANT, NIVEAU, TYPE_ARTICLE |
| `Gammes.csv` | Gammes : ARTICLE → POSTE_CHARGE, CADENCE (u/h) |
| `Stocks.csv` | STOCK_PHYSIQUE, STOCK_ALLOUE, STOCK_BLOQUE |
| `Commandes Achats.csv` | Réceptions : ARTICLE, QUANTITE_RESTANTE, DATE_RECEPTION_PREVUE |
| `Allocations.csv` | Traçabilité allocations : ARTICLE, QTE_ALLOUEE, NUM_DOC |

**Couverture nomenclature** : 2 501 articles / 2 964 FABRICATION = **84%**. Les 16% restants → alerte ALERTE.

---

## 3. Les 3 axiomes métier

Ce sont les seules règles qui structurent **tout** le reste :

### Axiome 1 — MTS ≠ NOR/MTO
```
MTS : OF_CONTREMARQUE ≠ null  → lien direct OF↔besoin  → allocation AUTO
NOR/MTO : pas de lien        → allocation MANUELLE   → CBN/MRP génère WOS
```

### Axiome 2 — COMMANDE consomme PRÉVISION
```
prévision_nette = max(0, prévisions − commandes)  par article
```
→ Évite le double-comptage de la charge (93% des besoins sont prévisionnels).

### Axiome 3 — Stock net = physique − alloué − bloqué
```
stock_disponible = STOCK_PHYSIQUE − STOCK_ALLOUE − STOCK_BLOQUE
```
→ Le bloqué (CQ) est temporairement indisponible mais potentiellement libérable.

---

## 4. Les 4 algorithmes centraux

### 4.1 Matching besoin → OF (`orders/matching.py`)

**Priorité décroissante** :
1. **Pegging dur** : `OF.NUM_ORDRE_ORIGINE == besoin.NUM_ORDRE` + méthode = "Ordre de fabrication"
2. **Contre-marque MTS** : `besoin.OF_CONTREMARQUE` → OF
3. **NOR/MTO** : allocation stock virtuel → besoin net → chercher OF (ferme > planifié > suggéré)

**Sorties** : `COUVERT_STOCK`, `COUVERT_OF_AFFERMI`, `COUVERT_OF_SUGGERE`, `COUVERT_OF_MIXTE`, `PARTIEL`, `NON_COUVERT`, `BESOIN_APPRO`

### 4.2 Vérification de faisabilité récursive (`feasibility/recursive.py`)

```
Pour chaque OF à vérifier :
  Pour chaque composant de la nomenclature :
    Si ACHAT : vérifier stock net (ou + réceptions si mode projeté)
    Si FABRICATION : récursion (MAX_DEPTH = 10)
  Résultat : FEASIBLE / NOT_FEASIBLE / DEFERRED / SKIPPED
```

**Modes** :
- `immediat` : stock physique seul
- `projete` : stock + réceptions dont date ≤ date_fin OF

**Cas particuliers gérés** :
- Articles fantômes (`AFANT`) → résolution via variantes réelles
- Sous-traitance (`ST*`) → traité comme ACHAT (terminal de récursion)

### 4.3 Allocation virtuelle (`orders/allocation.py`)

**Problème** : plusieurs OF concourent sur le même composant.

**Règles** :
1. OF avec date fin la plus proche prioritaire
2. Override : un OF 100% faisable passe avant un OF prioritaire mais non faisable

**Objectif** : maximiser le nombre d'OF complètement servis (pas FIFO strict).

### 4.4 Pipeline scheduling (`scheduling/engine.py`)

**9 étapes** :
1. Chargement poids (`config/weights.json`)
2. Construction calendrier ouvré (jours fériés FR via Nager.Date + cache)
3. Sélection candidats via matching
4. Capacité dynamique : `target_h / active_days × 1,10` plafonnée à 14h/j
5. Pré-affectation `target_day` (profil historique → jour de pic)
6. **Gel du jour courant** si l'heure > `freeze_threshold_hour` (12h)
7. **Boucle journalière** : réceptions du jour → buffers BDH → planification ligne par ligne
8. Calcul KPIs
9. Écriture CSV de sortie

**Heuristique de tri à 12 critères** (`heuristics.py`) :
```
0. priority        : 0=BDH en rupture, 1=normal, 2=BDH OK
1. due_urgency     : retard / J+1 / J+2 / non urgent
2. jit_bonus       : -2 si dû exactement aujourd'hui
3. prematurity     : pénalise la production en avance
4. target_day_delta: distance au jour cible (lissage spatial)
5. due_date        : date exacte
6. -charge_hours   : gros OF d'abord à urgence égale
7. serie_bonus     : même article=-2, BOM partagée=-0,5
8. mix_penalty     : famille sur-représentée
9. kanban_penalty  : conso_kanban / 50
10-11. tiebreakers : article, num_of
```

---

## 5. Fichiers de configuration

| Fichier | Rôle |
|---------|------|
| `config/weights.json` | `w1=0.85` (service), `w2=0.10` (ouverture), `w3=0.05` (dev), `freeze_threshold_hour=12.0` |
| `config/capacity.json` | Capacité par poste : `default_hours`, `shift_pattern` (1×8/2×8/3×8), `daily_overrides`, `weekly_overrides` |
| `config/calendar.json` | Jours ouvrés, jours off manuels |
| `config/holidays_2026.json` | Jours fériés FR (Nager.Date, cache) |
| `config/lines.json` | Lignes target : `PP_830` (assemblage 1), `PP_153` (assemblage 2) |

**Sorties** (`outputs/`) :
- `planning_<line>.csv` — OF planifiés par ligne
- `lignes_commande_statut.csv` — statut par commande
- `ofs_non_faisables.csv` — OF bloqués
- `stock_BDH_projete.csv` — projection buffers BDH
- `alertes.txt` — alertes
- `kpis.json` — KPIs bruts

---

## 6. KPI métier

| KPI | Formule | Sens |
|-----|---------|------|
| `taux_service` | 1 − (OF en retard / total) | Promesse client |
| `taux_ouverture` | heures planifiées / capacité dispo | Utilisation atelier |
| `nb_deviations` | OF avec deviations > 0 | Sauts d'OF |
| `nb_jit` | OF planifiés exactement à due_date | Performance JIT |
| `nb_changements_serie` | Changements de série | Coût setup |
| `score` | `w1·service + w2·ouverture − w3·dev` | Boussole optimisation |

---

## 7. Lignes de production

**Actives** (config/lines.json) : `PP_830`, `PP_153`  
**Postes de charge** (config/capacity.json) : `PP_001` à `PP_XXX` (nomenclature PP_*)

**Capacité par shift** :
- 1×8 → 40 h/sem
- 2×8 → 80 h/sem
- 3×8 → 120 h/sem

**Statuts poste** : `OK ≤ 80%`, `TENSION ≤ 100%`, `GOULOT > 100%` du 2×8

---

## 8. Clients et commandes

| Client | Code | Type | Volume |
|--------|------|------|--------|
| ALDES | 80001 | MTS (FLAG 5) + MTO (FLAG 1) | 41% |
| AERECO | — | NOR | Stratégique |
| PARTN-AIR | — | NOR | Stratégique |
| 11 autres | — | NOR/MTO | Standard |

**Mix mesuré** : MTS 34%, NOR 45%, MTO 21%  
**Nature** : COMMANDE 7%, PRÉVISION 93%

---

## 9. API FastAPI (`planning_engine/api/server.py`)

**Démarrage** :
```bash
uvicorn planning_engine.api.server:app --reload --port 8000
```

**Endpoints principaux** :
```
GET  /health
POST /data/load
POST /runs/schedule
GET  /runs/{run_id}
GET  /reports/actions/latest
GET  /api/v1/calendar/{year}/{month}
PUT  /api/v1/calendar/manual-off
GET  /api/v1/capacity
PUT  /api/v1/capacity/poste
PUT  /api/v1/capacity/override
```

---

## 10. CLI — Commandes de base (`planning_engine/main.py`)

```bash
# Vérification rapide d'un OF
python -m planning_engine.main --of F426-08419

# Vérification d'une commande
python -m planning_engine.main --commande AR2600885

# Heatmap de charge
python -m planning_engine.main --charge-heatmap --num-weeks 4

# Lancer le scheduler complet
python -m planning_engine.main --schedule --reference-date 2026-04-25

# Avec composant immédiat (sans projections)
python -m planning_engine.main --schedule --immediate-components
```

---

## 11. Faiblesses connues (ce qu'il faut surveiller)

| Problème | Risque | Impact |
|----------|--------|--------|
| **16% articles FABRICATION sans nomenclature** | Décisions à l'aveugle | Alertes ALERTE mais pas de vérification |
| **Mutation in-place `OF.qte_restante`** | Non thread-safe, exceptions silencieuses | AllocationManager restaure manuellement |
| **Double déﬁnition constantes** | BUFFER_THRESHOLDS, SETUP_TIME_HOURS, poids dupliqués | Drift silencieux entre modules |
| **`stock_bloque` traitement incohérent** | `Stock.disponible()` ≠ `eol_residuals.py` | Incohérence de calcul |
| **Horizon scheduler 5j** vs **WORKING_DAYS_DEFAULT=15** | Décalage outil/rituel (charge S+1→S+3) | Réunion de charge hors horizon |
| **`action_report.py` 1449 lignes** | Maintenabilité dégradée | Mélange agrégation + présentation |
| **`erp_data_access` comme dépendance externe** | Les vrais modèles (Article, OF, Stock) viennent d'un package installé | Incomplet dans le codebase local |

---

## 12. Rituels supportés

| Rituel | Trigger | Horizon | Module |
|--------|---------|---------|--------|
| Réunion de charge | Mardi | S+1→S+3 | `planning/charge_calculator.py` |
| Affermissement | En semaine | S+1 | `feasibility/recursive.py` |
| Matching commandes↔OF | Continu | S+1→S+3 | `orders/matching.py` |

---

## 13. Tests

```bash
pytest                              # Tous les tests
pytest tests/test_recursive_checker.py
pytest tests/test_allocation_manager.py
pytest tests/test_matching.py
```

---

## 14. Glossaire du projet

| Terme | Signification |
|-------|---------------|
| **OF** | Ordre de Fabrication |
| **WOP** | Work Order Planned — OF Ferme (statut F/1) |
| **WOS** | Work Order Suggested — OF Suggéré (statut S/3) |
| **BDH** | Buffer De fabrication Hier — stocks tampons suivis en projection |
| **CBN/MRP** | Calcul des Besoins Nets |
| **Contre-marque** | Lien MTS `OF_CONTREMARQUE` → `NUM_OF` |
| **Pegging dur** | Matching via `NUM_ORDRE_ORIGINE` |
| **JIT** | Just-In-Time — produire au plus près de la date d'expédition |
| **S+1, S+2...** | Semaine(s) après la semaine en cours |
| **Kanban imbalance** | Écart de consommation entre feeders |
| **FeasibilityService** | UC3 : `check()`, `promise_date()`, `reschedule()` |
| **SchedulerResult** | Résultat complet du pipeline (plannings + KPIs) |
| **StockState** | État virtuel partagé du stock pendant l'allocation |
| **SoftRule** | Scoring multi-critères (completion 50%, client 30%, urgency 20%) |

---

## 15. Commandes pour démarrer rapidement

```bash
# 1. Vérifier qu'Ordo a les données
ls $ORDO_EXTRACTIONS_DIR

# 2. Lancer l'API
uvicorn planning_engine.api.server:app --reload --port 8000

# 3. Schedule via API
curl -X POST http://127.0.0.1:8000/runs/schedule

# 4. Ou directement en CLI
python -m planning_engine.main --schedule --reference-date 2026-04-25

# 5. Voir les sorties
ls outputs/
cat outputs/kpis.json
```

---

*Dernière mise à jour : 2026-04-25*
