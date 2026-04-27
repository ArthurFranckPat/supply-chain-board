# Phase 1: Baseline & Profiling - Context

**Gathered:** 2026-04-27 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Établir une baseline mesurable du temps d'exécution de l'AG et identifier précisément les points chauds via profiling. Aucune optimisation de code — uniquement mesure et documentation. Les optimisations commencent en Phase 2.
</domain>

<decisions>
## Implementation Decisions

### Profiling Tool
- **D-01:** Utiliser `cProfile` (stdlib) pour le profiling, pas py-spy (non installé)
- **D-02:** Générer un rapport pstats lisible + statistiques textuelles. Pas de dépendance externe.

### Script Location
- **D-03:** Créer `apps/planning-engine/production_planning/scheduling/ga/scripts/profile_ga.py`
- **D-04:** Suivre la convention des scripts existants : imports relatifs vers le package `ga`, exécutable standalone

### Test Data
- **D-05:** Utiliser le contexte synthétique de `tests/ga/test_engine_integration.py:_make_context()` pour le profiling
- **D-06:** Pas besoin de vraies extractions ERP — les données synthétiques suffisent pour identifier les points chauds

### Baseline Metrics
- **D-07:** Réutiliser `benchmark.py` (déjà existant) pour les métriques de baseline : temps AG, temps glouton, taux_service, taux_ouverture
- **D-08:** Utiliser `GAConfig` avec les paramètres par défaut (population=100, max_generations=200) pour la baseline

### Output
- **D-09:** Sauvegarder le rapport pstats dans `.planning/research/profiling/profile_ga.pstats`
- **D-10:** Écrire un résumé markdown `.planning/research/profiling/BASELINE.md` avec les métriques de référence

### the agent's Discretion
- Taille exacte du contexte synthétique (nombre d'OF, jours, lignes)
- Format précis du rapport markdown
- Utilisation éventuelle de `pstats.Stats` pour le formatage de sortie

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### GA Architecture & Config
- `apps/planning-engine/production_planning/scheduling/ga/config.py` — GAConfig avec valeurs par défaut à utiliser
- `apps/planning-engine/production_planning/scheduling/ga/engine.py` — `run_ga()`, `_evaluate_population()`, timing existant
- `apps/planning-engine/production_planning/scheduling/ga/benchmark.py` — `run_benchmark()`, `benchmark_instance()`, `BenchmarkReport`

### Test Infrastructure (data synthétique)
- `apps/planning-engine/tests/ga/test_engine_integration.py` — `_make_context()`, `_make_ga_config()` — à réutiliser
- `apps/planning-engine/tests/ga/test_engine_integration.py` § `_make_context()` — factory de contexte synthétique

### Scripts Convention
- `apps/planning-engine/production_planning/scheduling/ga/scripts/benchmark_ga.py` — pattern de script à suivre
- `apps/planning-engine/production_planning/scheduling/ga/scripts/audit_bom_coverage.py` — autre exemple

### Project Docs
- `.planning/ROADMAP.md` § Phase 1 — objectifs, plans, critères de succès
- `.planning/REQUIREMENTS.md` — PERF-01, PERF-08
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `benchmark.py:run_benchmark()` — infrastructure de timing et métriques complète, réutilisable pour la baseline
- `test_engine_integration.py:_make_context()` — factory de contexte GA synthétique, évite la dépendance aux CSV ERP
- `engine.py:run_ga()` — utilise déjà `time.perf_counter()` pour mesurer le temps par génération
- `benchmark.py:BenchmarkRun` — dataclass avec elapsed_seconds, taux_service, toutes les métriques à capturer

### Established Patterns
- Les scripts GA sont dans `scheduling/ga/scripts/` (pas dans le `scripts/` racine)
- Les scripts importent du package `ga` directement (pas de sys.path hack)
- `time.perf_counter()` est le timer standard — cohérent avec cProfile
- `pstats.Stats` peut trier et afficher les fonctions par temps cumulé

### Integration Points
- Le profiling doit s'intégrer sans modifier le code GA (pas d'instrumentation inline)
- Le script profile_ga.py wrapper autour de `run_ga()` avec `cProfile.run()`
- Le benchmark baseline peut appeler directement `run_benchmark()` avec 1 instance et 1 run
</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.
</specifics>

<deferred>
## Deferred Ideas

- Installer py-spy pour profiling sampling (faible overhead) — à évaluer si cProfile trop lent
- Installer snakeviz pour visualisation — utile mais non essentiel pour Phase 1
- Profiling sur données ERP réelles — dépend d'avoir des extractions disponibles

None — analysis stayed within phase scope.
</deferred>

---

*Phase: 01-baseline-profiling*
*Context gathered: 2026-04-27 (assumptions mode)*
