---
plan: "02"
wave: 1
phase: "02-micro-optimisations"
name: "Optimize clone() — replace deepcopy with shallow copy"
depends_on: []
files_modified:
  - "apps/planning-engine/production_planning/scheduling/ga/chromosome.py"
autonomous: true
requirements_addressed: ["PERF-03"]
---

# Plan 02: Optimize clone()

**Objective:** Replace `deepcopy(ind.genes)` with `ind.genes.copy()` for ~20x speedup on cloning (22% of GA time).

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/chromosome.py
</read_first>

<action>
Modify `clone()` in `chromosome.py`:

**Before (current):**
```python
def clone(ind: Individual) -> Individual:
    return make_individual(genes=deepcopy(ind.genes))
```

**After (optimized):**
```python
def clone(ind: Individual) -> Individual:
    return make_individual(genes=ind.genes.copy())
```

**Rationale:** `ind.genes` is `dict[str, int]` — both keys (strings) and values (ints) are immutable. A shallow `.copy()` creates a new dict with the same key-value references, which is exactly what's needed since mutations assign new day indices (ints) to keys, never mutate existing int objects.

Check if `deepcopy` is used elsewhere in `chromosome.py`. If it's the only use, remove `from copy import deepcopy`. Otherwise keep the import.
</action>

<acceptance_criteria>
- `grep "def clone" apps/planning-engine/production_planning/scheduling/ga/chromosome.py -A 2` shows `ind.genes.copy()` not `deepcopy(ind.genes)`
- `python -c "from production_planning.scheduling.ga.chromosome import clone, make_individual; orig = make_individual({'a':1,'b':2}); c = clone(orig); c.genes['a'] = 99; assert orig.genes['a'] == 1"` passes (proves independence)
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/chromosome.py
</read_first>

<action>
Run the GA test suite to verify clone change doesn't break mutation/crossover:

```bash
cd apps/planning-engine && python -m pytest tests/ga/ -x -q --tb=short
```

Particularly important: operator tests (`test_operators.py`) which extensively use `clone()` before mutation.
</action>

<acceptance_criteria>
- `python -m pytest tests/ga/ -x -q` exit code is 0
- Specifically `tests/ga/test_operators.py` all pass
</acceptance_criteria>
</task>

## Verification

- [ ] Cloned individual has independent genes dict (modifying clone doesn't affect original)
- [ ] All 59 GA tests pass
- [ ] No `deepcopy` import removed if still used elsewhere

## must_haves

- clone uses `genes.copy()` not `deepcopy(genes)`
- Cloned genes are independent from original
- GA tests pass
</must_haves>
