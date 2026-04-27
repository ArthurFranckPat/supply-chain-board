# Phase 1: Baseline & Profiling - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md - this log preserves the analysis.

**Date:** 2026-04-27
**Phase:** 01-baseline-profiling
**Mode:** assumptions
**Areas analyzed:** Profiling Tool, Script Location, Test Data, Baseline Metrics, Output

## Assumptions Presented

### Profiling Tool
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| Utiliser cProfile (stdlib), pas py-spy (non installé) | Confident | `which py-spy` → not found, `python -c "import cProfile"` → ok |
| Rapport pstats lisible + stats textuelles, pas de snakeviz | Confident | `which snakeviz` → not found |

### Script Location
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| `scheduling/ga/scripts/profile_ga.py` | Confident | `benchmark_ga.py`, `audit_bom_coverage.py` déjà dans ce dossier |
| Imports relatifs vers package `ga` | Confident | Convention des scripts existants |

### Test Data
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| Contexte synthétique de `test_engine_integration.py:_make_context()` | Confident | Les tests GA créent des contextes synthétiques, CSV non versionnés |
| Pas besoin d'extractions ERP réelles | Confident | Le profiling identifie les points chauds même sur données synthétiques |

### Baseline Metrics
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| Réutiliser `benchmark.py` existant | Confident | Déjà `perf_counter`, `run_benchmark`, `BenchmarkReport` |
| GAConfig avec paramètres par défaut | Confident | `GAConfig()` — population=100, max_gen=200 |

### Output
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| `.planning/research/profiling/profile_ga.pstats` + `BASELINE.md` | Confident | Spécifié dans ROADMAP Phase 1 |

## Corrections Made

No corrections — all assumptions confirmed.

## External Research

Not performed — all assumptions resolved from codebase analysis.
