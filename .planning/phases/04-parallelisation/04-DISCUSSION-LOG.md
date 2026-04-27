# Phase 4: Parallélisation - Discussion Log (Assumptions Mode)

> **Audit trail only.**

**Date:** 2026-04-27 | **Phase:** 04-parallelisation | **Mode:** assumptions
**Areas analyzed:** ProcessPoolExecutor, Sérialisation, Fallback, Validation

## Assumptions Presented

### ProcessPoolExecutor
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| ThreadPoolExecutor → ProcessPoolExecutor dans _evaluate_population | Confident | Phase 1: >40% overhead threads, GIL, NEAT-Python removed ThreadedEvaluator |
| GAConfig.workers pour max_workers | Confident | Déjà None→cpu_count(), prêt à l'emploi |
| Pas de fallback ThreadPool | Confident | Threads sont inutiles pour CPU-bound |

### Sérialisation
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| PicklableContext pré-calculé (dicts, listes, primitives) | Confident | loader/checker non picklables, pas utilisés dans _eval_one |
| Individual déjà picklable | Confident | Dataclass avec dict[str,int], None, Any |
| Exclure loader, checker, component_checker | Confident | _eval_one appelle seulement evaluate() qui utilise decode() |

### Fallback
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| Séquentiel si PicklingError | Confident | Correct par construction, juste plus lent |
| Try/except autour du executor.map() | Confident | Pattern standard robuste |

### Validation
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| Benchmark + tests + qualité | Confident | Pattern établi Phase 1+2+3 |

## Corrections Made

No corrections — all assumptions confirmed.

## External Research

Not performed — all assumptions resolved from Phase 1 profiling and Research/PITFALLS.md.
