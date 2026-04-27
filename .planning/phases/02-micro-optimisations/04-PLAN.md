---
plan: "04"
wave: 2
phase: "02-micro-optimisations"
name: "Benchmark before/after and validate quality"
depends_on: ["01", "02", "03"]
files_modified:
  - ".planning/research/profiling/BASELINE.md"
autonomous: true
requirements_addressed: ["PERF-08", "PERF-09"]
---

# Plan 04: Benchmark and validate

**Objective:** Run the baseline benchmark with optimized code, compare against Phase 1 baseline, and verify no quality regression.

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/scripts/run_baseline.py
- .planning/research/profiling/baseline_raw.json
</read_first>

<action>
Run the baseline benchmark with the optimized GA code:

```bash
cd apps/planning-engine && python -m production_planning.scheduling.ga.scripts.run_baseline > ../../.planning/research/profiling/optimized_baseline.json 2>.planning/research/profiling/optimized_stderr.txt
```

This generates `optimized_baseline.json` with the same metrics as Phase 1 baseline.
</action>

<acceptance_criteria>
- `.planning/research/profiling/optimized_baseline.json` exists and is valid JSON
- JSON has keys `greedy`, `ga_runs`, `ga_summary`
- `ga_summary.mean_elapsed_seconds` is a positive float
- `ga_runs[0].taux_service` is between 0.0 and 1.0
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- .planning/research/profiling/baseline_raw.json
- .planning/research/profiling/optimized_baseline.json
</read_first>

<action>
Compare baseline vs optimized metrics. Use Python to compute:

```python
import json

with open(".planning/research/profiling/baseline_raw.json") as f:
    before = json.load(f)
with open(".planning/research/profiling/optimized_baseline.json") as f:
    after = json.load(f)

before_time = before["ga_summary"]["mean_elapsed_seconds"]
after_time = after["ga_summary"]["mean_elapsed_seconds"]
speedup = before_time / after_time if after_time > 0 else float('inf')

before_score = before["ga_summary"]["best_run"]["score"]
after_score = after["ga_summary"]["best_run"]["score"]

before_service = before["ga_runs"][0]["taux_service"]
after_service = after["ga_runs"][0]["taux_service"]

print(f"Speedup: {speedup:.2f}x")
print(f"Score: {before_score:.6f} → {after_score:.6f}")
print(f"Taux service: {before_service:.4f} → {after_service:.4f}")
```

Update `.planning/research/profiling/BASELINE.md` by appending a `## Phase 2 Results` section with:

```markdown
## Phase 2 Results

**Date:** [current]
**Optimizations applied:** hash_genes (native hash), clone (shallow copy), _compute_diversity (sample_size=10)

| Metric | Phase 1 (before) | Phase 2 (after) | Delta |
|--------|-----------------|-----------------|-------|
| Temps AG moyen (s) | [before] | [after] | [speedup]x |
| Score AG (best) | [before] | [after] | [delta] |
| Taux de service | [before]% | [after]% | [delta] |

### Analysis

[2-3 sentences interpreting the results]
```
</action>

<acceptance_criteria>
- `.planning/research/profiling/BASELINE.md` contains `## Phase 2 Results` section
- Speedup value is computed and displayed (> 1.0x expected)
- Score comparison shows no significant regression
- Taux de service maintained at 100% or close
- All numeric values are actual numbers, not placeholders
</acceptance_criteria>
</task>

<task id="03">
<read_first>
- apps/planning-engine/tests/ga/
</read_first>

<action>
Final validation — run the full GA test suite:

```bash
cd apps/planning-engine && python -m pytest tests/ga/ -v --tb=short
```

All tests must pass. This is the gate before declaring Phase 2 complete.
</action>

<acceptance_criteria>
- `python -m pytest tests/ga/ -v` exit code is 0
- All 59 tests show PASSED
- No unexpected warnings (the scipy wilcoxon warning from Phase 1 is acceptable)
</acceptance_criteria>
</task>

## Verification

- [ ] Optimized baseline JSON produced
- [ ] Speedup computed and > 1.0x
- [ ] Quality metrics maintained (taux_service ≥ before)
- [ ] BASELINE.md updated with Phase 2 comparison table
- [ ] All 59 GA tests pass

## must_haves

- Speedup measured and documented
- No quality regression
- BASELINE.md updated with Phase 2 results
- Full test suite passes
</must_haves>
