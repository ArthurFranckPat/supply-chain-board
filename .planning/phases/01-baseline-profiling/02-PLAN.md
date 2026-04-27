---
plan: "02"
wave: 2
phase: "01-baseline-profiling"
name: "Run profiler and generate report"
depends_on: ["01"]
files_modified:
  - ".planning/research/profiling/profile_ga.pstats"

autonomous: true
requirements_addressed: ["PERF-01"]
---

# Plan 02: Run profiler and generate analysis report

**Objective:** Execute the profiling script, read the pstats output, and identify the top 5 hotspots by cumulative time.

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/scripts/profile_ga.py
</read_first>

<action>
Run the profiling script:

```bash
cd apps/planning-engine && python -m production_planning.scheduling.ga.scripts.profile_ga
```

Wait for completion. Verify output file exists and is non-empty:
```bash
ls -lh .planning/research/profiling/profile_ga.pstats
```
</action>

<acceptance_criteria>
- Exit code 0 from `python -m production_planning.scheduling.ga.scripts.profile_ga`
- `.planning/research/profiling/profile_ga.pstats` file size > 0 bytes
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- .planning/research/profiling/profile_ga.pstats
</read_first>

<action>
Read the pstats file and extract top 5 functions by cumulative time. Write a Python snippet or inline pstats commands:

```python
import pstats
p = pstats.Stats(".planning/research/profiling/profile_ga.pstats")
p.sort_stats("cumulative").print_stats(15)
```

**Must capture:**
1. Function name (module.function)
2. File path
3. Cumulative time
4. Cumulative time as % of total
5. Number of calls

Identify which 5 functions from the GA codebase (`production_planning.scheduling.ga.*`) consume the most cumulative time.
</action>

<acceptance_criteria>
- At least 5 functions from `production_planning.scheduling.ga.*` identified with cumulative time > 0
- Each identified function has: name, file path, cumulative time (seconds), % of total
</acceptance_criteria>
</task>

## Verification

- [ ] `.planning/research/profiling/profile_ga.pstats` exists and can be loaded by `pstats.Stats`
- [ ] `p.sort_stats("cumulative").print_stats(15)` outputs at least 5 ga-package functions
- [ ] The top function by cumulative time is clearly identifiable
- [ ] stderr is empty (no errors during profiling)

## must_haves

- Pstats file generated successfully
- Top 5 cascade leavers identified from GA package
- Each hotspot has % of total documented
</must_haves>
