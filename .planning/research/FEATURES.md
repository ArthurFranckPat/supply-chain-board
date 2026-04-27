# Research — Features

## Table Stakes (Must Optimize)

These are the optimization strategies that virtually every GA performance project applies. Not applying them would be negligent.

### 1. Profile Before Optimizing
- Run cProfile/py-spy on a real AG execution
- Identify the top 3-5 functions by cumulative time
- Focus only on those functions

### 2. Eliminate Redundant Hashing
- Current: `json.dumps(genes, sort_keys=True) + md5` on every mutation
- Better: `hash(tuple(sorted(genes.items())))` or precomputed incremental hash
- Impact: Potentially 10-50x faster per mutation

### 3. Replace deepcopy with Shallow Copy
- Current: `deepcopy(ind.genes)` — clones the entire object graph
- Better: `ind.genes.copy()` — values are ints, immutable
- Impact: 5-20x faster per clone

### 4. Reduce Decode Cost
- Current: rebuilds `material_state` from scratch for every individual
- Better: reuse precomputed structures, incremental updates
- Impact: Medium to high (depends on dataset size)

### 5. Process-Based Parallel Evaluation
- Current: ThreadPoolExecutor (GIL-bound, no real speedup)
- Better: ProcessPoolExecutor with serialized Individuals
- Impact: 2-8x on multi-core machines

## Differentiators (High-Impact Strategies)

### 6. Fitness Memoization / Caching
- Cache fitness results by gene hash
- Already partially implemented (`eval_cache` in `_evaluate_population`)
- Can be improved: global LRU cache across generations, not just per-generation

### 7. Incremental Fitness Update
- When only a few genes change (single mutation), recompute fitness incrementally
- Instead of full decode + full fitness, update only affected days/lines
- High complexity but potentially 5-10x speedup for small mutations

### 8. Early Stopping Tuning
- Current: fixed patience (20 generations), fixed delta (0.001)
- Better: adaptive patience based on population diversity
- If diversity collapses, stop immediately regardless of patience

### 9. Smarter Seeding
- Current: 1 greedy + 9 greedy variants + 90 random
- Better: adaptive ratio based on problem size
- Small problems: more greedy seeds. Large problems: more random diversity.

### 10. Operator Efficiency
- Some crossover/mutation operators are cheaper than others
- Profile which operators are used and how expensive they are
- Could disable expensive operators with low success rates

## Anti-Features (Deliberately Avoid)

### GPU Parallelism (CUDA/Numba)
- Overkill for this problem size
- Adds heavy dependency (CUDA drivers, numba)
- Serialization overhead would eat gains
- **Avoid**

### Full Rewrite in C++/Rust
- Massive effort, loses Python ecosystem benefits
- Would require rewriting the entire scheduling domain
- **Avoid**

### Distributed Computing (MPI/Ray)
- Single-machine problem, no need for cluster
- Adds unnecessary complexity
- **Avoid**

### Dynamic Operator Adaptation
- Complex meta-optimization that may not converge
- Premature optimization before baseline is fixed
- **Defer to v2**
