---
plan: "02"
wave: 1
phase: "03-macro-optimisations"
name: "Optimize evaluate()/fitness — single pass and reuse decode's setups"
depends_on: []
files_modified:
  - "apps/planning-engine/production_planning/scheduling/ga/fitness.py"
autonomous: true
requirements_addressed: ["PERF-05"]
---

# Plan 02: Optimize evaluate() / fitness

**Objective:** Fuse the 3 separate loops in evaluate() into one pass and reuse `total_setups` from decode (Plan 01) instead of calling `_count_setups()`.

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/fitness.py
- apps/planning-engine/production_planning/scheduling/ga/decoder.py (DecodedPlanning.total_setups)
</read_first>

<action>
Restructure `evaluate()` in `fitness.py` to use a single pass and reuse the decode-computed setup count.

**Change 1 — Replace _count_setups call with decoded.total_setups:**
The current `evaluate()` calls:
```python
decoded = decode(ind, ctx)
nb_setups = _count_setups(decoded.plannings)
```
Replace with:
```python
decoded = decode(ind, ctx)
nb_setups = decoded.total_setups  # Computed during decode in Plan 01
```

If `decoded.total_setups` is not available (backward compat), fall back to `_count_setups(decoded.plannings)`. Keep `_count_setups` defined in the file but no longer called from evaluate.

**Change 2 — Fuse taux_service, taux_ouverture, nb_jit, nb_late into a single pass:**
Currently these are 3-4 separate loops. Replace with one pass over `decoded.plannings` values:

```python
served = 0
total_candidates = 0
nb_jit = 0
nb_late = 0
total_engaged = 0.0

for line, ofs in decoded.plannings.items():
    capacity = line_capacities.get(line, 14.0) * len(workdays)
    for c in ofs:
        total_candidates += 1
        if c.scheduled_day is not None:
            if c.scheduled_day <= c.due_date:
                served += 1
                if c.scheduled_day == c.due_date:
                    nb_jit += 1
            else:
                nb_late += 1
            if not c.blocking_components:
                total_engaged += c.charge_hours
    # End of line
    total_capacity += line_capacities.get(line, 14.0) * len(workdays)

taux_service = served / max(total_candidates, 1)
taux_ouverture = total_engaged / max(total_capacity, 1.0)
```

Also handle `nb_unscheduled` from `len(decoded.unscheduled)` and `nb_blocked_components` from a count over all candidates (one more pass, but simpler).

**Keep unchanged:** `FitnessMetrics` dataclass, `_compute_taux_service`, `_compute_taux_ouverture` (can remain as fallback or be removed if no external callers).

Check if `_compute_taux_service` and `_compute_taux_ouverture` are called from outside fitness.py. If only from evaluate(), remove them. If called elsewhere, keep but document as deprecated.
</action>

<acceptance_criteria>
- `grep "_count_setups" apps/planning-engine/production_planning/scheduling/ga/fitness.py` shows the function definition but NOT a call from evaluate()
- `grep "decoded.total_setups" apps/planning-engine/production_planning/scheduling/ga/fitness.py` matches inside evaluate()
- `python -c "from production_planning.scheduling.ga.fitness import evaluate; print('import ok')"` succeeds
- evaluate() still returns `FitnessMetrics` with all fields populated
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/fitness.py
</read_first>

<action>
Run the GA test suite to validate fitness changes:

```bash
cd apps/planning-engine && python -m pytest tests/ga/ -x -q --tb=short
```

Fitness changes should be transparent — same results, different implementation.
</action>

<acceptance_criteria>
- `python -m pytest tests/ga/ -x -q` exit code is 0
- `tests/ga/test_engine_integration.py` passes (tests convergence which uses fitness)
</acceptance_criteria>
</task>

## Verification

- [ ] evaluate() uses `decoded.total_setups` instead of calling `_count_setups()`
- [ ] Single-pass loop for taux_service, taux_ouverture, nb_jit, nb_late
- [ ] FitnessMetrics returned with all fields populated correctly
- [ ] All GA tests pass with identical scores

## must_haves

- _count_setups no longer called from evaluate
- Single-pass fitness computation
- decode.total_setups reused
- GA tests pass with identical fitness scores
</must_haves>
