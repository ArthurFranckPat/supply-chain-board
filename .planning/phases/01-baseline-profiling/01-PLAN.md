---
plan: "01"
wave: 1
phase: "01-baseline-profiling"
name: "Create profiling script profile_ga.py"
depends_on: []
files_modified:
  - "apps/planning-engine/production_planning/scheduling/ga/scripts/profile_ga.py"
autonomous: true
requirements_addressed: ["PERF-01"]
---

# Plan 01: Create profiling script profile_ga.py

**Objective:** Create a cProfile-based profiling wrapper that runs the GA on synthetic data and produces a `.pstats` file.

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/scripts/benchmark_ga.py
- apps/planning-engine/production_planning/scheduling/ga/scripts/audit_bom_coverage.py
- apps/planning-engine/production_planning/scheduling/ga/engine.py
- apps/planning-engine/production_planning/scheduling/ga/config.py
- apps/planning-engine/tests/ga/test_engine_integration.py
</read_first>

<action>
Create `apps/planning-engine/production_planning/scheduling/ga/scripts/profile_ga.py`.

The script must:

1. **Import pattern:** Follow existing scripts (relative imports from parent package):
   ```python
   from __future__ import annotations
   import cProfile
   import pstats
   from datetime import date
   from pathlib import Path
   from ..config import GAConfig, default_ga_config
   from ..decoder import GAContext
   from ..engine import run_ga
   ```

2. **Synthetic context factory:** Port `_make_context()` from `tests/ga/test_engine_integration.py`. Use same parameters:
   - `n_of=20` (20 OFs for representative profiling)
   - `n_days=5` (5 workdays)
   - `n_lines=2` (PP_830, PP_153)
   - Use `CandidateOF` with realistic `charge_hours=2.0 + (i % 3)`

3. **Main profile function:**
   - Create GAContext via adapted `_make_context()`
   - Create GAConfig via `default_ga_config()` with `max_generations=10` (enough to capture representative decoding/fitness cycles)
   - Run `cProfile.runctx("run_ga(ctx)", globals(), locals(), str(PROFILE_OUTPUT))`

4. **Output paths:**
   - `PROFILE_OUTPUT = Path(".planning/research/profiling/profile_ga.pstats")`
   - Create parent directory if missing

5. **Shell entry point:**
   ```python
   if __name__ == "__main__":
       main()
   ```
</action>

<acceptance_criteria>
- File `apps/planning-engine/production_planning/scheduling/ga/scripts/profile_ga.py` exists and is not empty
- File imports `cProfile`, `run_ga`, `GAConfig`, `GAContext`, `CandidateOF` successfully (no ImportError)
- File contains function `_make_context()` with parameter `n_of` defaulting to 20
- File contains `PROFILE_OUTPUT = Path(".planning/research/profiling/profile_ga.pstats")`
- File has `if __name__ == "__main__":` entry point calling `main()`
</acceptance_criteria>
</task>

## Verification

- [ ] Script runs successfully: `cd apps/planning-engine && python -m production_planning.scheduling.ga.scripts.profile_ga`
- [ ] File `.planning/research/profiling/profile_ga.pstats` exists after execution
- [ ] `pstats.Stats(".planning/research/profiling/profile_ga.pstats").total_tt` returns a positive float
- [ ] No `ImportError` or `AttributeError` in stderr
</verification>

## must_haves

- Script executes without crashing
- Produces a valid `.pstats` file
- Uses cProfile (stdlib) — no external dependencies
- Synthetic data (no ERP CSV dependency)
</must_haves>
