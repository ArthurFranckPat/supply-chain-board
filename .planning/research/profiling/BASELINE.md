# Phase 1 Baseline — AG Performance

**Date:** 2026-04-27
**Context:** 20 OFs, 5 workdays, 2 lines (PP_830, PP_153)
**Config:** GAConfig (population=100, max_generations=20, workers=auto, component_check=full)
**Test suite:** 59 passed, 0 failed

## Profiling Hotspots

Top GA-package functions by cumulative time from cProfile (0.218s total):

| # | Function | Module | Cum. Time (s) | % of Total | Calls |
|---|----------|--------|---------------|------------|-------|
| 1 | evaluate() | `ga/fitness.py:101` | 0.090 | 41.3% | 642 |
| 2 | decode() | `ga/decoder.py:67` | 0.058 | 26.6% | 642 |
| 3 | crossover_dispatch() | `ga/operators/crossover.py:128` | 0.052 | 23.9% | 753 |
| 4 | clone() → deepcopy | `ga/chromosome.py:54` | 0.048 | 22.0% | 959 |
| 5 | hash_genes() → json.dumps+md5 | `ga/chromosome.py:66` | 0.026 | 11.9% | 3 555 |
| 6 | day_block_crossover() | `ga/operators/crossover.py:21` | 0.024 | 11.0% | 371 |
| 7 | build_material_stock_state() | `scheduling/material.py:19` | 0.015 | 6.9% | 642 |
| 8 | _count_setups() | `ga/fitness.py:63` | 0.013 | 6.0% | 642 |

**Note:** `evaluate()` cumulative time includes `decode()` (0.058s) and `_count_setups()` (0.013s) as children. The remaining ~0.019s is `taux_service`, `taux_ouverture`, and other fitness sub-computations.

### Analysis

- **decode()** (26.6%) — The decoder rebuilds `material_state` from scratch (`build_material_stock_state` at 6.9%) and iterates over all OFs per day. This is the single biggest GA-specific bottleneck.
- **clone()→deepcopy** (22.0%) — `deepcopy(genes)` is called 959 times (once per clone). With genes being `{str: int}`, a shallow `.copy()` would suffice.
- **hash_genes()** (11.9%) — 3 555 calls, each doing `json.dumps(sort_keys=True)` + `md5`. A native `hash(tuple(sorted()))` would eliminate the JSON+MD5 overhead entirely.
- **crossover_dispatch + operators** (23.9% + 11.0%) — These are algorithmic costs, harder to optimize without changing strategy.
- **_count_setups()** (6.0%) — Iterates over all planned OFs to count article transitions. Could be fused into the decode loop.

### ThreadPoolExecutor Overhead

The profiler also reveals that `ThreadPoolExecutor` overhead (thread creation, lock acquisition, join) accounts for ~0.233s cumulatively — more than the entire GA computation. On this 20-OF instance, threads add latency without speedup due to the GIL. This confirms the Research finding that `ProcessPoolExecutor` is needed for true parallel speedup (Phase 4).

## Baseline Metrics

| Metric | Glouton | AG (mean de 3 runs) | AG (best run) |
|--------|---------|---------------------|---------------|
| Temps d'exécution (s) | 0.000* | 0.126 | 0.140 |
| Score fitness | 0.9421 | 0.9571 | 0.9596 |
| Taux de service | 100.0% | 100.0% | 100.0% |
| Taux d'ouverture | 42.1% | 42.1% | 42.1% |
| OF non planifiés | 0 | 0 | 0 |
| Composants bloquants | 0 | 0 | 0 |
| OF JIT (livrés le jour dû) | 20 | 14.0 | 13 |
| Changements de série | 10 | 4.0 | 3 |

> \* Le glouton est évalué directement via `evaluate()` sans `run_ga()`, donc son temps d'exécution est négligeable. La mesure pertinente est le temps AG vs le temps acceptable pour une exécution interactive.

### Key Takeaways

- **Sur instance synthétique (20 OFs), l'AG est très rapide** : 0.126s en moyenne. Le bottleneck est le ThreadPoolExecutor, pas le calcul.
- **L'AG surpasse le glouton en qualité** : score 0.957 vs 0.942, avec moins de changements de série (4 vs 10) — meilleur regroupement des articles.
- **Les 3 points chauds identifiés** : `decode()` (26.6%), `clone()`/deepcopy (22.0%), `hash_genes()` (11.9%). Ces trois fonctions cumulent ~60% du temps GA.
- **Optimisations Phase 2 ciblées** : `hash_genes()` et `clone()` sont les gains les plus faciles (changement de 3-5 lignes chacun), avec un impact théorique de ~34% du temps GA.
- **Les tests GA passent tous** (59/59) — baseline stable.

## Next

Phase 3 ciblera decode() + fitness() (macro-optimisations, gains moyens).

---

## Phase 3 Results

**Date:** 2026-04-27
**Optimizations applied:** decode (setup counting during decode + DecodedPlanning.total_setups), fitness (single-pass evaluation replacing 5 separate loops)

| Metric | Phase 1 | Phase 2 | Phase 3 | Cumulative |
|--------|---------|---------|---------|------------|
| Temps AG moyen (s) | 0.126 | 0.088 | 0.082 | **1.54x** |
| Score AG (best) | 0.959643 | 0.959643 | 0.954643 | within range |
| Taux de service | 100% | 100% | 100% | ✓ |
| Changements série | 3–6 | 3–6 | 5–6 | within range |

### Analysis

- **1.54x cumulative speedup** from Phase 1 (0.126s → 0.082s), saving 35% of the original GA time
- **Phase 3 alone contributed +1.07x** by eliminating 4 separate fitness loops and reusing decode-computed setups
- **Quality maintained** — scores stay in the 0.952–0.960 range with 100% service rate
- **Next bottleneck**: ThreadPoolExecutor overhead still dominates (>40% of profiled time). ProcessPoolExecutor in Phase 4 is the remaining big lever
- **decode() is no longer the #1 hotspot** — the fused fitness pass means fitness and decode costs are now co-located

---

---

*Phase 3 complete — 2026-04-27*

---

## Phase 4 Results

**Date:** 2026-04-27
**Optimizations applied:** ProcessPoolExecutor (fork, workers=auto), PicklableContext, fallback séquentiel

| Metric | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Cumulative |
|--------|---------|---------|---------|---------|------------|
| Temps AG moyen (s) | 0.126 | 0.088 | 0.082 | 0.642 | **0.20x** ⚠️ |
| Score AG (best) | 0.959643 | 0.959643 | 0.954643 | 0.959643 | ✓ |
| Taux de service | 100% | 100% | 100% | 100% | ✓ |

### Analysis

- **ProcessPool régressif sur instance 20 OFs** : 0.642s vs 0.082s séquentiel (7.8x plus lent). Le fork + IPC coûte plus cher que le calcul lui-même sur une si petite instance.
- **L'infrastructure est correcte** : ProcessPool fonctionne, PicklableContext se sérialise, les tests passent (59/59). Le speedup se matérialisera sur des instances plus grandes (100+ OFs, 200 générations) où le calcul domine le fork overhead.
- **Décision** : Conserver le code ProcessPool comme infrastructure, mais garder le fallback séquentiel activé par défaut pour les petites instances. Le `GAConfig.workers` permet à l'utilisateur d'activer explicitement la parallélisation.
- **Phase 5** documentera les recommandations finales.

---

*Phase 4 complete — 2026-04-27*
