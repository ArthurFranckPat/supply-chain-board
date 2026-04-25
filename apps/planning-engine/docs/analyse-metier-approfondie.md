# Analyse métier approfondie — `planning-engine`

> Analyse de référence consolidée. Sert de contexte partagé pour les agents et les contributeurs humains.
> Source : revue de code complète (avril 2026) — `apps/planning-engine/`.

---

## 1. Mission et positionnement métier

`planning-engine` (codename interne **Ordo v2**) est un **système d'aide à la décision** pour l'ordonnancement de production manufacturière. Il s'inscrit dans un site industriel produisant des produits **BDH** (lignes principales `PP_830` et `PP_153`), et n'écrit **jamais** dans l'ERP Sage X3 : il propose, l'ordonnanceur valide et saisit. C'est un **moteur de propositions**, pas un système de pilotage transactionnel.

Il couvre trois rituels hebdomadaires de l'ordonnanceur :

| Rituel | Fréquence | Objectif | Horizon |
|---|---|---|---|
| **Réunion de charge** | Mardi | Décider l'organisation atelier (1×8 / 2×8 / 3×8) | S+1 → S+3 |
| **Affermissement** | En semaine | Valider quels OF lancer (WOS → WOP) | S+1 |
| **Matching commandes ↔ OF** | Continu | Garantir qu'une commande NOR/MTO est couverte | S+1 → S+3 |

## 2. Modèle métier central

```
                        ┌─────────────┐
                        │  ARTICLE    │  ACHAT vs FABRICATION
                        └──────┬──────┘  + délai réappro
            ┌──────────────────┼──────────────────────────┐
            ▼                  ▼                          ▼
     ┌───────────────┐  ┌──────────────┐         ┌─────────────────┐
     │ NOMENCLATURE  │  │   GAMME      │         │  STOCK          │
     │ (BOM récursive│  │ (poste +     │         │ physique−alloué │
     │  84% couvert) │  │  cadence)    │         │ −bloqué         │
     └───────────────┘  └──────────────┘         └─────────────────┘
            ▲                  ▲                          ▲
            │                  │                          │
     ┌──────┴────────┐   ┌─────┴────────┐         ┌───────┴────────┐
     │ OF (WOP/WOS)  │   │ BESOIN_CLIENT│         │ RÉCEPTIONS_OA  │
     │ Ferme/Suggéré │   │ MTS/NOR/MTO  │         │ (PO fournisseurs)
     │ NUM_ORDRE_    │◄──┤ COMMANDE vs  │         └────────────────┘
     │  ORIGINE      │   │ PRÉVISION    │
     └───────────────┘   └──────────────┘
```

Trois axiomes structurent toute la logique :

1. **Distinction MTS vs NOR/MTO** : MTS = couplage fort (`OF_CONTREMARQUE`, allocation auto), NOR/MTO = couplage faible (allocation manuelle, regroupement CBN).
2. **COMMANDE consomme PRÉVISION** : `prévision_nette = max(0, prév − cmd)` par article, évite la double-comptabilisation de la charge (≈ 93 % des besoins sont prévisionnels).
3. **Stock disponible net** = `physique − alloué − bloqué` (le bloqué = CQ en cours, temporairement indisponible mais théoriquement libérable).

## 3. Domaines fonctionnels

### 3.1 Matching commande → OF (`orders/matching.py`)
Trois branches par ordre de priorité :
1. **Pegging fort** : `OF.NUM_ORDRE_ORIGINE == besoin.NUM_ORDRE` + `METHODE_OBTENTION_LIVRAISON == "Ordre de fabrication"`.
2. **Contre-marque MTS** : champ `OF_CONTREMARQUE` du besoin pointe directement un OF.
3. **NOR/MTO** : allocation virtuelle de stock → calcul du besoin net → recherche d'OF (Ferme > Planifié > Suggéré, tri par écart de date puis quantité décroissante) → partage possible via `OFConso`.

**Statuts métier produits** : `COUVERT_STOCK`, `COUVERT_OF_AFFERMI`, `COUVERT_OF_SUGGERE`, `COUVERT_OF_MIXTE`, `PARTIEL`, `NON_COUVERT`, `BESOIN_APPRO`. Taux de service mesuré ≈ 98,2 % sur 656 commandes NOR/MTO.

