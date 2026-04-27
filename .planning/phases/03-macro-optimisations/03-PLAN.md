---
plan: "03"
wave: 2
phase: "03-macro-optimisations"
name: "Benchmark and validate decode + fitness optimizations"
depends_on: ["01", "02"]
files_modified:
  - ".planning/research/profiling/BASELINE.md"
  - ".planning/research/profiling/profile_ga.pstats"
autonomous: true
requirements_addressed: ["PERF-04", "PERF-05", "PERF-08", "PERF-09"]
---

# Plan 03: Benchmark and validate Phase 3

**Objective:** Run benchmark with optimized decode + fitness, reprofile to confirm hotspot reduction, and update BASELINE.md.

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/scripts/run_baseline.py
- apps/planning-engine/production_planning/scheduling/ga/scripts/profile_ga.py
</read_first>

<action>
Run benchmark and reprofiling in parallel:

```bash
# Benchmark
cd apps/planning-engine && python -m production_planning.scheduling.ga.scripts.run_baseline > ../../.planning/research/profiling/phase3_baseline.json 2>.planning/research/profiling/phase3_stderr.txt

# Reprofiling
cd apps/planning-engine && python -m production_planning.scheduling.ga.scripts.profile_ga 2>&1 | tail -20
```

Verify both complete successfully.
</action>

<acceptance_criteria>
- `.planning/research/profiling/phase3_baseline.json` exists and is valid JSON
- `ga_summary.mean_elapsed_seconds` is a positive float
- `ga_runs[0].taux_service` is between 0.0 and 1.0
- Reprofile output shows Top 5 functions (confirms profiling still works)
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- .planning/research/profiling/baseline_raw.json
- .planning/research/profiling/optimized_baseline.json
- .planning/research/profiling/phase3_baseline.json
</read_first>

<action>
Compare Phase 1 (original), Phase 2 (hash+clone), and Phase 3 (decode+fitness) metrics:

```python
import json

phases = {
    "Phase 1 (original)": "baseline_raw.json",
    "Phase 2 (hash+clone)": "optimized_baseline.json",
    "Phase 3 (decode+fitness)": "phase3_baseline.json",
}

for name, file in phases.items():
    with open(f".planning/research/profiling/{file}") as f:
        data = json.load(f)
    t = data["ga_summary"]["mean_elapsed_seconds"]
    s = data["ga_summary"]["best_run"]["score"]
    ts = data["ga_runs"][0]["taux_service"]
    print(f"{name}: {t:.4f}s, score={s:.6f}, service={ts:.2%}")
```

Compute cumulative speedup from Phase 1 → Phase 3.
</action>

<acceptance_criteria>
- All three phase files are valid JSON
- Phase 3 time ≤ Phase 2 time (speedup)
- Phase 3 score ≥ Phase 1 score (no quality regression)
- Cumulative speedup from Phase 1 computed
</acceptance_criteria>
</task>

<task id="03">
<read_first>
- .planning/research/profiling/BASELINE.md
</read_first>

<action>
Append a `## Phase 3 Results` section to BASELINE.md:

```markdown
## Phase 3 Results

**Date:** [current]
**Optimizations applied:** decode (inlined material_state + PrecomputedData reuse + setup counting), fitness (single-pass evaluation + decode.total_setups reuse)

| Metric | Phase 1 | Phase 2 | Phase 3 | Cumulative gain |
|--------|---------|---------|---------|----------------|
| Temps AG moyen (s) | 0.126 | 0.088 | [value] | [cumulative]x |
| Score AG (best) | 0.959643 | 0.959643 | [value] | [delta] |
| Taux de service | 100% | 100% | [value]% | — |

### Profiling Hotspots Update

Top GA functions after Phase 3 optimization:

| # | Function | Cum. Time (s) | % of Total |
|---|----------|---------------|------------|
| [from reprofiling output] |

### Analysis

[2-3 sentences: what improved, what's left, next steps]
```
</action>

<acceptance_criteria>
- `grep "## Phase 3 Results" .planning/research/profiling/BASELINE.md` matches
- Cumulative speedup value is computed and > 1.43x
- Hotspots table updated with post-Phase 3 profiling data
- No placeholders — all values are actual numbers

## Verification

- [ ] Phase 3 baseline JSON produced
- [ ] Cumulative speedup > 1.43x
- [ ] Quality maintained (taux_service ≥ 100% or within 2%)
- [ ] BASELINE.md updated with Phase 3 comparison table + hotspot update
- [ ] All 59 GA tests pass: `cd apps/planning-engine && python -m pytest tests/ga/ -x -q`

## must_haves

- Speedup measured and documented
- Cumulative gain > Phase 2 alone
- No quality regression
- BASELINE.md complete with 3-phase comparison
- Full test suite passes
</must_haves>
