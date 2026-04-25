# Plan d'implémentation — Recommandations issues de l'analyse métier

> Document compagnon de [`analyse-metier-approfondie.md`](./analyse-metier-approfondie.md).
> Statut : **plan validé, implémentation à réaliser**.
> Date : avril 2026.

---

## Vue d'ensemble

Sept recommandations issues de l'analyse métier, organisées en six lots cohérents par ordre de risque croissant. Les lots peuvent être réalisés indépendamment et commités séparément.

| Lot | Reco | Surface impactée | Risque | Effort |
|---|---|---|---|---|
| 1 | (sauvegarde) | `docs/` | nul | trivial |
| 2 | 5, 3, 2 | `scheduling/`, `planning/`, `config/` | faible | S |
| 3 | 6 | `packages/erp-data-access/`, `feasibility/` | modéré | M |
| 4 | 7 | `scheduling/` | faible (additif) | M |
| 5 | 1 | `apps/planning-engine/scripts/` | nul (utilitaire) | S |
| 6 | 4 | `scheduling/`, `api/` | à valider produit | L |

---

## Lot 1 — Sauvegarde du contexte (✅ DÉJÀ FAIT)

- [x] `apps/planning-engine/docs/analyse-metier-approfondie.md` — analyse complète
- [x] `apps/planning-engine/docs/plan-implementation-recos.md` — ce document

---

## Lot 2 — Quick wins config (faible risque)

### Reco 5 — Nettoyer le pipeline legacy

**Constat actuel**
- `scheduling/kpi.py` contient `compute_kpis()` et `compute_score()` — non utilisés par `engine.py` qui implémente sa propre logique KPI.
- Seule référence externe : `tests/test_scheduler_kpi.py` qui teste exclusivement ce module orphelin.
- Doublons de constantes : `DEFAULT_WEIGHTS` aussi dans `planning/weights.py`.

**Actions**
1. Supprimer `apps/planning-engine/planning_engine/scheduling/kpi.py`.
2. Supprimer `apps/planning-engine/tests/test_scheduler_kpi.py`.
3. Vérifier qu'aucun import résiduel ne casse (`grep -r "from planning_engine.scheduling.kpi"`).
4. Confirmer que `planning/weights.py::load_weights` est l'unique source de vérité.

**Critère d'acceptation**
- `pytest` vert
- `grep -r "scheduling.kpi"` ne renvoie rien

---

### Reco 3 — Externaliser `TARGET_LINES`

**Constat actuel**
- `planning/capacity.py:11` → `TARGET_LINES = ("PP_830", "PP_153")` figé en code.
- Référencé par `scheduling/bom_graph.py`, `scheduling/engine.py` (PP_830, PP_153 dupliqués).
- Toute nouvelle ligne (`PP_xxx`) demande une release applicative.

**Actions**
1. Créer `apps/planning-engine/config/lines.json` :
   ```json
   {
     "target_lines": [
       {
         "code": "PP_830",
         "label": "Ligne assemblage 1",
         "default_capacity_hours": 14.0,
         "min_open_hours": 7.0
       },
       {
         "code": "PP_153",
         "label": "Ligne assemblage 2",
         "default_capacity_hours": 14.0,
         "min_open_hours": 7.0
       }
     ]
   }
   ```
2. Créer `planning_engine/planning/lines_config.py` :
   - Dataclass `LineConfig(code, label, default_capacity_hours, min_open_hours)`
   - Fonction `load_lines_config(config_dir: str) -> list[LineConfig]`
   - Fallback hardcodé sur `PP_830`/`PP_153` si fichier manquant (rétrocompatibilité).
3. Adapter `planning/capacity.py` : `TARGET_LINES` devient une fonction `get_target_lines()` qui charge la config (avec cache lazy).
4. Mettre à jour `scheduling/engine.py` et `scheduling/bom_graph.py`.
5. Endpoint API `GET /api/v1/lines` (en lecture).