### 3.2 Faisabilité composants (`feasibility/recursive.py`, 552 lignes)
Vérification **récursive** de la BOM jusqu'aux composants ACHAT, avec deux modes :
- **Immédiat** : stock physique seul.
- **Projeté** : stock + réceptions fournisseurs `≤ date_fin OF`.

Subtilités métier :
- **Articles fantômes** (catégorie `AFANT`) → résolution via leurs variantes réelles, exclusion des fratries pour éviter le double-comptage.
- **Sous-traitance** (catégorie `ST*`) → traitée comme un ACHAT (terminal de la récursion).
- **Profondeur max** : 10 niveaux (`MAX_DEPTH`).
- **16 % d'articles FABRICATION sans nomenclature** → statut ALERTE non bloquant, vérification manuelle requise.

**Règle d'affermissement** : interdit si un composant ACHAT est en rupture ; autorisé si le composant manquant est FABRICATION (un OF de sous-ensemble peut être lancé). Récursive → un composant FABRICATION en rupture remonte la contrainte si ses propres composants ACHAT sont en rupture.

### 3.3 Allocation virtuelle & concurrence composants (`orders/allocation.py`)
`StockState` maintient un stock virtuel partagé. Quand plusieurs OF concourent sur un même composant :
- **Règle 1** : date de fin OF la plus proche prioritaire.
- **Règle 2 (override)** : un OF 100 % faisable passe avant un OF prioritaire mais non faisable.

Objectif métier : **maximiser le nombre d'OF complètement servis**, pas respecter strictement la chronologie. Statuts : `FEASIBLE`, `NOT_FEASIBLE`, `SKIPPED`, `DEFERRED`.

### 3.4 Calcul de charge (`planning/charge_calculator.py`)
Charge récursive : pour un article, on lit la gamme (`heures = qté / cadence` par poste), puis on récurse sur les composants FABRICATION. Sortie : heatmap `charge[poste][semaine]`.

Capacités théoriques :
- 1×8 → 40 h/sem
- 2×8 → 80 h/sem
- 3×8 → 120 h/sem

Statuts poste : OK ≤ 80 % du 2×8, TENSION ≤ 100 %, GOULOT > 100 %. Recommandation auto : > 130 % → 3×8 nécessaire.

### 3.5 Scheduler journalier (`scheduling/engine.py`, `lines.py`)
Pipeline en 9 étapes sur **horizon 5 jours ouvrés** pour les lignes `PP_830` et `PP_153` :

1. Chargement poids (`config/weights.json`)
2. Construction calendrier ouvré (jours fériés FR via API Nager.Date + cache local)
3. Sélection candidats via matching
4. Capacité dynamique : `target_h / active_days × 1,10` plafonnée à 14 h/j
5. Pré-affectation `target_day` (profil historique → jour de pic, sinon round-robin)
6. **Gel du jour courant** si l'heure dépasse `freeze_threshold_hour` (12 h par défaut)
7. **Boucle journalière** : application des réceptions du jour, addition aux buffers BDH, planification ligne par ligne avec `GenericLineScheduler.schedule_day()`
8. Calcul KPIs
9. Écriture des CSV de sortie

**Heuristique de tri à 12 critères** (`heuristics.py`) — clé clé du métier :

| # | Facteur | Logique métier |
|---|---|---|
| 0 | `priority` | 0 = BDH en rupture, 1 = normal, 2 = BDH OK |
| 1 | `due_urgency` | Retard / J+1 / J+2 / non urgent |
| 2 | `jit_bonus` | -2 si dû exactement aujourd'hui |
| 3 | `prematurity` | Pénalise la production en avance |
| 4 | `target_day_delta` | Lissage spatial (distance jour cible) |
| 5 | `due_date` | Date exacte |
| 6 | `-charge_hours` | Gros OF d'abord à urgence égale |
| 7 | `serie_bonus` | Même article = -2, BOM partagée = -0,5 (réduit les changements de série) |
| 8 | `mix_penalty` | Pénalise une famille sur-représentée |
| 9 | `kanban_penalty` | Conso kanban / 50 |
| 10-11 | tiebreakers | article, num_of |

**Règles d'ouverture** : ligne fermée si charge < `min_open_hours` (3-7 h), changement de série = **15 min de setup** (`SETUP_TIME_HOURS = 0,25`), tolérance capacité = +2,5 h.

