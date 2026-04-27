# Phase 2: Micro-Optimisations - Context

**Gathered:** 2026-04-27 (assumptions mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Appliquer les optimisations rapides à fort impact sur `hash_genes()` et `clone()` — les deux points chauds les plus faciles identifiés en Phase 1 (34% du temps GA cumulé). Aucune refonte structurelle. Chaque changement est isolé et réversible.
</domain>

<decisions>
## Implementation Decisions

### hash_genes() — Remplacer MD5 + json.dumps
- **D-01:** Utiliser `hash(tuple(sorted(genes.items())))` comme fonction de hachage
- **D-02:** Pas de dépendance externe (stdlib uniquement)
- **D-03:** Conserver la même signature de fonction `hash_genes(genes: dict[str, int]) -> str` pour compatibilité
- **D-04:** Le nouveau hash est déterministe au sein d'un même processus. Si un jour le multi-processus utilise des chromosomes hashed entre workers, passer à `hashlib.sha256(repr())` mais pas maintenant

### clone() — Remplacer deepcopy par shallow copy
- **D-05:** Remplacer `deepcopy(ind.genes)` par `ind.genes.copy()` dans `clone()`
- **D-06:** Les valeurs de genes sont des `int`, immuables — la shallow copy est parfaitement sûre
- **D-07:** Conserver `deepcopy` en import pour les autres usages potentiels mais ne pas l'utiliser dans clone()

### _compute_diversity() — Réduire la charge
- **D-08:** Réduire `sample_size` par défaut de 20 à 10 (paires échantillonnées)
- **D-09:** Garder la métrique existante (overlap ratio), ne pas changer l'algorithme

### Validation
- **D-10:** Après chaque changement, exécuter `run_baseline.py` Phase 1 pour comparer avant/après
- **D-11:** Benchmark doit montrer AG score ≥ glouton score (aucune dégradation de qualité)
- **D-12:** Suite de tests `tests/ga/` doit rester 100% verte

### the agent's Discretion
- Format de sortie du nouveau `hash_genes()` (hex string vs int)
- Nom exact de la variable `sample_size` dans `_compute_diversity()`
- Ordre exact d'exécution des optimisations (hash puis clone, ou les deux ensemble)

</decisions>

<canonical_refs>
## Canonical References

### Code à modifier
- `apps/planning-engine/production_planning/scheduling/ga/chromosome.py:66` — `hash_genes()` à remplacer
- `apps/planning-engine/production_planning/scheduling/ga/chromosome.py:54` — `clone()` à modifier
- `apps/planning-engine/production_planning/scheduling/ga/engine.py:~52` — `_compute_diversity()` avec `sample_size=20`

### Résultats Phase 1
- `.planning/research/profiling/BASELINE.md` — hotspots identifiés, métriques de référence
- `.planning/research/profiling/baseline_raw.json` — données brutes AG vs glouton
- `apps/planning-engine/production_planning/scheduling/ga/scripts/run_baseline.py` — script de benchmark réutilisable

### Docs projet
- `.planning/ROADMAP.md` § Phase 2 — objectifs, plans, critères de succès
- `.planning/REQUIREMENTS.md` — PERF-02, PERF-03, PERF-07
- `.planning/research/FEATURES.md` § Table Stakes — hash et clone sont identifiés comme prioritaires
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `run_baseline.py` — déjà prêt pour benchmark avant/après. Invoquer: `cd apps/planning-engine && python -m production_planning.scheduling.ga.scripts.run_baseline`
- `profile_ga.py` — peut être réutilisé pour reprofiler après optimisation

### Established Patterns
- `hash_genes()` retourne une `str` (hex digest). Le nouveau `hash()` retourne un `int` — wrapper en `str()` ou `hex()` pour compatibilité
- `clone()` crée un nouvel `Individual` via `make_individual()` — le constructeur attend `dict[str, int]`, `.copy()` suffit
- `invalidate()` appelle `hash_genes(ind.genes)` après mutation — la nouvelle implémentation doit être rapide car appelée ~1 863 fois

### Integration Points
- `hash_genes()` est appelé depuis: `make_individual()`, `invalidate()`, `_eval_one()` (cache key)
- `clone()` est appelé depuis: tous les opérateurs de crossover et mutation avant modification
</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.
</specifics>

<deferred>
## Deferred Ideas

- Hash déterministe cross-processus pour ProcessPoolExecutor (Phase 4) — à traiter si le besoin émerge
- Optimisation de `invalidate()` (1 863 appels) — inclus implicitement via l'optimisation de `hash_genes()`
- Cache d'évaluation global amélioré — Phase 3

None — analysis stayed within phase scope.
</deferred>

---

*Phase: 02-micro-optimisations*
*Context gathered: 2026-04-27 (assumptions mode)*
