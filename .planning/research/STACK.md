# Research — Stack

## Domain
Optimisation de performance d'algorithme génétique en Python 3.11+ pour un système de scheduling industriel.

## Profiling Tools

| Tool | Type | Overhead | Best For | Rationale |
|------|------|----------|----------|-----------|
| **cProfile** | Tracing | High (~20-50%) | Development-time profiling | Built-in, zero setup. Good for function-level hotspots. Output readable via `pstats` or Snakeviz. |
| **py-spy** | Sampling | Very low (~1-5%) | Production / long-running | No code modification. Works on running processes. Flame graphs. Ideal for AG runs that take minutes. |
| **line_profiler** | Line-by-line | High | Micro-optimizations | `@profile` decorator. Pinpoints exact slow lines in fitness/evaluation. |
| **timeit / time.perf_counter** | Manual | None | Quick benchmarks | For comparing two implementations directly. |

**Recommendation**: Start with `cProfile` + Snakeviz for first pass, then `py-spy` for validation on real runs. Use `timeit` for micro-benchmarks of hash/copy functions.

## Parallelization

| Approach | GIL Impact | Speedup | Complexity | Recommendation |
|----------|-----------|---------|------------|----------------|
| **ThreadPoolExecutor** | Blocked by GIL | ~0-1.2x (I/O only) | Low | Current implementation. Useless for CPU-bound fitness evaluation. |
| **ProcessPoolExecutor** | Bypassed | ~N cores (2-8x typical) | Medium | **Recommended**. Each process evaluates fitness independently. Need to serialize Individual + GAContext. |
| **multiprocessing.Pool** | Bypassed | ~N cores | Medium | Same as ProcessPoolExecutor but lower-level. |
| **joblib** | Bypassed | ~N cores | Low | Simpler API than ProcessPoolExecutor. Good drop-in replacement. |
| **numba / Cython** | Bypassed | 10-100x | High | Requires rewriting hotspots in numba-compatible Python or Cython. Not worth it unless profiling shows a tight loop. |

**Key insight from research**: The NEAT-Python library explicitly removed `ThreadedEvaluator` in v1.0 because "Python's GIL prevents true parallel execution of CPU-bound code." Process-based parallelism is the standard for GA fitness evaluation.

## Data Structure Optimizations

| Technique | Speedup | When to Use |
|-----------|---------|-------------|
| **dict.copy()** vs `deepcopy()` | 5-20x | When values are immutable (ints, strings). AG genes are `{str: int}` — shallow copy is sufficient. |
| **orjson.dumps()** vs `json.dumps()` | ~10x | If JSON serialization is unavoidable. |
| **struct.pack + hash()** vs `md5+json` | ~50-100x | For dict hashing. Convert to tuple of tuples, hash natively. |
| **tuple as dict key** | N/A | Precompute hashable representations for cache keys. |
| **set/dict comprehensions** | 1.2-2x | Replace loops with comprehensions where readability allows. |

## No New Dependencies Recommended

The project already uses standard library + pandas. To keep the monorepo simple:
- Avoid adding `numba`, `cython`, `joblib`, `orjson` as dependencies
- Use `multiprocessing` (stdlib) for parallelization
- Use `cProfile` (stdlib) for profiling
- Use `copy` (stdlib) for optimized copying

If a dependency is justified by >3x speedup, document it in the decision log.
