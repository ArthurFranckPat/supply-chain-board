# Phase 3: Macro-Optimisations - Context

**Gathered:** 2026-04-27 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Optimiser `decode()` (26.6% du temps GA) et `evaluate()`/fitness (41.3% incluant decode) — les deux plus gros hotspots restants après la Phase 2. Aucune refonte du décodeur ou de la fitness, uniquement des optimisations ciblées : fusion de passes, réutilisation de pré-calculs, élimination de redondances.
</domain>

<decisions>
## Implementation Decisions

### decode() — Réduire le coût du décodage
- **D-01:** Fusionner `build_material_stock_state()` directement dans `decode()` au lieu de l'appeler comme import externe. Éviter de reconstruire l'état depuis zéro si possible.
- **D-02:** Réutiliser `PrecomputedData` déjà disponible dans `GAContext` — en particulier `available_by_day` et `bom_flat` pour éviter des lookups redondants dans le loader
- **D-03:** Ne pas modifier la signature publique de `decode()` ni son type de retour `DecodedPlanning`

### evaluate() / fitness — Réduire les passes multiples
- **D-04:** Fusionner les boucles de `taux_service`, `taux_ouverture`, et `_count_setups` en une seule passe sur les candidats planifiés
- **D-05:** Déplacer le comptage des changements de série dans `decode()` — quand un OF est planifié sur un jour, on sait déjà son article et l'article précédent. Évite la boucle `_count_setups` séparée.
- **D-06:** Sortir `_count_setups` comme champ du `DecodedPlanning` (ex: `total_setups: int`) plutôt que de le recalculer

### build_material_stock_state() — Éviter les rebuilds
- **D-07:** Passer un `material_state` pré-initialisé à `decode()` via le `GAContext` plutôt que de le reconstruire à chaque appel
- **D-08:** Réinitialiser l'état entre les évaluations de manière légère (reset des compteurs de stock, pas reconstruction du dict)

### Validation
- **D-09:** Benchmark `run_baseline.py` avant/après chaque changement
- **D-10:** AG score ≥ glouton score, pas de dégradation
- **D-11:** Suite de tests `tests/ga/` 100% verte

### the agent's Discretion
- Nom exact du nouveau champ `total_setups` dans `DecodedPlanning`
- Implémentation exacte du reset léger du `material_state`
- Ordre des opérations dans la boucle fusionnée de fitness

</decisions>

<canonical_refs>
## Canonical References

### Code à modifier
- `apps/planning-engine/production_planning/scheduling/ga/decoder.py:67` — `decode()` à optimiser
- `apps/planning-engine/production_planning/scheduling/ga/fitness.py:101` — `evaluate()` à optimiser
- `apps/planning-engine/production_planning/scheduling/material.py:19` — `build_material_stock_state()` à intégrer

### Résultats précédents
- `.planning/research/profiling/BASELINE.md` — hotspots Phase 1, résultats Phase 2 (1.43x)
- `.planning/research/profiling/baseline_raw.json` — baseline originale
- `apps/planning-engine/production_planning/scheduling/ga/scripts/run_baseline.py` — script de benchmark
- `apps/planning-engine/production_planning/scheduling/ga/scripts/profile_ga.py` — reprofiling possible

### Docs projet
- `.planning/ROADMAP.md` § Phase 3 — objectifs, plans, critères de succès
- `.planning/REQUIREMENTS.md` — PERF-04, PERF-05
- `.planning/research/FEATURES.md` § Fitness Memoization et § Decode Optimization
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `PrecomputedData` — déjà dans `GAContext`, contient `bom_flat`, `available_by_day`, `charge_by_of`
- `run_baseline.py` — benchmark réutilisable pour avant/après

### Established Patterns
- `decode()` crée `DecodedPlanning` avec `plannings`, `unscheduled`, `capacity_violations`, `component_violations`
- `evaluate()` appelle `decode()` puis calcule 5 métriques séparément (taux_service, taux_ouverture, nb_jit, nb_changements_serie, nb_late)
- `_count_setups()` itère sur tous les plannings par ligne et par jour — logique déplaçable dans decode

### Integration Points
- `decode()` est appelé depuis `evaluate()` dans `fitness.py` — toute modification de `DecodedPlanning` impacte `evaluate()`
- `build_material_stock_state()` est importé depuis `scheduling/material.py` — l'intégrer dans `decode()` évite un import et un appel de fonction
</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.
</specifics>

<deferred>
## Deferred Ideas

- Fusionner le component checking dans decode (éliminer l'appel séparé) — impact qualité incertain, à investiguer en Phase 4
- Fitness incrémentale (ne recalculer que les jours modifiés) — v2

None — analysis stayed within phase scope.
</deferred>

---

*Phase: 03-macro-optimisations*
*Context gathered: 2026-04-27 (assumptions mode)*
