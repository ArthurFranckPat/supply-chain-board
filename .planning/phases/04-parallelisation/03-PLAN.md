---
plan: "03"
wave: 2
phase: "04-parallelisation"
name: "Benchmark ProcessPool vs ThreadPool vs sequential"
depends_on: ["01", "02"]
files_modified:
  - ".planning/research/profiling/BASELINE.md"
autonomous: true
requirements_addressed: ["PERF-06", "PERF-08", "PERF-09"]
---

# Plan 03: Benchmark and validate ProcessPool

**Objective:** Run benchmark with ProcessPoolExecutor, compare against Phase 3 sequential baseline, and document the speedup.

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/scripts/run_baseline.py
- apps/planning-engine/production_planning/scheduling/ga/config.py (GAConfig.workers)
</read_first>

<action>
Run the baseline benchmark with ProcessPool enabled (workers > 1):

```bash
cd apps/planning-engine && python -c "
from production_planning.scheduling.ga.scripts.run_baseline import main
import os
os.environ['GA_WORKERS'] = '4'  # Use 4 workers
main()
" > ../../.planning/research/profiling/phase4_baseline.json 2>.planning/research/profiling/phase4_stderr.txt; echo EXIT:$?
```

Alternatively, modify `run_baseline.py` to accept a `workers` parameter and run with `workers=4`.

**Note:** On the 20-OF synthetic instance, ProcessPool overhead may exceed compute time — the speedup might be minimal or even negative. This is expected. The real benefit comes on larger instances (more OFs, more generations). Document this caveat.
</action>

<acceptance_criteria>
- `.planning/research/profiling/phase4_baseline.json` exists and is valid JSON
- `ga_summary.mean_elapsed_seconds` is a positive float
- Benchmark exits with code 0 (no PicklingError)
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- .planning/research/profiling/phase3_baseline.json
- .planning/research/profiling/phase4_baseline.json
</read_first>

<action>
Compare Phase 3 (sequential optimized) vs Phase 4 (ProcessPool):

```python
import json
with open(".planning/research/profiling/phase3_baseline.json") as f: p3 = json.load(f)
with open(".planning/research/profiling/phase4_baseline.json") as f: p4 = json.load(f)

p3t = p3["ga_summary"]["mean_elapsed_seconds"]
p4t = p4["ga_summary"]["mean_elapsed_seconds"]
speedup = p3t / p4t if p4t > 0 else float('inf')

print(f"Phase 3 (sequential): {p3t:.4f}s")
print(f"Phase 4 (ProcessPool): {p4t:.4f}s")
print(f"Speedup: {speedup:.2f}x")
```

Update `.planning/research/profiling/BASELINE.md` with a `## Phase 4 Results` section containing the full 4-phase comparison table and analysis.
</action>

<acceptance_criteria>
- `grep "## Phase 4 Results" .planning/research/profiling/BASELINE.md` matches
- Speedup calculated and displayed
- Full 4-phase table present (Phase 1→2→3→4)
- Quality metrics maintained
</acceptance_criteria>
</task>

<task id="03">
<read_first>
- apps/planning-engine/tests/ga/
</read_first>

<action>
Final validation — full test suite:

```bash
cd apps/planning-engine && python -m pytest tests/ga/ -v --tb=short
```
</action>

<acceptance_criteria>
- All 59 tests pass
- No warnings other than known scipy wilcoxon
</acceptance_criteria>
</task>

## Verification

- [ ] Phase 4 baseline JSON produced
- [ ] ProcessPool works without PicklingError
- [ ] Quality maintained (taux_service, score)
- [ ] BASELINE.md updated with Phase 4 results + 4-phase comparison
- [ ] All GA tests pass

## must_haves

- ProcessPool speedup measured
- 4-phase comparison table complete
- No quality regression
- ProcessPool works on the target machine
</must_haves>
