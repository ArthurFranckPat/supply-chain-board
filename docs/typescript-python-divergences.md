# Divergences fonctionnelles : TypeScript (repo actuel) vs Python (worktree `redesign-aldes`)

Ce document trace les écarts entre les algorithmes du repo AdonisJS TypeScript et ceux du worktree Python `redesign-aldes`, qui en est la source. Il sert de feuille de route pour rapprocher progressivement les deux implémentations.

## Méthodologie

- Worktree source : `.claude/worktrees/redesign-aldes/apps/planning-engine/production_planning/`
- Repo TypeScript : `app/domain/`, `app/services/`, `app/controllers/planning_board_controller.ts`
- Comparaison faite sur la logique pure, indépendamment des I/O (SOAP/SQLite).

---

## 1. Faisabilité récursive (`app/domain/feasibility.ts`)

### Écarts

| Sujet | Python (`feasibility/recursive.py`) | TypeScript | Impact |
|---|---|---|---|
| `use_receptions` | `RecursiveChecker(..., use_receptions=False)` par défaut. | ✅ Corrigé : `checkFeasibility(..., useReceptions=false)`. `promise-date.ts` passe explicitement `true`. | Aligné. |
| Date de besoin | Calculée : `date_debut` → min(commandes contremarque -2j) → `date_fin - 2j`. | Passée en paramètre (`upToDate`). | Peut manquer des réceptions si `upToDate` est mal positionné. |
| Allocations parent | Si OF parent ferme a des allocations ERP, les composants alloués sont sautés. | Non implémenté. | Faux négatifs de rupture sur OF fermes alloués. |
| Articles fantômes (`AFANT`) | Résolution vers une variante unique. | Non implémenté. | Ruptures fantômes non détectées / mal résolues. |
| Composant fabriqué | Recherche d'un OF candidat statut 1/2/3 avant de descendre la BOM. | Descend directement la BOM. | Si aucun OF n'existe, le TS marque les composants achat comme manquants au lieu de l'article fabriqué. |
| Catalogue `articles` | Utilisé pour `is_component_treated_as_purchase`. | Paramètre présent mais non utilisé. | Classification achat/fabriqué basée uniquement sur `componentType` de la nomenclature. |

### Verdict

Version TS = simplification fonctionnelle. Résultats identiques uniquement en l'absence d'allocations, d'AFANT et quand chaque composant fabriqué a un OF couvrant le besoin.

---

## 2. Matching commande ↔ OF

### `app/domain/of-conso.ts` (board) vs `orders/matching.py`

| Sujet | Python | TypeScript | Impact |
|---|---|---|---|
| MTS : lien commande/OF | `NUM_ORDRE_ORIGINE = num_commande` **ET** `METHODE_OBTENTION_LIVRAISON = "Ordre de fabrication"`. | Prend les `supplyFlows` de l'article (tous les OF planifiables). | Le TS peut matcher une commande MTS sur un OF qui n'est pas son OF de livraison. |
| Prévisions vs OF fermes | Si ce n'est pas une commande ferme, exclut les OF statut 1 et 2. | Pas d'exclusion. | Une prévision peut voler la couverture d'un OF ferme. |
| Tri | Statut, semaines, jours, quantité disponible, `date_commande`. | Type, date, écart jour, statut, quantité. | Ordre de priorisation différent. |
| Contremarque | Via `NUM_ORDRE_ORIGINE`. | Via `origin.contremarque` dans le TS. | Deux mécanismes différents pour le même besoin. |

### `app/domain/orders.ts` (pipeline) vs `orders/matching.py`

Version TS encore plus simplifiée : pas de gestion de contremarque, pas de tolérance temporelle, MTS sélectionne un seul OF sans filtre origine.

### Verdict

Divergences significatives sur le MTS et le traitement des prévisions.

---

## 3. Allocation séquentielle / board feasibility

### `app/domain/stock-state.ts` vs `services/planning_board_feasibility.py`