**Critère d'acceptation**
- Modifier `config/lines.json` et relancer le scheduler doit prendre effet sans redémarrage de l'application (ou avec uniquement un reload de config).
- Tests `test_scheduler_capacity.py` passent inchangés.

---

### Reco 2 — Étendre l'horizon scheduler

**Constat actuel**
- `scheduling/engine.py:47` → `PLANNING_WORKDAYS = 5` (5 jours ouvrés).
- `planning/capacity.py:9` → `WORKING_DAYS_DEFAULT = 15` (incohérent).
- La réunion de charge se tient sur S+1 → S+3 (15 j ouvrés = 3 semaines).

**Actions**
1. Aligner `PLANNING_WORKDAYS = 15` dans `scheduling/engine.py`.
2. Exposer le paramètre dans `config/weights.json` (ou nouveau `config/scheduler.json`) :
   ```json
   {
     "planning_workdays": 15,
     "demand_calendar_days": 21,
     "freeze_threshold_hour": 12.0
   }
   ```
3. Adapter `run_schedule()` pour lire le défaut depuis la config.
4. Vérifier l'impact sur la performance (si scheduler tourne 3× plus de jours, valider que ça reste sous 30 s).
5. Adapter le frontend si besoin (heatmap de planning étendue).

**Critère d'acceptation**
- Run scheduler par défaut produit un planning sur 15 j.
- Pas de régression dans les KPIs sur jeu de données fixture.
- Documentation `CLAUDE.md` mise à jour.

---

## Lot 3 — Clarification sémantique du `stock_bloque`

### Reco 6 — Unifier le traitement de `stock_bloque`

**Constat actuel (incohérences identifiées)**
| Lieu | Comportement | Sémantique |
|---|---|---|
| `packages/erp-data-access/src/erp_data_access/models/stock.py:15` | `disponible() = physique - alloue` | Inclut le bloqué dans le disponible (optimiste) |
| `apps/planning-engine/docs/contexte_metier.md:151` | `disponible = physique - alloue - bloque` | Exclut le bloqué (strict) |
| `apps/planning-engine/planning_engine/feasibility/eol_residuals.py:106` | `physique + bloque - alloue` | Calcul atypique, semble vouloir dire "physiquement présent moins ce qui sort" mais inclut le bloqué |

Le `stock_bloque` correspond au **stock en contrôle qualité** : physiquement présent, momentanément indisponible, libérable après validation CQ.

**Décision proposée**
- Politique par défaut **stricte** : un OF ne doit pas compter le stock bloqué comme disponible (risque d'engager une production qu'on ne peut servir).
- Politique optionnelle **optimiste** : pour la projection à horizon long (S+2, S+3), on peut inclure le bloqué en supposant que le CQ se débloquera.

**Actions**
1. Dans `packages/erp-data-access/src/erp_data_access/models/stock.py` :
   ```python
   def disponible(self) -> int:
       """Stock disponible STRICT (physique - alloue - bloque).

       Politique par défaut : le stock en contrôle qualité (bloqué)
       n'est pas disponible pour engagement OF.
       """
       return self.stock_physique - self.stock_alloue - self.stock_bloque

   def disponible_optimiste(self) -> int:
       """Stock disponible incluant le stock bloqué (CQ libérable).

       Usage : projections long terme, simulations optimistes.
       """
       return self.stock_physique - self.stock_alloue
   ```
2. Lister tous les consommateurs de `Stock.disponible()` :
   ```
   apps/planning-engine/planning_engine/availability/*.py
   apps/planning-engine/planning_engine/feasibility/*.py
   apps/planning-engine/planning_engine/orders/*.py
   apps/planning-engine/planning_engine/scheduling/material.py
   ```
3. Pour chaque, choisir explicitement strict ou optimiste (par défaut strict).
4. Corriger `feasibility/eol_residuals.py:106` :
   - Comprendre l'intention métier (résidus EOL — End Of Life)
   - Remplacer `(stock.stock_physique + stock.stock_bloque - stock.stock_alloue)` par `stock.disponible_optimiste()` si l'intention est "tout ce qui peut encore servir".
