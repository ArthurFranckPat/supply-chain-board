# Roadmap: AG Performance Optimization

**Created:** 2026-04-27
**Granularity:** Fine
**Mode:** YOLO

## Overview

5 phases to optimize the genetic algorithm's execution speed while maintaining solution quality. Each phase is independent where possible, with incremental validation.

| # | Phase | Goal | Requirements | Success Criteria |
|---|-------|------|-------------|------------------|
| 1 | Baseline & Profiling | Mesurer et identifier les points chauds | PERF-01, PERF-08 | 4 |
| 2 | Micro-Optimisations | Gains rapides sur hash, clone, diversité | PERF-02, PERF-03, PERF-07 | 4 |
| 3 | Macro-Optimisations | Optimiser décodage et fitness | PERF-04, PERF-05 | 3 |
| 4 | Parallélisation | Remplacer ThreadPool par ProcessPool | PERF-06 | 3 |
| 5 | Validation & Rapport | Benchmark final et documentation | PERF-09, PERF-10 | 3 |

---

## Phase 1: Baseline & Profiling

**Goal:** Établir une baseline mesurable et identifier précisément les 3 points chauds majeurs.

**Requirements:** PERF-01, PERF-08

**Plans:**
1. Ajouter un script de profiling `profile_ga.py` utilisant cProfile sur un run AG réaliste
2. Exécuter le profiler et générer un rapport `pstats` + Snakeviz
3. Identifier et documenter les top 5 fonctions par temps cumulé
4. Exécuter le benchmark AG vs glouton existant et enregistrer les métriques de référence (temps, score, taux_service)

**Success Criteria:**
1. Un rapport de profiling lisible existe dans `.planning/research/profiling/`
2. Les 3 points chauds sont nommés avec leur % de temps total
3. Les métriques de baseline (temps AG, score AG, temps glouton, score glouton) sont documentées
4. Tous les tests existants passent

**UI hint:** no

---

## Phase 2: Micro-Optimisations

**Goal:** Appliquer les optimisations rapides à fort impact (hash, clone, diversité).

**Requirements:** PERF-02, PERF-03, PERF-07

**Plans:**
1. Remplacer `hash_genes()` (MD5+json.dumps) par `hash(tuple(sorted(genes.items())))` ou équivalent rapide
2. Remplacer `clone()` (deepcopy) par `genes.copy()` dans `chromosome.py`
3. Optimiser `_compute_diversity()` : utiliser des structures plus rapides, réduire le nombre de paires échantillonnées
4. Benchmark après chaque changement et valider que la qualité ne dégrade pas

**Success Criteria:**
1. `hash_genes()` est ≥10x plus rapide (mesuré via timeit)
2. `clone()` est ≥5x plus rapide (mesuré via timeit)
3. `_compute_diversity()` est ≥1.5x plus rapide
4. Le benchmark AG vs glouton montre taux_service ≥ glouton - 2%
5. Tous les tests existants passent

**UI hint:** no

---

## Phase 3: Macro-Optimisations

**Goal:** Réduire le coût du décodage et de la fonction de fitness.

**Requirements:** PERF-04, PERF-05

**Plans:**
1. Profiler `decode()` : identifier si `build_material_state()` ou le component checking domine
2. Optimiser le décodage : réutiliser des structures précalculées, éviter les rebuilds
3. Optimiser `evaluate()` / `fitness()` : fusionner les passes multiples en une seule passe si possible
4. Benchmark et validation qualité

**Success Criteria:**
1. `decode()` est ≥1.5x plus rapide sur un run complet
2. `evaluate()` est ≥1.3x plus rapide sur un run complet
3. Le benchmark AG vs glouton montre taux_service ≥ glouton - 2%
4. Tous les tests existants passent

**UI hint:** no

---

## Phase 4: Parallélisation

**Goal:** Remplacer ThreadPoolExecutor par ProcessPoolExecutor pour une vraie accélération multi-cœur.

**Requirements:** PERF-06

**Plans:**
1. Analyser la sérialisabilité de `GAContext` et `Individual` (pickle)
2. Implémenter `_evaluate_population()` avec ProcessPoolExecutor
3. Gérer le contexte partagé (précalculé une fois, partagé entre processus)
4. Benchmark comparatif ThreadPool vs ProcessPool vs séquentiel

**Success Criteria:**
1. ProcessPoolExecutor donne un speedup ≥1.5x par rapport à ThreadPoolExecutor sur machine multi-cœur
2. Le pickling overhead est mesuré et documenté
3. Le benchmark AG vs glouton montre taux_service ≥ glouton - 2%
4. Tous les tests existants passent

**UI hint:** no

---

## Phase 5: Validation & Rapport

**Goal:** Benchmark final complet et documentation des gains.

**Requirements:** PERF-09, PERF-10

**Plans:**
1. Exécuter le benchmark statistique complet (30 runs AG vs glouton) avec la version optimisée
2. Comparer les métriques avant/après (temps, score, taux_service, taux_ouverture)
3. Rédiger un rapport `.planning/research/PERFORMANCE_REPORT.md` avec les gains chiffrés
4. Documenter les recommandations pour les optimisations v2 (incrémental, adaptive stopping)

**Success Criteria:**
1. Le rapport montre un speedup global mesurable (target: ≥2x)
2. La qualité des solutions est maintenue (taux_service ≥ glouton - 2%)
3. Les recommandations v2 sont documentées
4. Tous les tests existants passent

**UI hint:** no

---

## Dependencies

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5
   │           │           │           │           │
   └───────────┴───────────┴───────────┴───────────┘
              (all depend on baseline metrics)
```

Phases 2-4 can be partially parallel if independent sub-optimizations are identified, but sequential validation is safer.

---

*Roadmap created: 2026-04-27*
