# Phase 3: Macro-Optimisations - Discussion Log (Assumptions Mode)

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-04-27
**Phase:** 03-macro-optimisations
**Mode:** assumptions
**Areas analyzed:** decode, evaluate/fitness, build_material_stock_state, Validation

## Assumptions Presented

### decode()
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| Fusionner `build_material_stock_state()` dans decode | Confident | Phase 1 profiling: decode = 26.6%, build_material = 6.9% |
| Réutiliser PrecomputedData (available_by_day, bom_flat) | Confident | Déjà dans GAContext, non utilisé par decode() |
| Signature publique inchangée | Confident | Principe de non-régression |

### evaluate() / fitness
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| Fusionner taux_service, taux_ouverture, _count_setups en une passe | Confident | Phase 1: 3 boucles séparées sur tous les candidats |
| Déplacer _count_setups dans decode (champ total_setups) | Confident | L'info article précédent est déjà connue pendant le décodage |
| Ajouter `total_setups` à DecodedPlanning | Confident | Évite une boucle O(n) supplémentaire |

### build_material_stock_state()
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| Passer material_state pré-initialisé via GAContext | Confident | Évite reconstruction à chaque appel decode |
| Reset léger plutôt que reconstruction | Confident | Seul le stock change, pas la structure du dict |

### Validation
| Assumption | Confidence | Evidence |
|-----------|-----------|----------|
| Benchmark avant/après, AG ≥ glouton, tests verts | Confident | Pattern établi Phase 1+2 |

## Corrections Made

No corrections — all assumptions confirmed.

## External Research

Not performed — all assumptions resolved from Phase 1 profiling data and codebase analysis.
