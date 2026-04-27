# Requirements: AG Performance Optimization

**Defined:** 2026-04-27
**Core Value:** L'AG produit un planning meilleur ou équivalent au glouton en un temps strictement inférieur à l'actuel

## v1 Requirements

### Profiling & Mesure

- [ ] **PERF-01**: Profiler l'AG pour identifier les 3 points chauds majeurs
- [ ] **PERF-08**: Benchmark avant/après chaque optimisation avec métriques chiffrées

### Micro-Optimisations (gains rapides, faible risque)

- [ ] **PERF-02**: Accélérer le hashage des chromosomes (remplacer MD5+json.dumps)
- [ ] **PERF-03**: Accélérer le clonage des individus (remplacer deepcopy)
- [ ] **PERF-07**: Optimiser le calcul de diversité (_compute_diversity)

### Macro-Optimisations (gains moyens, risque moyen)

- [ ] **PERF-04**: Réduire le coût du décodage (material_state, component checking)
- [ ] **PERF-05**: Optimiser la fonction de fitness (réduire les passes multiples)

### Parallélisation (gain potentiel élevé, risque moyen)

- [ ] **PERF-06**: Améliorer la parallélisation (ProcessPoolExecutor vs ThreadPoolExecutor)

### Qualité & Documentation

- [ ] **PERF-09**: Maintenir la qualité des solutions (taux_service ≥ glouton ± 2%)
- [ ] **PERF-10**: Documenter les gains et recommandations finales

## v2 Requirements

### Optimisations Avancées (deferred)

- **PERF-V2-01**: Fitness incrémentale (ne recalculer que les jours affectés par une mutation)
- **PERF-V2-02**: Early stopping adaptatif basé sur la diversité
- **PERF-V2-03**: Seeding adaptatif (ratio greedy/random selon taille du problème)
- **PERF-V2-04**: Cache LRU global cross-generation pour les fitness

## Out of Scope

| Feature | Reason |
|---------|--------|
| Réécriture complète de l'AG | On optimise l'existant, pas de refonte |
| Parallélisation GPU / CUDA | Hors scope technique, dépendances lourdes |
| Changement de langage (Rust/C++) | Maintien Python, contrainte projet |
| Nouveaux opérators génétiques | Focus performance, pas features |
| NSGA-II multi-objectif | Le champ `rank` existe mais n'est pas utilisé |
| Intégration API automatique | Config override existe déjà, pas besoin de nouveau code |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PERF-01 | Phase 1 | Pending |
| PERF-08 | Phase 1 | Pending |
| PERF-02 | Phase 2 | Pending |
| PERF-03 | Phase 2 | Pending |
| PERF-07 | Phase 2 | Pending |
| PERF-04 | Phase 3 | Pending |
| PERF-05 | Phase 3 | Pending |
| PERF-06 | Phase 4 | Pending |
| PERF-09 | All phases | Pending |
| PERF-10 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-27 after research*