5. Mettre à jour les tests existants qui utilisent `stock_bloque > 0` pour confirmer la nouvelle sémantique.
6. Ajouter un test dédié dans `packages/erp-data-access/tests/test_stock.py`.

**Risque & mitigation**
- **Risque** : changement de sémantique cassant des tests dans plusieurs apps consommatrices.
- **Mitigation** : étape 1 fait avant tout changement → CI tournée → cibler un par un les FAIL.
- **Rétrocompatibilité** : envisager un flag d'environnement `STOCK_DISPONIBLE_POLICY=strict|optimiste` pour permettre un rollback rapide.

**Critère d'acceptation**
- Tous les tests passent dans toutes les apps.
- Documentation `contexte_metier.md` confirmée et alignée.
- Pas d'expression `stock_physique + stock_bloque` ou `stock_physique - stock_alloue` (sans `- stock_bloque`) dans le code de production.

---

## Lot 4 — Traçabilité décision

### Reco 7 — Industrialiser la traçabilité

**Constat actuel**
- `scheduling/heuristics.py::generic_sort_key()` retourne un tuple à 12 éléments — très efficace pour trier mais opaque pour l'humain.
- L'ordonnanceur ne sait pas pourquoi un OF a été planifié à un jour donné plutôt qu'à un autre.
- Pas de journal de décision exploitable post-mortem.

**Actions**
1. Créer `planning_engine/scheduling/decision_trace.py` :
   ```python
   @dataclass
   class DecisionTrace:
       num_of: str
       scheduled_day: date
       priority: int               # 0/1/2 BDH-rupture/normal/BDH-ok
       due_urgency: int            # 0/1/2/3
       jit_bonus: float            # -2 ou 0
       prematurity_days: int
       target_day_delta: int
       serie_bonus: float          # -2 / -0.5 / 1
       mix_penalty: int
       kanban_penalty: float
       composite_score: float      # somme pondérée pour tri global
       reason_human: str           # explication courte (~80 chars)

       def to_dict(self) -> dict: ...
       def to_human_string(self) -> str: ...
   ```
2. Modifier `heuristics.generic_sort_key()` pour exposer un mode "trace" :
   ```python
   def generic_sort_key(...) -> tuple: ...                # comportement actuel
   def generic_decision_trace(...) -> DecisionTrace: ...  # nouveau, calcule + explique
   ```
3. Dans `lines.py::GenericLineScheduler.schedule_day()` :
   - Calculer la trace pour chaque candidat sélectionné
   - Stocker dans `CandidateOF.decision_trace: Optional[DecisionTrace]`
4. Dans `scheduling/reporting.py::_write_planning_csv` :
   - Ajouter colonnes : `score_breakdown` (JSON), `reason_human` (texte court)
5. Dans l'API : endpoint `GET /api/v1/runs/{run_id}/decisions` retournant la liste `[{num_of, decision_trace}]`.
6. Frontend : ajouter une popover sur le planning qui affiche la trace.

**Critère d'acceptation**
- Chaque OF planifié a une `decision_trace` non-null.
- CSV `planning_<line>.csv` enrichi sans perte des colonnes existantes.
- Tests : ajouter `test_decision_trace.py` qui vérifie qu'un OF urgent (due_date = today) reçoit `due_urgency=0` et `jit_bonus=-2`.

---

## Lot 5 — Audit BOM

### Reco 1 — Diagnostic couverture nomenclature

**Constat actuel**
- 16 % d'articles FABRICATION n'ont pas de nomenclature (≈ 463 / 2 964 articles).
- Chiffre cité dans la doc mais pas mesurable à la demande.
- L'ordonnanceur subit ces "trous" sans visibilité préventive.

