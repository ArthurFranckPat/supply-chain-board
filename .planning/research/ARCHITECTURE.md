# Research — Architecture

## Component Boundaries

The AG optimization touches these existing components:

```
┌─────────────────────────────────────────────────────────────┐
│  AG Optimization Layer (new concerns, no new files)          │
│  - Hash function (chromosome.py)                             │
│  - Clone function (chromosome.py)                            │
│  - Evaluation loop (engine.py)                               │
│  - Decode function (decoder.py)                              │
│  - Fitness function (fitness.py)                             │
│  - Diversity metric (engine.py)                              │
│  - Parallel evaluator (engine.py)                            │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────┐
│  Existing AG Core (untouched interface)                      │
│  - GAConfig (config.py)                                      │
│  - Operators (crossover.py, mutation.py, selection.py)       │
│  - Component checkers (evaluation/)                          │
│  - Seeding (seeding.py)                                      │
│  - Repair (repair.py)                                        │
│  - Benchmark (benchmark.py)                                  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Current Flow (slow)
```
Individual (genes: dict)
  → clone() → deepcopy(genes)              [slow]
  → mutate/crossover → invalidate()        [fast]
  → evaluate()                             [slow]
    → decode()                             [slow]
      → build_material_state()             [slow]
      → per-OF component check             [slow]
    → fitness()                            [medium]
      → taux_service (loop all candidates) [medium]
      → taux_ouverture (loop all)          [medium]
      → count_setups (loop all)            [medium]
  → hash_genes() → json.dumps + md5        [slow]
```

### Target Flow (fast)
```
Individual (genes: dict)
  → clone() → genes.copy()                 [fast]
  → mutate/crossover → invalidate()        [fast]
  → evaluate()                             [optimized]
    → decode()                             [optimized]
      → reuse material_state structure     [fast]
      → batch component check              [fast]
    → fitness()                            [optimized]
      → single-pass metrics computation    [fast]
  → hash_genes() → hash(tuple())           [fast]
```

## Suggested Build Order

Dependencies between optimizations:

1. **Profiler baseline** (Phase 1) — no dependencies, informs everything else
2. **Hash optimization** (Phase 2) — no dependencies, isolated change
3. **Clone optimization** (Phase 2) — no dependencies, isolated change
4. **Decode optimization** (Phase 3) — depends on understanding decode() hotspot from profiling
5. **Fitness optimization** (Phase 3) — depends on decode() structure
6. **Diversity optimization** (Phase 4) — isolated, small change
7. **Parallel evaluation** (Phase 5) — depends on all above being stable
8. **Benchmark + report** (Phase 6) — depends on all above

## Key Design Decisions

### Keep Interface Stable
- `Individual`, `GAContext`, `GAResult` dataclasses remain unchanged
- `run_ga()` signature unchanged
- `GAConfig` may get new optional fields (backward compatible)
- Existing tests must pass without modification

### Benchmark-Driven
- Every optimization must be accompanied by a before/after benchmark
- Use `benchmark.py` infrastructure already present
- Minimum acceptable: same quality, faster. Target: same quality, 2x faster.

### Incremental Validation
- After each phase, run the full test suite (`pytest tests/ga/`)
- Run the benchmark comparing AG vs greedy
- If quality drops below threshold (taux_service < greedy - 2%), investigate