**Politique JIT** : déférer les OF dus à > J+1 sauf si l'actif < max(7 h, 50 % capacité). Reflète la réalité observée (7/21 OF produits le jour J).

### 3.6 État matière (`scheduling/material.py`)
Disponibilité à 3 niveaux à J-2 / J-1 / J :
- **comfortable** : stock confortable
- **tight** : juste à temps
- **blocked** : composant manquant

Optimisation : ne réserver virtuellement **que** les composants *réellement* en rupture (`stock < besoin`) et **uniquement le besoin net** après déduction des allocations ERP existantes (évite la double-réservation).

Buffers BDH suivis en projection : `BDH2216AL: 673`, `BDH2231AL: 598`, `BDH2251AL: 598`.

### 3.7 Reporting métier (`reports/action_report.py`, 1449 lignes)
Quatre vues complémentaires pour l'ordonnanceur :
1. **Component Actions** : 1 ligne par composant bloquant (qté manquante, OF/commandes impactés, urgence).
2. **Supplier Actions** : 1 ligne par fournisseur/PO retardés.
3. **Poste de charge à risque** : postes risquant l'arrêt.
4. **Kanban à risque** : postes feeders sous seuil de couverture.

Classification d'urgence : `RETARD_FOURNISSEUR > AUCUNE_COUVERTURE > COUVERTURE_TARDIVE > SURVEILLANCE`.

## 4. KPIs métier

| KPI | Formule | Sens métier |
|---|---|---|
| **Taux de service** | 1 − (OF en retard / total) | Promesse client tenue |
| **Taux d'ouverture** | heures planifiées / capacité dispo | Utilisation atelier |
| **nb_deviations** | OF avec deviations > 0 | Sauts d'OF prioritaires non faisables |
| **nb_jit** | OF planifiés exactement à due_date | Performance Just-in-Time |
| **Kanban imbalance** | écart max-min conso / 1000 | Équilibrage feeders |
| **Score global** | `w1·service + w2·ouverture − w3·dev − w4·jit − w5·kanban` | Boussole d'optimisation |

Poids par défaut (auto-normalisés, modifiables via `config/weights.json`) : `w1=0,7` service, `w2=0,2` ouverture, `w3=0,1` déviations.

## 5. Hiérarchie métier des clients & types de commande

| Client | Statut | Type | Volume |
|---|---|---|---|
| **ALDES** (80001) | Prioritaire | MTS + MTO | 41 % |
| **AERECO** | Stratégique | NOR | — |
| **PARTN-AIR** | Stratégique | NOR | — |
| 11 autres | Standard | NOR/MTO | — |

Mix global mesuré : MTS 34 %, NOR 45 %, MTO 21 %. Nature : COMMANDE 7 % / PRÉVISION 93 %.

Niveaux d'urgence (`agents/`) : ≤ 2 j → TRÈS ÉLEVÉE, ≤ 5 j → ÉLEVÉE, ≤ 10 j → NORMALE, > 10 j → FAIBLE.

## 6. Contraintes de la chaîne d'approvisionnement
- **Délai composants > 28 j** vs **commandes clients à 15-21 j** → impossible de déclencher l'appro sur la commande ferme.
- Solution : **appros sur prévisions hebdomadaires**, d'où l'importance du module `forecast_consumption` qui réconcilie les deux flux.

## 7. Surfaces d'intégration

| Surface | Rôle | Format |
|---|---|---|
| **Entrées** | 8 CSV ERP via `ORDO_EXTRACTIONS_DIR` | Articles, Gammes, Nomenclatures, Besoins Clients, OF, Stocks, Commandes Achats, Allocations |
| **API REST** (FastAPI) | GUI locale + intégrations | `/api/v1/runs/schedule`, `/api/v1/calendar/*`, `/api/v1/capacity/*`, `/api/v1/reports/*` |
| **Frontend React** | Console ordonnanceur | Local sur `http://127.0.0.1:8000` |
| **CLI** | Automation / dev | `--schedule`, `--charge-heatmap`, `--s1`, `--commande NUM`, `--of NUM` |
| **Sorties** | Reports déposés dans `outputs/` | `planning_<line>.csv`, `kpis.json`, `lignes_commande_statut.csv`, `ofs_non_faisables.csv`, `stock_BDH_projete.csv`, `alertes.txt` |

