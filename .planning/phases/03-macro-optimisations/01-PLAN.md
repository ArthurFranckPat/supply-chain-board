---
plan: "01"
wave: 1
phase: "03-macro-optimisations"
name: "Optimize decode() — inline material_state and reuse PrecomputedData"
depends_on: []
files_modified:
  - "apps/planning-engine/production_planning/scheduling/ga/decoder.py"
  - "apps/planning-engine/production_planning/scheduling/ga/decoder.py" (DecodedPlanning)
autonomous: true
requirements_addressed: ["PERF-04"]
---

# Plan 01: Optimize decode()

**Objective:** Reduce decode() cost (26.6% of GA time) by inlining `build_material_stock_state()` and reusing `PrecomputedData` from context. Also add `total_setups` to DecodedPlanning for Plan 02.

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/decoder.py
- apps/planning-engine/production_planning/scheduling/material.py
- apps/planning-engine/production_planning/scheduling/ga/evaluation/precompute.py
</read_first>

<action>
In `decoder.py`, replace the external `build_material_stock_state` call with an inline lightweight version that reuses `PrecomputedData` from `GAContext`.

**Change 1 — Add `total_setups` to DecodedPlanning:**
```python
@dataclass
class DecodedPlanning:
    plannings: dict[str, list[CandidateOF]]
    unscheduled: list[CandidateOF]
    capacity_violations: list[tuple[str, date, float]] = field(default_factory=list)
    component_violations: list[tuple[str, str, date]] = field(default_factory=list)
    total_setups: int = 0  # NEW: computed during decode for fitness reuse
```

**Change 2 — Inline material_state construction in decode():**
Replace:
```python
material_state = build_material_stock_state(ctx.loader)
```
With an inline version that builds from `ctx.initial_stock` (already a dict) and PrecomputedData. This avoids the function call overhead and the loader attribute lookups inside `build_material_stock_state`.

If PrecomputedData is available in `ctx`, use its `initial_stock` and `receptions_by_day`. Otherwise fall back to the original approach.

**Change 3 — Count setups during decoding:**
Inside the decode loop, when an OF is successfully scheduled on a day, check if the previous OF on that line/day has a different article. If so, increment a counter. At the end, set `result.total_setups = counter`.

The existing code already sorts OFs by `_intra_day_sort_key` which groups by article — so setups only happen at article transitions. Add:
```python
total_setups = 0
# ... inside the day loop, after scheduling:
if previous_of and previous_of.article != current_of.article:
    total_setups += 1
# ... at the end:
result.total_setups = total_setups
```

Keep the rest of the decode logic (capacity check, component check, hour assignment) unchanged.
</action>

<acceptance_criteria>
- `grep "build_material_stock_state" apps/planning-engine/production_planning/scheduling/ga/decoder.py` returns no match (function no longer imported)
- `grep "total_setups" apps/planning-engine/production_planning/scheduling/ga/decoder.py` matches the DecodedPlanning field definition AND the assignment at end of decode()
- `python -c "from production_planning.scheduling.ga.decoder import DecodedPlanning; d = DecodedPlanning({},[]); assert d.total_setups == 0"` passes
- The decode() function signature is unchanged: `decode(individual: Individual, ctx: GAContext) -> DecodedPlanning`
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/decoder.py
</read_first>

<action>
Run the GA test suite to validate decode changes:

```bash
cd apps/planning-engine && python -m pytest tests/ga/ -x -q --tb=short
```

The decoder tests (`test_decoder.py`) and engine integration tests must all pass.
</action>

<acceptance_criteria>
- `python -m pytest tests/ga/ -x -q` exit code is 0
- Specifically `tests/ga/test_decoder.py` all pass
- `tests/ga/test_engine_integration.py` all pass
</acceptance_criteria>
</task>

## Verification

- [ ] `build_material_stock_state` no longer imported in decoder.py
- [ ] `DecodedPlanning` has `total_setups: int = 0` field
- [ ] Material state built inline from context data
- [ ] Setup counting works (value ≥ 0, changes on article transitions)
- [ ] All GA tests pass

## must_haves

- decode() no longer calls external build_material_stock_state
- PrecomputedData reused when available
- total_setups computed during decode
- decode() signature unchanged
- GA tests pass
</must_haves>
