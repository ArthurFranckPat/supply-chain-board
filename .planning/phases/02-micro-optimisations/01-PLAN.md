---
plan: "01"
wave: 1
phase: "02-micro-optimisations"
name: "Optimize hash_genes() — replace MD5+json with native hash"
depends_on: []
files_modified:
  - "apps/planning-engine/production_planning/scheduling/ga/chromosome.py"
autonomous: true
requirements_addressed: ["PERF-02"]
---

# Plan 01: Optimize hash_genes()

**Objective:** Replace `json.dumps() + md5` with `hash(tuple(sorted(genes.items())))` for ~10x speedup on hashing (11.9% of GA time).

## Tasks

<task id="01">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/chromosome.py
</read_first>

<action>
Modify `hash_genes()` in `chromosome.py` to replace the MD5+JSON implementation:

**Before (current):**
```python
def hash_genes(genes: dict[str, int]) -> str:
    serialized = json.dumps(genes, sort_keys=True, separators=(",", ":"))
    return hashlib.md5(serialized.encode("utf-8")).hexdigest()
```

**After (optimized):**
```python
def hash_genes(genes: dict[str, int]) -> str:
    return hex(hash(tuple(sorted(genes.items()))))
```

**Rationale:** `genes` is `{str: int}` — keys are OF numbers, values are day indices. `sorted()` ensures deterministic ordering (same hash for same dict content). `hash()` is built-in and fast. `hex()` keeps the return type as `str` for backward compatibility with `cache_key`.

Remove unused imports: `json` and `hashlib` are no longer needed for `hash_genes()`. Check if they're used elsewhere in the file first.

If `json` or `hashlib` are used elsewhere in `chromosome.py`, keep the import. Otherwise remove them.
</action>

<acceptance_criteria>
- `grep "def hash_genes" apps/planning-engine/production_planning/scheduling/ga/chromosome.py` shows `hex(hash(tuple(sorted(genes.items()))))` on the next line
- `grep "json.dumps" apps/planning-engine/production_planning/scheduling/ga/chromosome.py` returns no match or only in comments
- `grep "hashlib.md5" apps/planning-engine/production_planning/scheduling/ga/chromosome.py` returns no match or only in comments
- `python -c "from production_planning.scheduling.ga.chromosome import hash_genes; h = hash_genes({'a':1,'b':2}); assert isinstance(h, str); assert h == hash_genes({'b':2,'a':1})"` passes
</acceptance_criteria>
</task>

<task id="02">
<read_first>
- apps/planning-engine/production_planning/scheduling/ga/chromosome.py
</read_first>

<action>
Run the GA test suite to verify hash change is compatible:

```bash
cd apps/planning-engine && python -m pytest tests/ga/ -x -q --tb=short
```

The hash change should be transparent — no test should break.
</action>

<acceptance_criteria>
- `python -m pytest tests/ga/ -x -q` exit code is 0
- All test names show `PASSED` or `.` (no `F` or `E`)
</acceptance_criteria>
</task>

## Verification

- [ ] `hash_genes()` returns deterministic results: same dict → same hex string
- [ ] `hash_genes()` handles empty dict: `hash_genes({})` returns a valid hex string
- [ ] All 59 GA tests pass
- [ ] No ImportError from removed json/hashlib imports

## must_haves

- hash_genes uses `hash(tuple(sorted()))` not MD5+JSON
- Backward compatible (returns str)
- Deterministic (same input → same output)
- GA tests pass
</must_haves>
