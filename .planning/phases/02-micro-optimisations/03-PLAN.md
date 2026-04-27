---
plan: "03"
wave: 1
phase: "02-micro-optimisations"
name: "Optimize _compute_diversity() — reduce sample_size"
depends_on: []
files_modified:
  - "apps/planning-engine/production_planning/scheduling/ga/engine.py"
autonomous: true
requirements_addressed: ["PERF-07"]
---

# Plan 03: Optimize _compute_diversity()

**Objective:** Reduce `sample_size` from 20 to 10 in `_compute_diversity()` to halve the diversity computation cost (low impact alone, but cumulative with other optimizations).

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/engine.py
</read_first>

<action>
Modify `_compute_diversity()` in `engine.py`:

**Before (current):**
```python
def _compute_diversity(population: list[Individual], sample_size: int = 20) -> float:
```

**After (optimized):**
```python
def _compute_diversity(population: list[Individual], sample_size: int = 10) -> float:
```

Only change the default value of `sample_size` from 20 to 10. The function logic, return type, and algorithm remain identical.

**Rationale:** 10 random pairs provide enough statistical signal for diversity monitoring. The function is called once per generation — on a 200-generation run, this saves ~200 sample pairs × O(n_genes) lookups.
</action>

<acceptance_criteria>
- `grep "def _compute_diversity" apps/planning-engine/production_planning/scheduling/ga/engine.py` shows `sample_size: int = 10`
- `python -c "from production_planning.scheduling.ga.engine import _compute_diversity; print('import ok')"` succeeds
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/engine.py
</read_first>

<action>
Run the GA test suite — diversity change should be transparent:

```bash
cd apps/planning-engine && python -m pytest tests/ga/ -x -q --tb=short
```
</action>

<acceptance_criteria>
- `python -m pytest tests/ga/ -x -q` exit code is 0
</acceptance_criteria>
</task>

## Verification

- [ ] `_compute_diversity()` signature shows `sample_size: int = 10`
- [ ] All 59 GA tests pass
- [ ] Function still returns float in [0.0, 1.0] range

## must_haves

- sample_size default changed 20 → 10
- Function behavior unchanged otherwise
- GA tests pass
</must_haves>