| Sujet | Python | TypeScript | Impact |
|---|---|---|---|
| Stock initial | Stock + réceptions si `use_receptions=True`. | ✅ Similaire via `buildInitialStock`. | Aligné. |
| OF fermes avec allocations ERP | Traités à part, pas d'allocation virtuelle. | `firmWithAllocations` est un `Set` vide. | Concurrence mal gérée ; allocations ERP doublonnées virtuellement. |
| Profondeur BOM | `_direct_purchase_requirements` descend niveau 1 seulement. | Identique. | Les composants achat des sous-ensembles fabriqués ne sont pas décrétés ici (mais `checkFeasibility` les détecte). |
| Allocation | `min(besoin, stock_state.get_available(article))`. | Alloue sur n'importe quel `supply` positif. | Peut consommer une réception future ou un OF au lieu du stock. |

### Verdict

Proche, mais les allocations ERP et la nature exacte des `supply` alloués divergent.

---

## 4. Analyse de rupture

### `app/domain/analyse-rupture.ts` vs `feasibility/analyse_rupture.py`

| Sujet | Python | TypeScript | Impact |
|---|---|---|---|
| Stock physique article | Initialisé avec `stk.stock_physique` puis consommé commande par commande. | `remainingStock.set(articleCode, currentStock(demands, articleCode))` → `currentStock` reçoit des demandes, donc retourne **0**. | **Bug** : le stock physique de l'article commandé n'est jamais consommé avant le pool. |
| Allocations existantes | `unallocated = max(0, qte_restante - qte_allouee)`. | Non pris en compte. | Besoins surévalués. |
| Réceptions | `cumul_receipts` jusqu'à la date de la commande si `include_receptions`. | Non pris en compte. | Couverture sous-évaluée. |
| Clé commande | `(num_commande, client, article, date)`. | `(numCommande, article)` (perd le client et la date). | Doublons possibles si deux clients ont la même commande/article. |

### Verdict

**La version TypeScript est fonctionnellement incorrecte** par rapport au Python. Le bug du stock physique est le plus critique.

---

## 5. Suivi commandes

### `app/domain/suivi.ts` vs `suivi-commandes/domain/status_assigner.py`

