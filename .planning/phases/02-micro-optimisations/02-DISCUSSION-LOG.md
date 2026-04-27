# Phase 2: Micro-Optimisations - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-27
**Phase:** 02-micro-optimisations
**Mode:** assumptions
**Areas analyzed:** hash_genes, clone, _compute_diversity, Validation

## Assumptions Presented

### hash_genes()
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| `hash(tuple(sorted(genes.items())))` remplace `json.dumps+md5` | Confident | Phase 1 profiling: 3 555 appels, 11.9% du temps GA, `json.dumps` = 0.019s |
| Stdlib uniquement, pas de dépendance externe | Confident | `hash()` et `tuple()` sont builtins |
| Même signature `-> str` conservée | Confident | Compatibilité avec `cache_key` dans Individual |

### clone()
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| `genes.copy()` remplace `deepcopy(genes)` | Confident | Phase 1: 959 appels, 22% du temps GA, `deepcopy` = 0.039s |
| Les valeurs int sont immuables — shallow copy sûre | Confident | `genes` est `dict[str, int]` |
| Conserver import deepcopy pour autres usages | Confident | Principe de précaution |

### _compute_diversity()
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| `sample_size` de 20 → 10 | Confident | Non mesurable sur 20 OFs, gain marginal mais gratuit |
| Algorithme inchangé | Confident | Focus sur les gains clairs (hash+clone) |

### Validation
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| Benchmark `run_baseline.py` avant/après | Confident | Script déjà créé en Phase 1 |
| AG score ≥ glouton score | Confident | Phase 1: AG 0.957 > glouton 0.942 |
| Tests `tests/ga/` 100% verts | Confident | Phase 1: 59/59 passed |

## Corrections Made

No corrections — all assumptions confirmed.

## External Research

Not performed — all assumptions resolved from Phase 1 profiling data and codebase analysis.
