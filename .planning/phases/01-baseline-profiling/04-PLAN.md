---
plan: "04"
wave: 3
phase: "01-baseline-profiling"
name: "Document profiling results and baseline metrics"
depends_on: ["02", "03"]
files_modified:
  - ".planning/research/profiling/BASELINE.md"
autonomous: true
requirements_addressed: ["PERF-01", "PERF-08"]
---

# Plan 04: Document profiling results and baseline metrics

**Objective:** Compile the profiling hotspots and benchmark metrics into a single BASELINE.md reference document for downstream phases.

## Tasks

<task id="01">
<read_first>
- .planning/research/profiling/profile_ga.pstats
- .planning/research/profiling/baseline_raw.json
</read_first>

<action>
Read the pstats file to extract the top 5-10 functions from the GA package:

```python
import pstats
p = pstats.Stats(".planning/research/profiling/profile_ga.pstats")
p.sort_stats("cumulative")
p.print_stats(20)
```

Read the baseline JSON for greedy/GA metrics:

```python
import json
with open(".planning/research/profiling/baseline_raw.json") as f:
    baseline = json.load(f)
```

Gather all data needed for the markdown report.
</action>

<acceptance_criteria>
- All data extracted: 5+ function names with cumulative times, GA/greedy elapsed times, score, taux_service
- Function names include module path (e.g., `ga/engine.py:run_ga`)
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- .planning/research/profiling/baseline_raw.json
- .planning/ROADMAP.md (Phase 1 section)
</read_first>

<action>
Write `.planning/research/profiling/BASELINE.md` with this exact structure:

```markdown
# Phase 1 Baseline — AG Performance

**Date:** [current date]
**Context:** 20 OFs, 5 workdays, 2 lines (PP_830, PP_153)
**Config:** GAConfig default (population=100, max_generations=20)

## Profiling Hotspots

Top functions by cumulative time from cProfile:

| # | Function | Module | Cum. Time (s) | % of Total | Calls |
|---|----------|--------|---------------|------------|-------|
| 1 | [name]   | [file] | [seconds]     | [percent]% | [n]   |
| ... (top 5+) |

### Analysis

[1-2 sentence insight per hotspot — what does this function do, why is it expensive]

## Baseline Metrics

| Metric | Greedy | AG |
|--------|--------|-----|
| Temps d'exécution (s) | [value] | [value] |
| Score fitness | [value] | [value] |
| Taux de service | [value]% | [value]% |
| Taux d'ouverture | [value]% | [value]% |
| OF non planifiés | [value] | [value] |
| Composants bloquants | [value] | [value] |

### Key Takeaways

- [Bullet 1: AG time vs greedy time]
- [Bullet 2: Quality comparison]
- [Bullet 3: Main bottleneck identified]

## Next

Phase 2 will target these hotspots for optimization.
```

All numeric values come from the actual profiling + benchmark data.
</action>

<acceptance_criteria>
- `.planning/research/profiling/BASELINE.md` exists
- File contains section `## Profiling Hotspots` with at least 5 rows in the table
- File contains section `## Baseline Metrics` with rows for elapsed time, score, taux_service, taux_ouverture
- All `[value]` placeholders replaced with actual numbers
- File contains `## Next` section referencing Phase 2
- No `NaN`, `None`, or `[placeholder]` in final file
</acceptance_criteria>
</task>

<task id="03">
<read_first>
- .planning/research/profiling/BASELINE.md
- apps/planning-engine/tests/ga/
</read_first>

<action>
Run the full GA test suite to confirm nothing was broken by the new scripts:

```bash
cd apps/planning-engine && python -m pytest tests/ga/ -v --tb=short
```

All tests must pass. This verifies the profiling script imports didn't create import side-effects in the GA package.
</action>

<acceptance_criteria>
- `python -m pytest tests/ga/ -v` exit code is 0
- All test names show `PASSED` or `.` (no `F` or `E`)
</acceptance_criteria>
</task>

## Verification

- [ ] BASELINE.md has concrete numbers, no placeholders
- [ ] All 5+ hotspots have % of total documented
- [ ] Baseline table has both AG and greedy columns
- [ ] GA elapsed time documented and > 0
- [ ] Greedy elapsed time documented and > 0
- [ ] GA tests pass: `python -m pytest tests/ga/ -q`

## must_haves

- BASELINE.md with hotspots table (5+ rows)
- BASELINE.md with metrics table (AG + greedy)
- All numbers are actual values from execution
- GA test suite passes
</must_haves>
