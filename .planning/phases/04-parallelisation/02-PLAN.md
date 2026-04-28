---
plan: "02"
wave: 1
phase: "04-parallelisation"
name: "Implement ProcessPoolExecutor in _evaluate_population()"
depends_on: ["01"]
files_modified:
  - "apps/planning-engine/production_planning/scheduling/ga/engine.py"
autonomous: true
requirements_addressed: ["PERF-06"]
---

# Plan 02: Implement ProcessPoolExecutor

**Objective:** Replace ThreadPoolExecutor with ProcessPoolExecutor in `_evaluate_population()`, using PicklableContext for cross-process data transfer.

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/engine.py
- apps/planning-engine/production_planning/scheduling/ga/decoder.py (GAContext)
</read_first>

<action>
Rewrite `_evaluate_population()` in `engine.py` to use `ProcessPoolExecutor`.

**New implementation:**
```python
from concurrent.futures import ProcessPoolExecutor

def _evaluate_population(
    population: list[Individual],
    ctx: GAContext,
    workers: int = 1,
) -> None:
    """Évalue une population avec ProcessPoolExecutor + fallback séquentiel."""
    if workers <= 1:
        # Sequential path (no overhead)
        for ind in population:
            _eval_one(ind)
        return

    # Pre-compute picklable context once
    pctx = _make_picklable(ctx)
    
    # Identify unevaluated individuals
    to_evaluate = [ind for ind in population if ind.fitness is None]
    if not to_evaluate:
        return
    
    try:
        with ProcessPoolExecutor(max_workers=workers) as executor:
            # Map: each worker calls _eval_one_parallel(ind, pctx)
            list(executor.map(
                _eval_one_parallel,
                to_evaluate,
                [pctx] * len(to_evaluate),
            ))
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(
            f"ProcessPoolExecutor failed ({exc}), falling back to sequential"
        )
        for ind in to_evaluate:
            if ind.fitness is None:
                _eval_one(ind)
```

**New worker function** (module-level, required by pickle):
```python
def _eval_one_parallel(ind: Individual, pctx: PicklableContext) -> None:
    """Worker function for ProcessPoolExecutor. Reconstructs minimal GAContext."""
    if ind.fitness is not None:
        return
    # Reconstruct GAContext from picklable data
    # (only fields needed by evaluate/decode)
    from .decoder import GAContext
    ctx = GAContext(
        candidates=[],
        candidates_by_id=pctx.candidates_by_id,
        workdays=pctx.workdays,
        line_capacities=pctx.line_capacities,
        line_min_open=pctx.line_min_open,
        by_line=pctx.by_line,
        loader=None,
        checker=None,
        receptions_by_day=pctx.receptions_by_day,
        initial_stock=pctx.initial_stock,
        weights=pctx.weights,
        ga_config=pctx.ga_config,
        component_checker=None,
    )
    from .fitness import evaluate
    evaluate(ind, ctx)
```

**Remove** the old `ThreadPoolExecutor` import and `eval_cache` dict (no longer shared between processes).

**Keep** the old `_eval_one` function name but redirect to the new parallel path. Or keep both — `_eval_one` for sequential, `_eval_one_parallel` for multi-process.

Also add `if __name__ == "__main__":` guard at the bottom of engine.py for macOS/Windows compatibility (ProcessPoolExecutor requires it).
</action>

<acceptance_criteria>
- `grep "ProcessPoolExecutor" apps/planning-engine/production_planning/scheduling/ga/engine.py` matches
- `grep "ThreadPoolExecutor" apps/planning-engine/production_planning/scheduling/ga/engine.py` returns no match
- `grep "def _eval_one_parallel" apps/planning-engine/production_planning/scheduling/ga/engine.py` matches (module-level function)
- `python -c "from production_planning.scheduling.ga.engine import _evaluate_population, _eval_one_parallel; print('imports ok')"` succeeds
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/engine.py
</read_first>

<action>
Run the GA test suite — this must work with the new ProcessPoolExecutor:

```bash
cd apps/planning-engine && python -m pytest tests/ga/ -x -q --tb=short
```

Tests should use the sequential path (workers=1 in test configs), so they should pass regardless of ProcessPool behavior.
</action>

<acceptance_criteria>
- `python -m pytest tests/ga/ -x -q` exit code is 0
- All 59 tests pass
- No `ImportError` or `PicklingError` in test output
</acceptance_criteria>
</task>

## Verification

- [ ] ThreadPoolExecutor removed, ProcessPoolExecutor added
- [ ] _eval_one_parallel is module-level (required by pickle)
- [ ] Fallback sequential path works when workers=1
- [ ] All 59 GA tests pass
- [ ] engine.py has `if __name__ == "__main__":` guard for macOS/Windows

## must_haves

- ProcessPoolExecutor replaces ThreadPoolExecutor
- PicklableContext passed to workers
- GAContext reconstructed in workers from picklable data
- Fallback sequential on failure
- GA tests pass
</must_haves>
