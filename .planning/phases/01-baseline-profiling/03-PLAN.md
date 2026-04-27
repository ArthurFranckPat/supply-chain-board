---
plan: "03"
wave: 1
phase: "01-baseline-profiling"
name: "Run baseline benchmark"
depends_on: []
files_modified:
  - ".planning/research/profiling/BASELINE.md"
autonomous: true
requirements_addressed: ["PERF-08"]
---

# Plan 03: Run baseline benchmark and capture metrics

**Objective:** Execute the existing benchmark infrastructure to record baseline execution time and quality metrics for both the GA and the greedy scheduler.

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/benchmark.py
- apps/planning-engine/tests/ga/test_engine_integration.py
- apps/planning-engine/production_planning/scheduling/ga/config.py
</read_first>

<action>
Create a lightweight benchmark runner `apps/planning-engine/production_planning/scheduling/ga/scripts/run_baseline.py` that:

1. Imports from `benchmark.py`: `BenchmarkRun`, `benchmark_instance`
2. Uses `_make_context()` from `test_engine_integration.py` (same as Plan 01) with `n_of=20, n_days=5, n_lines=2`
3. Creates `GAConfig()` with default parameters (population=100, max_generations=20 — use 20 instead of 200 to keep baseline reasonable yet representative)
4. Runs greedy AND GA benchmarks via `benchmark_instance()` with `n_runs=3` (3 runs each for stability)
5. Prints JSON-formatted results to stdout: `{ "greedy": {...}, "ga": {...} }`
6. The output must include: `elapsed_seconds`, `score`, `taux_service`, `taux_ouverture`, `nb_late`, `nb_unscheduled`, `nb_blocked_components`

The benchmark.py infrastructure already has `time.perf_counter()` timing — reuse it directly via `benchmark_instance()` which returns `InstanceResult` containing `BenchmarkRun` objects.
</action>

<acceptance_criteria>
- File `apps/planning-engine/production_planning/scheduling/ga/scripts/run_baseline.py` exists
- Script imports `benchmark_instance` from `..benchmark` successfully
- Script uses `GAConfig()` with `population_size=100`
- Script output contains `"elapsed_seconds"` key for both greedy and GA
- Script exit code is 0
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/scripts/run_baseline.py
</read_first>

<action>
Execute the baseline script and capture output:

```bash
cd apps/planning-engine && python -m production_planning.scheduling.ga.scripts.run_baseline > ../../.planning/research/profiling/baseline_raw.json 2>.planning/research/profiling/baseline_stderr.txt
```

Extract from `baseline_raw.json` the key metrics:
- **GA**: `elapsed_seconds`, `score`, `taux_service`, `taux_ouverture`, `nb_unscheduled`
- **Greedy**: same fields

Store for Plan 04 documentation.
</action>

<acceptance_criteria>
- `.planning/research/profiling/baseline_raw.json` exists and is valid JSON
- JSON object has keys `greedy` and `ga`
- GA `elapsed_seconds` > 0
- Greedy `elapsed_seconds` > 0
- GA `taux_service` is a float between 0.0 and 1.0
</acceptance_criteria>
</task>

## Verification

- [ ] `run_baseline.py` executes without errors
- [ ] `baseline_raw.json` contains both greedy and GA results
- [ ] GA time is measurable (> 0.1 seconds)
- [ ] Greedy time is measurable
- [ ] `taux_service` values are in [0.0, 1.0] range

## must_haves

- Baseline JSON with GA and greedy metrics
- Elapsed time for both algorithms documented
- Quality metrics (taux_service, taux_ouverture) captured
- Run on synthetic data matching Plan 01 context size
</must_haves>
