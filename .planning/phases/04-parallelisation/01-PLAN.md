---
plan: "01"
wave: 1
phase: "04-parallelisation"
name: "Create PicklableContext and prove serialization works"
depends_on: []
files_modified:
  - "apps/planning-engine/production_planning/scheduling/ga/engine.py"
autonomous: true
requirements_addressed: ["PERF-06"]
---

# Plan 01: Create PicklableContext

**Objective:** Define a picklable context dataclass that holds only serializable data (no loader, checker, mock objects) and prove it survives a round-trip through ProcessPoolExecutor.

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/engine.py
- apps/planning-engine/production_planning/scheduling/ga/decoder.py (GAContext)
</read_first>

<action>
Add a `PicklableContext` dataclass in `engine.py` (or a separate `parallel.py` file) that extracts serializable data from `GAContext`:

```python
from dataclasses import dataclass
from datetime import date
from typing import Any

@dataclass
class PicklableContext:
    candidates_by_id: dict[str, Any]  # CandidateOF is a dataclass → picklable
    workdays: list[date]
    line_capacities: dict[str, float]
    line_min_open: dict[str, float]
    by_line: dict[str, list[str]]
    receptions_by_day: dict[date, list[tuple[str, float]]]
    initial_stock: dict[str, float]
    weights: dict[str, float]
    ga_config: Any  # GAConfig is a frozen dataclass → picklable
```

Also add a factory function `_make_picklable(ctx: GAContext) -> PicklableContext` that extracts these fields.

Note: Keep `PicklableContext` in `engine.py` to avoid circular imports with decoder.py where `GAContext` is defined.
</action>

<acceptance_criteria>
- `grep "class PicklableContext" apps/planning-engine/production_planning/scheduling/ga/engine.py` matches
- `python -c "from production_planning.scheduling.ga.engine import PicklableContext; import pickle; c = PicklableContext({}, [], {}, {}, {}, {}, {}, {}, None); d = pickle.loads(pickle.dumps(c)); assert d.candidates_by_id == {}"` passes
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/engine.py
</read_first>

<action>
Create a test function `_test_pickle_roundtrip()` that:
1. Creates a realistic `GAContext` using the test factory (import `_make_context` from test_engine_integration or inline a minimal version)
2. Converts to `PicklableContext`
3. Pickles and unpickles it
4. Verifies key fields survive (candidates_by_id keys, workdays dates, weights dict)

Add this as a module-level verification function, not in the hot path.

Run: `python -c "from production_planning.scheduling.ga.engine import _test_pickle_roundtrip; _test_pickle_roundtrip(); print('OK')"`
</action>

<acceptance_criteria>
- Pickle round-trip succeeds without PicklingError
- `_test_pickle_roundtrip()` returns True or raises no exception
- `CandidateOF` objects inside `candidates_by_id` survive pickling (all fields intact)
</acceptance_criteria>
</task>

## Verification

- [ ] `PicklableContext` defined and picklable
- [ ] `_make_picklable(ctx)` converts GAContext without error
- [ ] Pickle round-trip preserves all data
- [ ] `CandidateOF` fields survive serialization (num_of, article, due_date, charge_hours)

## must_haves

- PicklableContext contains no unpicklable types
- _make_picklable works on both synthetic and real contexts
- Pickle round-trip verified
</must_haves>