## 8. Forces métier
- **Modèle de domaine fidèle** : capture finement la dichotomie MTS/NOR-MTO et la logique de pegging Sage X3.
- **Heuristique riche** : 12 critères couvrent urgence, JIT, lissage, économie de setup, équilibrage kanban — décision qui se rapproche du raisonnement humain de l'ordonnanceur.
- **Vérif récursive complète** avec fantômes, sous-traitance, et 2 horizons (immédiat/projeté).
- **Centralisation des règles** dans `domain_rules.py` (`is_firm_of_status`, `should_include_besoin_for_scheduler`, `order_priority_key`) → cohérence transversale.
- **Consommation des prévisions** : évite la sur-évaluation de charge (problème typique des MRP qui plantent en double-comptant).
- **Concurrence composants** explicite avec règle d'optimalité (max d'OF servis vs FIFO strict).

## 9. Faiblesses & risques métier identifiés

| Zone | Risque métier | Source |
|---|---|---|
| **Couverture BOM 84 %** | 463 articles FABRICATION sans nomenclature → décisions à l'aveugle | `Nomenclatures.csv` |
| **Pipeline scheduler legacy mort** | `kpi.py` non utilisé par `engine.py` (dupliqué) | `scheduling/kpi.py` |
| **Double définition de constantes** | `BUFFER_THRESHOLDS`, `SETUP_TIME_HOURS`, poids → risque de drift silencieux | `material.py` vs `engine.py` vs `lines.py` |
| **Mutation in-place de `OF.qte_restante`** | Restauration manuelle après allocation → exception-unsafe | `orders/allocation.py` |
| **Couplage privé** : `_receptions_by_article` accédé par `AllocationManager` | Casse silencieusement à toute refacto du `DataLoader` | `orders/allocation.py` |
| **Stock bloqué traité différemment** | `Stock.disponible()` = `physique - alloue` (n'exclut PAS le bloqué) ↔ doc qui dit `physique - alloue - bloque` ↔ `eol_residuals.py` qui calcule `physique + bloque - alloue` | `models/stock.py`, `feasibility/eol_residuals.py` |
| **Hardcoding des lignes** | `TARGET_LINES = ("PP_830", "PP_153")` figé en code → toute nouvelle ligne nécessite un déploiement | `planning/capacity.py` |
| **Horizon scheduler court** | 5 jours seulement (`PLANNING_WORKDAYS`) alors que `WORKING_DAYS_DEFAULT = 15` dans `capacity.py`, mais les besoins métier vont à S+3 (réunion de charge) → décalage outil/usage | `scheduling/engine.py` |
| **Pas d'écriture ERP** | Tout doit être ressaisi manuellement → friction opérationnelle persistante | Architecture |
| **`action_report.py` 1449 lignes** | Mélange agrégation + présentation → maintenabilité dégradée | Reports |

## 10. Recommandations métier prioritaires

1. **Consolider la couverture BOM** : enquête sur les 16 % d'articles FABRICATION non documentés → règle de fallback ou import complémentaire.
2. **Étendre l'horizon scheduler à 15 j** pour aligner sur le rituel de réunion de charge S+1→S+3.
3. **Externaliser la liste des lignes** dans `config/lines.json` (déjà esquissé pour calendrier/capacité).
4. **Introduire un statut "écrit dans l'ERP"** sur les propositions pour clore la boucle décisionnelle.
5. **Nettoyer le pipeline legacy** (`scheduling/kpi.py` dupliqué) pour réduire la surface cognitive.
6. **Unifier le traitement de `stock_bloque`** via une politique explicite (libérable ou non, selon contexte CQ).
7. **Industrialiser la traçabilité de décision** : pourquoi cet OF a été planifié à ce jour (les 12 critères → un score explicable, pas seulement un tuple opaque).

---

L'ensemble forme un **moteur d'ordonnancement déterministe et auditable**, conçu autour de la matérialité opérationnelle d'un ordonnanceur Sage X3 — pas un MRP de plus, mais un assistant qui parle la langue de l'atelier (WOP, WOS, contre-marque, kanban, BDH, JIT, 1×8 / 2×8 / 3×8). Sa valeur tient dans la fidélité du modèle de domaine ; ses limites sont dans le couplage en lecture seule à l'ERP et dans une dette technique de pipeline héritée.
