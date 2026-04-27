# Phase 4: Parallélisation - Context

**Gathered:** 2026-04-27 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Remplacer `ThreadPoolExecutor` par `ProcessPoolExecutor` dans `_evaluate_population()` pour contourner le GIL et obtenir un vrai speedup multi-cœur. Pré-calculer les données picklables du contexte pour la sérialisation inter-processus. Fallback séquentiel si l'approche processus échoue.
</domain>

<decisions>
## Implementation Decisions

### ProcessPoolExecutor
- **D-01:** Remplacer `ThreadPoolExecutor` par `ProcessPoolExecutor` dans `_evaluate_population()` (engine.py)
- **D-02:** Utiliser `GAConfig.workers` pour `max_workers` (None = `os.cpu_count()`, existant)
- **D-03:** Pas de fallback ThreadPool — uniquement fallback séquentiel. Les threads sont inutiles (GIL)

### Sérialisation
- **D-04:** Pré-calculer un `PicklableContext` contenant uniquement des types sérialisables (dicts, listes, ints, floats) avant d'appeler `executor.map()`
- **D-05:** Extraire du `GAContext` : `candidates`, `candidates_by_id`, `workdays`, `line_capacities`, `line_min_open`, `by_line`, `receptions_by_day`, `initial_stock`, `weights`, `ga_config`
- **D-06:** `Individual` est déjà picklable (dataclass, dict[str,int], None, Any) — pas de changement
- **D-07:** Ne PAS passer `loader`, `checker`, `component_checker` aux workers — ces objets ne sont pas utilisés dans `_eval_one()` qui ne fait que `evaluate(ind, ctx)`. Si needed, les simuler avec des structures picklables

### Fallback
- **D-08:** Try/except autour de `ProcessPoolExecutor.map()`. Si `PicklingError` ou autre exception → log warning et évaluer séquentiellement
- **D-09:** L'évaluation séquentielle est toujours correcte (pas de perte de qualité), juste plus lente

### Validation
- **D-10:** Benchmark `run_baseline.py` avant/après (même contexte synthétique que phases précédentes)
- **D-11:** AG score ≥ glouton, taux_service ≥ 100%
- **D-12:** `tests/ga/` 100% verts
- **D-13:** Mesurer le speedup réel sur la machine de test (pas juste théorique)

### the agent's Discretion
- Nom précis du `PicklableContext` (dataclass ou SimpleNamespace)
- Gestion du `if __name__ == "__main__"` guard pour ProcessPoolExecutor (obligatoire sur macOS/Windows)
- Timeout des workers
</decisions>

<canonical_refs>
## Canonical References

### Code à modifier
- `apps/planning-engine/production_planning/scheduling/ga/engine.py:73` — `_evaluate_population()` à réécrire
- `apps/planning-engine/production_planning/scheduling/ga/config.py` — `GAConfig.workers` (existant)

### Résultats précédents
- `.planning/research/profiling/BASELINE.md` — Phase 1-2-3 metrics, 1.54x cumulative
- `.planning/research/profiling/phase3_baseline.json` — baseline Phase 3
- `.planning/research/STACK.md` — § Parallelization: ProcessPoolExecutor recommandé
- `.planning/research/PITFALLS.md` — § Pitfall 2 (ThreadPool useless for CPU) et § Pitfall 6 (pickle overhead)

### Docs projet
- `.planning/ROADMAP.md` § Phase 4
- `.planning/REQUIREMENTS.md` — PERF-06
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GAConfig.workers` — déjà None → `os.cpu_count()`, prêt à l'emploi
- `_eval_one()` dans engine.py — déjà une closure autonome, compatible multiprocessing si le contexte est picklable

### Established Patterns
- `ThreadPoolExecutor` actuel utilise `with ThreadPoolExecutor(max_workers=workers) as executor: list(executor.map(_eval_one, population))`
- Le même pattern avec ProcessPoolExecutor est quasi identique

### Integration Points
- `_evaluate_population()` est appelée une fois par génération depuis `run_ga()`
- Le `eval_cache` dict n'est pas thread-safe mais est OK en séquentiel post-process (collecte des résultats)
</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.
</specifics>

<deferred>
## Deferred Ideas

- multiprocessing.Manager pour état partagé — complexe, pas nécessaire pour l'évaluation indépendante
- Distributed computing (Ray, Dask) — overkill, single-machine suffit
- GPU parallelism — hors scope

None — analysis stayed within phase scope.
</deferred>

---

*Phase: 04-parallelisation*
*Context gathered: 2026-04-27 (assumptions mode)*
