# Research — Pitfalls

## Pitfall 1: Optimizing Without Profiling

**Warning sign**: "This looks slow, let's rewrite it."

**Reality**: The bottleneck is often not where you think. In the current AG, `json.dumps + md5` looks obviously slow, but `decode()` rebuilding `material_state` from scratch may be 10x worse.

**Prevention**:
- Phase 1 is MANDATORY profiling before any code change
- Use `cProfile` + Snakeviz for visual confirmation
- Document top 5 functions by cumulative time

**Phase to address**: Phase 1 (Baseline)

---

## Pitfall 2: ThreadPoolExecutor for CPU-Bound Work

**Warning sign**: "Let's use more threads for fitness evaluation."

**Reality**: Python's GIL prevents true parallel execution of CPU-bound code. ThreadPoolExecutor adds overhead (context switching, thread management) with zero speedup for CPU tasks. NEAT-Python removed ThreadedEvaluator for this exact reason.

**Prevention**:
- Use ProcessPoolExecutor or multiprocessing.Pool
- Serialize Individual + GAContext with pickle
- Be aware of pickling overhead for large contexts

**Phase to address**: Phase 5 (Parallelization)

---

## Pitfall 3: Degrading Solution Quality for Speed

**Warning sign**: "The user said degradation is acceptable, so let's just cut population in half."

**Reality**: Degrading quality is a last resort. The user said "if necessary" — meaning after all code optimizations are exhausted. Cutting population from 100 to 50 may halve time but also significantly hurt convergence.

**Prevention**:
- Benchmark AG vs greedy after every change
- Set a hard floor: taux_service must be ≥ greedy - 2%
- Document any quality degradation and the tradeoff

**Phase to address**: All phases

---

## Pitfall 4: Breaking the Existing Test Suite

**Warning sign**: "I'll refactor this whole module to be faster."

**Reality**: The AG has integration tests (`test_engine_integration.py`) that verify convergence and quality. A refactor that breaks these tests introduces regressions.

**Prevention**:
- Make incremental changes, not rewrites
- Run `pytest tests/ga/` after every optimization
- Keep public API signatures unchanged

**Phase to address**: All phases

---

## Pitfall 5: Over-Engineering the Cache

**Warning sign**: "Let's build a global LRU cache with TTL and eviction policies."

**Reality**: A simple dict with string keys is often sufficient. The current `eval_cache` in `_evaluate_population` already works. Over-engineering adds complexity without proportional gains.

**Prevention**:
- Start with the simplest possible cache (dict)
- Measure cache hit rate before adding complexity
- Only add LRU/fancy eviction if profiling shows memory pressure

**Phase to address**: Phase 3 (Decode/Fitness)

---

## Pitfall 6: Ignoring Pickle Overhead in Multiprocessing

**Warning sign**: "ProcessPoolExecutor will give us 8x speedup!"

**Reality**: Serializing `GAContext` (which contains DataLoader, DataFrames, etc.) for every process may be expensive. The pickling overhead can eat a significant portion of the speedup.

**Prevention**:
- Profile pickling time before committing to multiprocessing
- Consider `multiprocessing.Manager` for shared state
- Benchmark actual speedup, not theoretical

**Phase to address**: Phase 5 (Parallelization)

---

## Pitfall 7: Premature Micro-Optimizations

**Warning sign**: "I'll replace all list comprehensions with generator expressions."

**Reality**: Micro-optimizations (list vs generator, local variable lookups) give 1-5% gains. The bottlenecks are architectural (decode, hash, clone). Focus on the big wins first.

**Prevention**:
- Follow the 80/20 rule: 80% of time is in 20% of code
- Only micro-optimize after macro-optimizations are done
- Use `timeit` to verify micro-optimizations actually help

**Phase to address**: All phases