**Actions**
1. Créer `apps/planning-engine/scripts/audit_bom_coverage.py` (ou sous `planning_engine/utils/`) :
   ```python
   """Audit de couverture nomenclature.

   Sortie: outputs/bom_coverage_audit.csv avec 1 ligne par article FABRICATION
   sans nomenclature, enrichi de:
     - Catégorie article
     - Nb d'OF dans l'historique récent (dernier mois)
     - Nb de besoins clients en attente
     - Dernière date d'utilisation
     - Composants probables (suggestion via clustering description)
   """
   def main():
       loader = DataLoader.from_env()
       fab_articles = loader.get_articles_fabrication()
       missing = []
       for article in fab_articles:
           if not loader.get_nomenclature(article.code):
               missing.append({
                   "article": article.code,
                   "designation": article.description,
                   "categorie": article.categorie,
                   "nb_of_actifs": len(loader.get_ofs_by_article(article.code)),
                   "nb_besoins": len(loader.get_besoins_by_article(article.code)),
                   ...
               })
       write_csv("outputs/bom_coverage_audit.csv", missing)
       print_summary_by_category(missing)
   ```
2. Ajouter une commande CLI `python -m planning_engine.scripts.audit_bom_coverage` ou un endpoint API `GET /api/v1/diagnostics/bom-coverage`.
3. Programmer une exécution hebdomadaire (cron / CI scheduled).

**Critère d'acceptation**
- Lancer le script produit un CSV en `outputs/`
- Rapport texte console avec : `% couverture, top 10 catégories sans BOM, top 10 articles manquants par volume OF`

---

## Lot 6 — Statut ERP (à valider produit)

### Reco 4 — Statut "écrit dans l'ERP"

**Statut** : ⚠️ **PROPOSITION — nécessite validation produit avant implémentation**

**Constat actuel**
- Aucun lien retour entre les propositions du planning-engine et la saisie effective dans Sage X3.
- L'ordonnanceur saisit manuellement, mais le système ne sait pas si c'est fait.
- Risque : recommandations relancées plusieurs fois sur des décisions déjà appliquées.

**Questions produit à trancher**
1. Qui peut acquitter une proposition ? (rôle utilisateur)
2. Quelle granularité ? (par OF, par jour, par run complet)
3. Réintégration dans le reporting ? (afficher en grisé les acquittés)
4. Persistance ? (base de données, fichier état, journal append-only)
5. Synchronisation avec Sage X3 effective ? (lecture confirmation côté ERP)

**Esquisse technique**
1. Ajouter `CandidateOF.erp_acknowledged: bool = False` + `acknowledged_at: Optional[datetime]` + `acknowledged_by: Optional[str]`.
2. Persister un fichier `outputs/<run_id>/acknowledgments.jsonl` (append-only).
3. Endpoint `PUT /api/v1/runs/{run_id}/ofs/{num_of}/acknowledge` :
   ```json
   {"acknowledged_by": "ordonnanceur1"}
   ```
4. Endpoint `GET /api/v1/runs/{run_id}` enrichi avec le statut.
5. Frontend : checkbox "saisi dans Sage" sur chaque ligne du planning.

**À ne PAS faire dans cette itération**
- Pas d'écriture vraie dans Sage X3 (hors scope, sécurité).
- Pas de réconciliation auto avec les nouveaux exports CSV ERP — décision manuelle pour l'instant.

---

## Vérifications finales (après chaque lot)

```bash
# Tests
cd apps/planning-engine
.venv/bin/python -m pytest -x

# Lint
.venv/bin/ruff check planning_engine/
.venv/bin/black --check planning_engine/

# Type check (si mypy en place)
.venv/bin/mypy planning_engine/
```

---

## Ordonnancement recommandé

1. **Sprint 1 (1-2 j)** : Lot 2 + Lot 5 — quick wins config + audit BOM
2. **Sprint 2 (2-3 j)** : Lot 4 — traçabilité décision (utile en prod immédiatement)
3. **Sprint 3 (1-2 j)** : Lot 3 — `stock_bloque` (touche package partagé, prudence)
4. **Sprint 4 (à valider)** : Lot 6 — statut ERP, après cadrage produit

Total estimé : **5-8 jours** d'implémentation pour les lots 2-5.