| Sujet | Python | TypeScript | Impact |
|---|---|---|---|
| Signal QC indépendant | `_consume_for_cq_signal` utilise une copie dédiée du stock. | Non implémenté. | Pas de `alerte_cq_statut`. |
| Promotion RAS → ALLOCATION_A_FAIRE | Si `RAS` mais signal QC a consommé du QC → `ALLOCATION_A_FAIRE`. | Non implémenté. | Sous-classification des lignes couvertes par QC. |
| Restitution ordre | Par `id(line)` (identité d'objet). | Par `numCommande + article`. | Ordre final potentiellement différent. |

### Verdict

Chemin nominal identique ; divergence sur la sensibilité QC.

---

## 6. Promise date

### `app/domain/promise-date.ts` vs `feasibility_service.py`

| Sujet | Python | TypeScript | Impact |
|---|---|---|---|
| Itération | Jours ouvrés via `next_workday`. | Tous les jours (`setDate + 1`). | Dates différentes si les 60 jours incluent week-ends/fériés. |
| Calendrier | Utilise `CalendarConfig`. | Aucun. | Même remarque. |
| Optimisation | Sauts de dates, early exit. | Itération linéaire brute. | Performance + précision. |

### Verdict

Résultats divergents dès qu'un calendrier intervient.

---

## 7. Consommation des prévisions

### `app/domain/forecast-consumption.ts` vs `orders/forecast_consumption.py`

| Sujet | Python | TypeScript | Impact |
|---|---|---|---|
| Répartition | Réduction proportionnelle de toutes les prévisions de l'article. | Agrège en une seule prévision (prend le premier template). | Perte des dates multiples, distorsion des besoins chronologiques. |
| Suppression | Prévision éliminée si `prev_net = 0`. | Identique. | Aligné. |

### Verdict

Divergence sur la forme des prévisions nettes.

---

## 8. API / contrôleur

| Sujet | Python / board-ui | TypeScript | Impact |
|---|---|---|---|
| Route faisabilité | `/api/v1/feasibility/check` avec `use_receptions`, `check_capacity`, `depth_mode`. | `/api/v1/planning-board/feasibility` avec `useReceptions`. | Pas de `check_capacity` ni `depth_mode` dans le TS. |
| Route impacts | `/api/v1/planning-board/order-impacts` (supposée). | `/api/v1/planning-board/order-impacts`. | À vérifier champ par champ. |

---

## 9. Couverture des tests unitaires

Comparaison rapide du nombre de lignes et des scénarios couverts.

| Domaine | Fichier(s) Python | Fichier(s) TypeScript | Observations |
|---|---|---|---|
| Faisabilité récursive | `test_recursive_checker.py` (~770 lignes) | `tests/domain/feasibility.test.ts` (~130 lignes) | Python teste allocations parent, AFANT, `use_receptions`, cycles, sous-ensembles. TS se limite aux cas de base. |
| Matching | `test_matching.py` (~440 lignes) | `tests/domain/of-conso.test.ts` (~157 lignes), `tests/domain/orders.test.ts` (~199 lignes) | TS couvre hard-pegging, stock, couverture cumulative. Python ajoute le filtre origine/méthode, l'exclusion prévision/OF ferme, le MTS non univoque. |
| Board feasibility | `test_planning_board_feasibility.py` (~191 lignes) | `tests/domain/stock-state.test.ts` (~170 lignes), `tests/domain/order-impacts.test.ts` (~200 lignes) | Python teste concurrence, affermissement, overrides, what-if. TS teste la structure mais pas les allocations ERP. |
| Analyse de rupture | `test_analyse_rupture.py` (~1428 lignes) | `tests/domain/analyse-rupture.test.ts` (~107 lignes) | Python couvre waterfall, réceptions, allocations, pool multi-niveaux, branches. TS a un bug sur le stock physique et ne couvre pas ces scénarios. |
| Suivi | `test_domain_status.py` (~324 lignes) | `tests/domain/suivi.test.ts` (~124 lignes) | Python teste le signal CQ et ses promotions. TS ne les couvre pas. |
| Prévisions | `test_forecast_consumption.py` (~150 lignes) | `tests/domain/forecast-consumption.test.ts` (~84 lignes) | Mêmes cas nominaux, mais TS perd la granularité temporelle. |
| Availability | `test_availability_kernel.py` | `tests/domain/availability.test.ts` | Fonctions de base couvertes des deux côtés. |

### Synthèse

Les tests TypeScript **ne portent pas sur les mêmes scénarios** que les tests Python. Ils valident le portage des cas simples, mais pas les règles métier avancées (allocations ERP, AFANT, filtrage MTS, calendrier, signal QC, waterfall complet). Pour prétendre à l'identité fonctionnelle, il faudrait reprendre les tests Python et les porter en TypeScript.

---

## Nouveaux tests ajoutés

Ces fichiers de test reproduisent les écarts identifiés :

- `tests/domain/analyse-rupture-bug.test.ts` — reproduit le bug de consommation du stock physique dans le waterfall (**échoue avec le code actuel**).
- `tests/domain/feasibility-advanced.test.ts` — valide `use_receptions=false` et documente la divergence sur les sous-ensembles fabriqués sans OF.
- `tests/domain/matching-edge-cases.test.ts` — documente l'absence d'exclusion prévision/OF ferme et le MTS non univoque.
- `tests/domain/suivi-qc-signal.test.ts` — documente l'absence du signal QC indépendant.

---

## Ordre de priorité de rapprochement

1. **`analyse-rupture.ts`** — bug stock physique à corriger en priorité.
2. **Matching MTS** — aligner le filtrage origine/méthode sur le Python.
3. **Allocations ERP** — brancher `firmWithAllocations` dans `stock-state.ts`.
4. **Promise date** — intégrer le calendrier ouvrier.
5. **Articles fantômes / AFANT** — si le périmètre les inclut.
6. **Signal QC suivi** — si le front en a besoin.
7. **Prévisions** — répartir proportionnellement au lieu d'agréger.

---

## Fichiers modifiés lors de cette analyse

- `app/domain/availability.ts`
- `app/domain/feasibility.ts`
- `app/domain/promise-date.ts`
- `app/controllers/planning_board_controller.ts`
- `tests/domain/feasibility.test.ts`
