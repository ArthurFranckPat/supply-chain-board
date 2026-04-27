# Research Summary — AG Performance Optimization

## Key Findings

### Stack
- **Profiling**: cProfile + Snakeviz for development, py-spy for production validation
- **Parallelization**: ThreadPoolExecutor is useless for CPU-bound GA fitness (GIL). Must use ProcessPoolExecutor or multiprocessing.
- **No new dependencies**: Use stdlib only (copy, multiprocessing, cProfile). Avoid numba/cython/joblib unless >3x gain proven.

### Table Stakes Features
1. Profile before optimizing (cProfile/py-spy)
2. Replace `json.dumps + md5` with native hash (`hash(tuple(sorted(genes.items())))`)
3. Replace `deepcopy` with `dict.copy()` (genes are `{str: int}`)
4. Reduce decode cost (reuse material_state, batch component checks)
5. Switch to ProcessPoolExecutor for fitness evaluation

### Differentiators
6. Incremental fitness updates (only recompute affected days)
7. Adaptive early stopping based on diversity
8. Smarter seeding ratios based on problem size

### Architecture
- 8 phases, incremental validation after each
- Keep all public APIs unchanged
- Benchmark-driven: every optimization needs before/after numbers
- Run full test suite after each phase

### Watch Out For
- Optimizing without profiling (biggest pitfall)
- Using threads for CPU-bound work (GIL)
- Degrading quality unnecessarily (last resort only)
- Breaking existing tests with refactors
- Over-engineering caches
- Ignoring pickle overhead in multiprocessing

## Recommended Priority

| Priority | Optimization | Expected Gain | Risk |
|----------|-------------|---------------|------|
| 1 | Profile baseline | — | Low |
| 2 | Hash optimization | 10-50x per hash | Low |
| 3 | Clone optimization | 5-20x per clone | Low |
| 4 | ProcessPoolExecutor | 2-8x overall | Medium |
| 5 | Decode optimization | 1.5-3x per eval | Medium |
| 6 | Fitness single-pass | 1.5-2x per eval | Medium |
| 7 | Diversity optimization | 1.2-1.5x | Low |

---
*Research completed: 2026-04-27*
