# Ordonnancement V2 — Plan d'implémentation détaillé (AG)

> Document compagnon de [`scheduler-genetic-algorithm.md`](./scheduler-genetic-algorithm.md).
> Ce document décrit, spec par spec, ce qui doit être codé, où, avec quelles
> signatures, quels invariants et quels tests. Aucun code n'est écrit ici —
> c'est la cible que l'implémentation devra reproduire.

---

## Table des matières

1. [Vue d'ensemble — architecture cible](#1-vue-densemble--architecture-cible)
2. [Points d'intégration dans le code existant](#2-points-dintégration-dans-le-code-existant)
3. [Spec module — `ga/config.py`](#3-spec-module--gaconfigpy)
4. [Spec module — `ga/chromosome.py`](#4-spec-module--gachromosomepy)
5. [Spec module — `ga/decoder.py`](#5-spec-module--gadecoderpy)
6. [Spec module — `ga/fitness.py`](#6-spec-module--gafitnesspy)
7. [Spec module — `ga/operators/selection.py`](#7-spec-module--gaoperatorsselectionpy)
8. [Spec module — `ga/operators/crossover.py`](#8-spec-module--gaoperatorscrossoverpy)
9. [Spec module — `ga/operators/mutation.py`](#9-spec-module--gaoperatorsmutationpy)
10. [Spec module — `ga/repair.py`](#10-spec-module--garepairpy)
11. [Spec module — `ga/evaluation/precompute.py`](#11-spec-module--gaevaluationprecomputepy)
12. [Spec module — `ga/evaluation/component_checker.py`](#12-spec-module--gaevaluationcomponent_checkerpy)
13. [Spec module — `ga/seeding.py`](#13-spec-module--gaseedingpy)
14. [Spec module — `ga/engine.py`](#14-spec-module--gaenginepy)
15. [Spec module — `ga/__init__.py`](#15-spec-module--gainitpy)
16. [Spec — Branchement `scheduling/engine.py`](#16-spec--branchement-schedulingenginepy)
17. [Spec — Branchement `services/schedule_service.py` et API](#17-spec--branchement-servicesschedule_servicepy-et-api)
18. [Spec — Branchement board-ui](#18-spec--branchement-board-ui)
19. [Spec — Tests unitaires](#19-spec--tests-unitaires)
20. [Spec — Bench harness](#20-spec--bench-harness)
21. [Configuration externalisée (`config/ga.json`)](#21-configuration-externalisée-configgajson)
22. [Plan de migration phase par phase](#22-plan-de-migration-phase-par-phase)
23. [Critères d'acceptation par phase](#23-critères-dacceptation-par-phase)
24. [Risques de mise en œuvre et garde-fous](#24-risques-de-mise-en-œuvre-et-garde-fous)

---

## 1. Vue d'ensemble — architecture cible

### 1.1 Arborescence cible

```
apps/planning-engine/production_planning/
├── scheduling/                       # existant — algo glouton V1
│   ├── engine.py                      # MODIFIÉ — dispatcher algorithm=greedy|ga
│   ├── lines.py                       # inchangé (réutilisé par décodeur AG)
│   ├── heuristics.py                  # inchangé (utilisé pour seed)
│   ├── material.py                    # inchangé
│   ├── models.py                      # inchangé (CandidateOF, DaySchedule, SchedulerResult)
│   └── ga/                            # NOUVEAU
│       ├── __init__.py                # façade : run_ga_schedule()
│       ├── config.py                  # GAConfig dataclass + load_ga_config()
│       ├── chromosome.py              # Individual, encode/clone
│       ├── decoder.py                 # decode(individual, ctx) → planning
│       ├── fitness.py                 # evaluate(individual, ctx) → FitnessResult
│       ├── seeding.py                 # build_initial_population()
│       ├── repair.py                  # repair(individual, ctx)
│       ├── engine.py                  # run_ga(ctx) — boucle principale
│       ├── operators/
│       │   ├── __init__.py
│       │   ├── selection.py           # tournoi
│       │   ├── crossover.py           # day-block, article-block, uniform
│       │   └── mutation.py            # move, swap, inversion, group, shift
│       └── evaluation/
│           ├── __init__.py
│           ├── precompute.py          # caches : matrice composant×jour, BOM aplatie
│           └── component_checker.py   # GAComponentChecker (stratégie 1 ou 2)
└── tests/
    └── ga/                            # NOUVEAU — tests unitaires
        ├── test_chromosome.py
        ├── test_decoder.py
        ├── test_fitness.py
        ├── test_operators.py
        ├── test_repair.py
        └── test_engine_integration.py
```

### 1.2 Frontière nette avec le V1

L'AG **ne réécrit aucune logique métier existante** :

- Le décodeur produit des `CandidateOF` peuplés (mêmes attributs `scheduled_day`, `start_hour`, `end_hour`, `blocking_components`).
- Les KPIs sont calculés via les **mêmes fonctions** que le glouton (`scheduling/reporting.py`, métriques de `SchedulerResult`).
- La vérification composants passe par un **adapter** autour du `RecursiveChecker` existant — pas de réimplémentation.
- La sortie est un `SchedulerResult` strictement identique en shape à celui du glouton — l'API et le board-ui n'ont pas besoin de changement de contrat.

### 1.3 Invariant cardinal

> **Le résultat de l'AG est, par construction, au moins aussi bon que le glouton.**

Mécanisme : la solution gloutonne est insérée dans la population initiale (`seeding.py`), et l'élitisme garantit qu'aucune génération ne peut perdre le meilleur individu. Si l'AG ne trouve rien de mieux, il retourne la solution gloutonne — pas de régression possible.

---

## 2. Points d'intégration dans le code existant

| Fichier existant | Modification | Nature |
|---|---|---|
| `scheduling/engine.py` `run_schedule(...)` | ajouter param `algorithm: str = "greedy"` | ajout, rétro-compat |
| `services/schedule_service.py` | propager `algorithm`, `ga_config_overrides` | ajout |
| `api/server.py` `RunScheduleRequest` | ajouter `algorithm`, `ga_seed`, `ga_config` | ajout |
| `apps/board-ui/src/api/repositories/schedule.ts` | propager les nouveaux paramètres | ajout |
| `apps/board-ui/src/views/...` | sélecteur d'algo + affichage stats AG | ajout |
| `config/weights.json` | inchangé (les poids existants restent les poids fitness) | aucun |
| `config/ga.json` | NOUVEAU — paramètres AG | ajout |

**Aucune suppression**, aucune modification de signature publique du V1.

---

## 3. Spec module — `ga/config.py`

### 3.1 Responsabilité

Centraliser tous les paramètres de l'AG. Aucune valeur magique ailleurs dans le code AG ne doit être codée en dur.

### 3.2 Structures

```python
@dataclass(frozen=True)
class GAConfig:
    # Population
    population_size: int                    # défaut 100
    max_generations: int                    # défaut 200
    elitism_rate: float                     # défaut 0.05 → 5 individus

    # Opérateurs
    crossover_probability: float            # défaut 0.8
    mutation_probability: float             # défaut 0.15
    tournament_size: int                    # défaut 3

    # Mix d'opérateurs (somme = 1.0)
    crossover_mix: dict[str, float]         # {"day_block": 0.5, "article_block": 0.3, "uniform": 0.2}
    mutation_mix: dict[str, float]          # {"move": 0.4, "swap": 0.3, "inversion": 0.15, "group": 0.1, "shift": 0.05}

    # Seeding
    seed_greedy_count: int                  # défaut 1
    seed_greedy_variants: int               # défaut 9   (mutations légères du glouton)
    seed_random_count: int                  # défaut 90  (somme = population_size)

    # Convergence
    early_stop_patience: int                # défaut 20
    early_stop_min_delta: float             # défaut 0.001 (0.1 %)

    # Évaluation composants
    component_check_strategy: Literal["full", "approximate"]   # défaut "full"
    full_check_top_k: int                   # défaut 5  (validation finale en mode "approximate")

    # Pénalités fitness (ajoutées aux poids existants w1..w4)
    setup_cost: float                       # défaut 1.0
    late_weight: float                      # défaut 5.0
    component_violation_weight: float       # défaut 100.0

    # Reproductibilité / parallélisme
    random_seed: int | None                 # défaut None
    workers: int                            # défaut 1   (Phase 4 : multiprocessing)
```

### 3.3 API publique

```python
def load_ga_config(path: str = "config/ga.json", overrides: dict | None = None) -> GAConfig: ...
def default_ga_config() -> GAConfig: ...
```

### 3.4 Contraintes

- `seed_greedy_count + seed_greedy_variants + seed_random_count == population_size` (validation au chargement, lever `ValueError` sinon).
- `sum(crossover_mix.values()) ≈ 1.0` à 1e-6, idem `mutation_mix`.
- `0 < elitism_rate < 0.5`.

### 3.5 Tests

- `test_default_config_valid` : la config par défaut passe la validation.
- `test_invalid_seed_split_raises` : si la somme ≠ population_size → ValueError.
- `test_overrides_applied` : un dict d'override remplace bien les valeurs.

---

## 4. Spec module — `ga/chromosome.py`

### 4.1 Responsabilité

Représenter un individu (= une solution candidate) et fournir les opérations atomiques de manipulation.

### 4.2 Structures

```python
@dataclass
class Individual:
    # Encodage : pour chaque OF candidat, l'index du jour cible dans workdays
    # Convention : -1 = "non planifié" (utilisé en repair quand aucun jour ne passe)
    genes: dict[str, int]                   # {num_of: day_index}

    # Cache d'évaluation
    fitness: float | None = None
    metrics: FitnessMetrics | None = None   # voir §6
    decoded: DecodedPlanning | None = None  # cache pour éviter le re-décodage
    cache_key: str | None = None            # hash(genes) pour invalidation

    rank: int | None = None                 # rang Pareto (phase NSGA-II long terme)
    age: int = 0                            # nb de générations passées dans la population
```

### 4.3 API publique

```python
def make_individual(genes: dict[str, int]) -> Individual: ...
def clone(ind: Individual) -> Individual: ...                      # deep copy genes, vide les caches
def hash_genes(genes: dict[str, int]) -> str: ...                  # stable, ordre-indépendant
def invalidate(ind: Individual) -> None: ...                       # met fitness/metrics/decoded à None
```

### 4.4 Invariants

- `genes` contient une clé pour **tout** OF candidat, jamais pour un OF non candidat.
- Toute mutation/croisement appelle `invalidate(child)` avant de retourner.
- Deux individus avec mêmes `genes` ont même `cache_key` (déterminisme).

### 4.5 Tests

- `test_clone_independence` : modifier le clone n'altère pas l'original.
- `test_hash_stability` : permuter l'ordre d'insertion → même hash.
- `test_invalidate_clears_caches`.

---

## 5. Spec module — `ga/decoder.py`

### 5.1 Responsabilité

Transformer un `Individual` (chromosome abstrait) en planning concret : `dict[line, list[CandidateOF]]` où chaque `CandidateOF` a `scheduled_day`, `start_hour`, `end_hour` peuplés.

C'est le pont entre l'AG et le reste du système. La sortie doit être **structurellement identique** à celle du glouton V1.

### 5.2 Contexte d'évaluation

```python
@dataclass
class GAContext:
    """Tout ce dont l'AG a besoin pendant un run, calculé une seule fois."""
    candidates: list[CandidateOF]                       # pool d'OF candidats
    candidates_by_id: dict[str, CandidateOF]            # index num_of → CandidateOF
    workdays: list[date]
    line_capacities: dict[str, float]                   # heures par jour par ligne
    line_min_open: dict[str, float]
    by_line: dict[str, list[str]]                       # line → liste de num_of
    loader: Any                                          # DataLoader existant
    checker: RecursiveChecker                            # checker du V1
    receptions_by_day: dict[date, list[tuple[str, float]]]
    initial_stock: dict[str, float]                     # snapshot pour reset
    weights: dict[str, float]                           # poids fitness (load_weights())
    ga_config: GAConfig
    component_checker: GAComponentChecker               # voir §12
    rng: random.Random                                  # générateur dédié
```

### 5.3 API publique

```python
def decode(individual: Individual, ctx: GAContext) -> DecodedPlanning: ...
```

```python
@dataclass
class DecodedPlanning:
    plannings: dict[str, list[CandidateOF]]             # comme SchedulerResult.plannings
    unscheduled: list[CandidateOF]
    capacity_violations: list[tuple[str, date, float]]  # (line, day, overflow_hours) — devraient être 0 après repair
    component_violations: list[tuple[str, str, date]]   # (num_of, article_manquant, jour)
```

### 5.4 Algorithme

```
decode(individual, ctx):
    réinitialiser un StockState à partir de ctx.initial_stock
    plannings = {l: [] for l in ctx.by_line}
    unscheduled = []

    Pour chaque ligne l :
        ofs_ligne = [c for c in candidates if Line(c) == l]
        Pour chaque jour j (dans l'ordre chronologique) :
            apply_receptions_for_day(stock_state, ctx.receptions_by_day, j)

            ofs_du_jour = [c for c in ofs_ligne if individual.genes[c.num_of] == idx_jour(j)]

            # Tri intra-jour (déterministe, NON random) :
            #   1. due_date croissante
            #   2. même article groupé
            #   3. num_of (tie-break)
            ofs_du_jour.sort(key=intra_day_sort_key)

            h_courant = 0
            last_article = None
            Pour chaque c dans ofs_du_jour :
                setup = SETUP_TIME_HOURS si last_article and c.article != last_article else 0
                if h_courant + setup + c.charge_hours > ctx.line_capacities[l]:
                    # overflow : décaler vers le 1er jour ouvré suivant qui a de la place
                    overflow_target = trouver_prochain_jour_avec_place(...)
                    if overflow_target is None:
                        unscheduled.append(c)
                        continue
                    individual.genes[c.num_of] = overflow_target  # SOFT repair
                    # le c sera retraité au tour de son nouveau jour
                    continue

                # composants : utiliser ctx.component_checker
                feasible, reason, blocking = ctx.component_checker.evaluate(c, j, stock_state)
                if not feasible:
                    c.blocking_components = blocking
                    c.reason = reason
                    plannings[l].append(c)  # placé "bloqué" sans consommer la capacité
                    continue

                c.scheduled_day = j
                c.start_hour = h_courant + setup
                c.end_hour = c.start_hour + c.charge_hours
                h_courant = c.end_hour
                last_article = c.article
                ctx.component_checker.reserve(c, j, stock_state)
                plannings[l].append(c)

    return DecodedPlanning(plannings, unscheduled, [], [])
```

### 5.5 Invariants

- Le décodage est **déterministe** pour un même `individual` et un même `ctx` (le RNG n'est pas utilisé ici).
- Le décodage **ne mute pas** `ctx`. Il peut muter `individual.genes` uniquement par soft-repair (overflow → jour suivant), et seulement si autorisé par le contrat (à valider en revue : alternative = retourner un individu réparé).
- Tous les `CandidateOF` du pool apparaissent **soit** dans `plannings`, **soit** dans `unscheduled`.

### 5.6 Tests

- `test_decode_empty_genes` : tous les OF dans `unscheduled`.
- `test_decode_single_of` : 1 OF, 1 ligne, 1 jour → planning correct, hours[0..charge].
- `test_decode_capacity_overflow` : 3 OF de 8h sur ligne 14h → 1 OF débordé.
- `test_decode_setup_time` : 2 OF d'articles différents → +0.25h de setup.
- `test_decode_components_unavailable` : OF avec composants manquants → `blocking_components` peuplé.
- `test_decode_idempotence` : deux appels sur même individu produisent même résultat.
- `test_decode_matches_v1_on_seed` : décodage du chromosome dérivé du glouton V1 reproduit le planning V1 (tolérance : ordre intra-jour peut différer si la règle de tri intra-jour diverge).

---

## 6. Spec module — `ga/fitness.py`

### 6.1 Responsabilité

Calculer la valeur de fitness d'un individu (mono-objectif pour Phase 1-3, vecteur pour Phase NSGA-II ultérieure).

### 6.2 Structures

```python
@dataclass
class FitnessMetrics:
    # Métriques primaires (réutilisent les définitions du V1)
    taux_service: float                     # ∈ [0, 1]
    taux_ouverture: float                   # ∈ [0, 1]
    nb_jit: int
    nb_changements_serie: int
    nb_late: int
    nb_unscheduled: int
    nb_blocked_components: int

    # Métriques composées
    setup_penalty: float                    # nb_setups × setup_cost
    late_penalty: float                     # nb_late × late_weight
    component_violation_penalty: float      # nb_blocked × violation_weight

    # Score agrégé (= fitness)
    score: float
```

### 6.3 API publique

```python
def evaluate(individual: Individual, ctx: GAContext) -> FitnessMetrics: ...

def aggregate_score(metrics: FitnessMetrics, ctx: GAContext) -> float: ...
    # score = w1·taux_service + w2·taux_ouverture + w3·jit_rate
    #         - setup_penalty - late_penalty - component_violation_penalty
```

### 6.4 Algorithme

```
evaluate(individual, ctx):
    if individual.decoded is None or individual.cache_key != hash_genes(individual.genes):
        individual.decoded = decode(individual, ctx)
        individual.cache_key = hash_genes(individual.genes)

    p = individual.decoded.plannings

    # Réutilise les calculateurs existants du V1 quand possible :
    taux_service = compute_taux_service_from_plannings(p, ctx.candidates)
    taux_ouverture = compute_taux_ouverture(p, ctx.line_capacities, ctx.workdays)
    nb_setups = count_setups(p)            # transitions article par ligne/jour
    nb_jit = count_jit(p)
    nb_late = count_late(p)
    nb_unscheduled = len(individual.decoded.unscheduled)
    nb_blocked = sum(1 for ofs in p.values() for c in ofs if c.blocking_components)

    metrics = FitnessMetrics(...)
    metrics.score = aggregate_score(metrics, ctx)
    individual.fitness = metrics.score
    individual.metrics = metrics
    return metrics
```

### 6.5 Invariants

- Si l'individu n'a pas changé, `evaluate` est O(1) (cache).
- `fitness` est **toujours fini** (pas de NaN, pas de inf) — toute violation se traduit en pénalité bornée.
- Les définitions de `taux_service`, `taux_ouverture`, `nb_jit`, `nb_changements_serie` sont **strictement les mêmes** que le V1 (extraire dans un module partagé `scheduling/metrics.py` si nécessaire).

### 6.6 Tests

- `test_fitness_cache_hit` : deux appels successifs → un seul décodage (mockable via spy).
- `test_fitness_invalidation_after_mutation` : muter genes → recalcul.
- `test_fitness_v1_seed_matches_v1_score` : individu seed-glouton → score = score V1 (tolérance numérique 1e-6).
- `test_fitness_monotone_with_violations` : ajouter un blocked → score ≤ score original.

---

## 7. Spec module — `ga/operators/selection.py`

### 7.1 Responsabilité

Sélectionner les parents pour la reproduction.

### 7.2 API publique

```python
def tournament_select(
    population: list[Individual],
    k: int,
    rng: random.Random,
) -> Individual: ...
    # tirer k individus uniformément, retourner celui avec la fitness max
```

### 7.3 Invariants

- Ne mute jamais la population.
- Ne retourne jamais un individu dont `fitness is None`.

### 7.4 Tests

- `test_tournament_picks_best_of_k` : sur 3 individus de fitness 1, 5, 3 → retourne celui à 5.
- `test_tournament_uses_rng_deterministic` : même seed → mêmes choix.

---

## 8. Spec module — `ga/operators/crossover.py`

### 8.1 Responsabilité

Recombiner deux parents en un (ou deux) enfant(s).

### 8.2 API publique

```python
def day_block_crossover(p1: Individual, p2: Individual, ctx: GAContext) -> Individual: ...
def article_block_crossover(p1: Individual, p2: Individual, ctx: GAContext) -> Individual: ...
def uniform_crossover(p1: Individual, p2: Individual, ctx: GAContext) -> Individual: ...

def crossover_dispatch(
    p1: Individual,
    p2: Individual,
    ctx: GAContext,
) -> Individual: ...
    # tire un opérateur selon ctx.ga_config.crossover_mix
```

### 8.3 Algorithmes

**`day_block_crossover`** :
```
cut = rng.randint(0, len(workdays) - 1)
enfant.genes = {
    num_of: p1.genes[num_of] if p1.genes[num_of] <= cut else p2.genes[num_of]
    for num_of in p1.genes
}
```

**`article_block_crossover`** :
```
articles = set(c.article for c in ctx.candidates)
choix_par_article = {a: rng.choice([1, 2]) for a in articles}
enfant.genes = {
    num_of: (p1 if choix_par_article[ctx.candidates_by_id[num_of].article] == 1 else p2).genes[num_of]
    for num_of in p1.genes
}
```

**`uniform_crossover`** : 50/50 par OF.

### 8.4 Invariants

- L'enfant a **exactement** les mêmes clés que les parents (pas de OF orphelin, pas de OF en double).
- L'enfant a `fitness = None` (caches invalidés).
- Aucun parent n'est muté.

### 8.5 Tests

- `test_day_block_preserves_keys`.
- `test_uniform_inherits_from_both` : statistiquement sur 100 enfants, ~50% des gènes viennent de chaque parent.
- `test_article_block_groups_articles` : tous les OF d'un article viennent du même parent.
- `test_crossover_invalidates_cache`.

---

## 9. Spec module — `ga/operators/mutation.py`

### 9.1 Responsabilité

Introduire de la diversité par modification aléatoire.

### 9.2 API publique

```python
def move_mutation(ind: Individual, ctx: GAContext) -> None: ...
def swap_mutation(ind: Individual, ctx: GAContext) -> None: ...
def inversion_mutation(ind: Individual, ctx: GAContext) -> None: ...
def article_group_mutation(ind: Individual, ctx: GAContext) -> None: ...
def shift_mutation(ind: Individual, ctx: GAContext) -> None: ...    # décale tous les OF d'une ligne d'un cran

def mutate(ind: Individual, ctx: GAContext) -> None: ...
    # selon ctx.ga_config.mutation_probability + mutation_mix
```

### 9.3 Algorithmes

| Opérateur | Pseudocode |
|---|---|
| `move` | choisir un OF au hasard, lui assigner un nouveau jour aléatoire |
| `swap` | choisir 2 OF, échanger leurs jours |
| `inversion` | choisir une ligne et un jour, inverser l'ordre des OF (encodé via num_of mais l'ordre est déduit côté décodeur — donc équivalent à : permuter les numéros num_of dans le tri intra-jour, géré via une "preference key" optionnelle dans Individual ; à formaliser) |
| `article_group` | choisir un article, regrouper tous ses OF sur un même jour aléatoire |
| `shift` | choisir une ligne, déplacer tous ses OF d'un jour vers l'avant ou l'arrière |

> **Note** : `inversion_mutation` n'a de sens que si l'encodage stocke un ordre intra-jour. Avec l'encodage Option B (jour seul), l'inversion est une no-op. **Décision à prendre en revue** : soit on enrichit `Individual.genes` avec une "preference key" (tuple `(day_index, intra_day_priority)`), soit on retire `inversion` du mix (et on incrémente `swap`).

### 9.4 Invariants

- Les mutations modifient l'individu **in place**, puis appellent `invalidate(ind)`.
- L'ensemble des clés `genes` reste inchangé.
- Une mutation ne crée jamais d'index de jour invalide (`< 0` ou `>= len(workdays)`).

### 9.5 Tests

- `test_move_changes_one_gene` : exactement 1 gène change.
- `test_swap_preserves_multiset_of_days`.
- `test_article_group_aligns_articles` : après mutation, tous les OF de l'article ciblé ont même jour.
- `test_mutation_respects_probability` : sur 10 000 appels avec p=0.1, ~1000 mutations effectives (±5%).

---

## 10. Spec module — `ga/repair.py`

### 10.1 Responsabilité

Restaurer la validité d'un individu après croisement/mutation.

### 10.2 API publique

```python
def repair(individual: Individual, ctx: GAContext) -> None: ...
```

### 10.3 Algorithme

```
repair(individual, ctx):
    # 1. Bornes : tout gène hors [0, len(workdays)-1] est ramené en bornes
    Pour chaque num_of, day_idx in genes :
        if day_idx < 0: genes[num_of] = 0
        if day_idx >= len(workdays): genes[num_of] = len(workdays) - 1

    # 2. Capacité (soft repair via décodage qui renvoie l'overflow vers j+1)
    # Le décodeur gère déjà ça — repair() s'assure juste que decode() converge :
    Pour iter in 0..MAX_REPAIR_ITERS :
        decoded = decode(individual, ctx)
        if not decoded.capacity_violations:
            break
        # le décodeur a déjà déplacé les OF — on relance pour vérifier convergence

    # 3. Composants (si stratégie = "approximate")
    if ctx.ga_config.component_check_strategy == "approximate":
        # nettoyage : aucun
        # les violations seront pénalisées via fitness

    # 4. Invalider caches
    invalidate(individual)
```

`MAX_REPAIR_ITERS = 3` (au-delà, un OF reste `unscheduled` plutôt que de boucler).

### 10.4 Invariants

- Après repair, `decode(ind, ctx).capacity_violations == []` (modulo `MAX_REPAIR_ITERS`).
- Repair est idempotent : `repair(repair(ind))` ≡ `repair(ind)`.

### 10.5 Tests

- `test_repair_clamps_out_of_bounds`.
- `test_repair_resolves_overflow_in_one_pass`.
- `test_repair_idempotent`.

---

## 11. Spec module — `ga/evaluation/precompute.py`

### 11.1 Responsabilité

Calculer les structures partagées **une seule fois par run** pour accélérer l'évaluation.

### 11.2 API publique

```python
@dataclass
class PrecomputedData:
    # Pour chaque OF : nomenclature aplatie (récursive) en composants ACHAT et leurs quantités totales
    bom_flat: dict[str, dict[str, float]]   # {num_of: {article_achat: qty_totale}}

    # Pour chaque article ACHAT : disponibilité cumulée par jour
    available_by_day: dict[str, dict[date, float]]   # {article: {day: cum_qty}}

    # Charge de chaque OF par ligne (pré-calculée)
    charge_by_of: dict[str, float]

    # Profil de production historique par article (réutilise scheduling/profiles.py)
    article_day_profile: dict[str, dict[int, float]]


def precompute(ctx_partial: GAContextPartial) -> PrecomputedData: ...
```

### 11.3 Notes

- `bom_flat` est calculé en aplatissant récursivement la nomenclature : pour chaque OF, on remonte jusqu'aux feuilles ACHAT en multipliant les `qte_lien`.
- `available_by_day[article][day] = stock_initial[article] + Σ receptions[article, j ≤ day]`.
- Cache invalidé seulement si `loader` change (= en pratique : à chaque run).

### 11.4 Tests

- `test_bom_flat_simple` : OF mono-niveau → composants directs.
- `test_bom_flat_recursive` : composant FAB → descend.
- `test_available_by_day_monotone` : `available_by_day[a][j+1] >= available_by_day[a][j]`.

---

## 12. Spec module — `ga/evaluation/component_checker.py`

### 12.1 Responsabilité

Abstraction au-dessus de `RecursiveChecker` pour permettre les deux stratégies (full / approximate) du document de fondation §4.5.

### 12.2 Structures et API

```python
class GAComponentChecker(Protocol):
    def evaluate(
        self,
        candidate: CandidateOF,
        day: date,
        stock_state: StockState,
    ) -> tuple[bool, str, str]: ...                   # (feasible, reason, blocking_csv)

    def reserve(
        self,
        candidate: CandidateOF,
        day: date,
        stock_state: StockState,
    ) -> None: ...


class FullRecursiveChecker(GAComponentChecker):
    """Délègue au RecursiveChecker existant. Stratégie 1 du doc §4.5."""

class ApproximateChecker(GAComponentChecker):
    """Vérifie via PrecomputedData.bom_flat + available_by_day, sans récursion à chaque appel.
    Stratégie 2 du doc §4.5."""

    def __init__(self, precomputed: PrecomputedData): ...
```

### 12.3 Invariants

- Pour un même `(candidate, day, stock_state)`, `FullRecursiveChecker.evaluate` doit retourner **strictement le même résultat** que la logique `availability_status` du V1.
- `ApproximateChecker.evaluate` peut être plus permissif (faux positifs autorisés) mais **jamais plus restrictif** (pas de faux négatif → on ne rejette pas un OF que le full validerait).

### 12.4 Tests

- `test_full_matches_v1` : sur 100 OF aléatoires, `FullRecursiveChecker` retourne le même verdict que `RecursiveChecker.check_of()`.
- `test_approximate_no_false_negative` : sur 100 OF, si `Full` dit feasible, `Approximate` aussi.

---

## 13. Spec module — `ga/seeding.py`

### 13.1 Responsabilité

Construire la population initiale (cf. doc fondation §4.8).

### 13.2 API publique

```python
def build_initial_population(ctx: GAContext) -> list[Individual]: ...

def seed_from_greedy(ctx: GAContext) -> Individual: ...
    # Lance le scheduler V1 (run_schedule avec algorithm="greedy") et extrait
    # genes[num_of] = workdays.index(c.scheduled_day)

def seed_random(ctx: GAContext) -> Individual: ...
def perturb_seed(seed: Individual, ctx: GAContext, fraction: float = 0.1) -> Individual: ...
```

### 13.3 Algorithme `build_initial_population`

```
seed_v1 = seed_from_greedy(ctx)
population = [seed_v1]

for _ in range(ctx.ga_config.seed_greedy_variants):
    population.append(perturb_seed(seed_v1, ctx, fraction=0.1))

for _ in range(ctx.ga_config.seed_random_count):
    population.append(seed_random(ctx))

return population
```

### 13.4 Tests

- `test_seed_from_greedy_reproduces_v1` : décoder le seed → planning identique au V1.
- `test_perturb_changes_only_fraction` : ~10% des gènes ont changé.
- `test_population_size_correct`.

---

## 14. Spec module — `ga/engine.py`

### 14.1 Responsabilité

Boucle principale de l'AG. Orchestre tout.

### 14.2 API publique

```python
@dataclass
class GAResult:
    best: Individual
    best_planning: DecodedPlanning
    metrics: FitnessMetrics
    history: list[GenerationStats]               # par génération
    n_generations_run: int
    elapsed_seconds: float
    converged_early: bool


@dataclass
class GenerationStats:
    generation: int
    best_fitness: float
    mean_fitness: float
    median_fitness: float
    diversity: float                             # voir §14.4
    elapsed_seconds: float


def run_ga(ctx: GAContext, progress_callback: Callable | None = None) -> GAResult: ...
```

### 14.3 Algorithme

```
run_ga(ctx, progress_callback):
    population = build_initial_population(ctx)

    pour ind in population : evaluate(ind, ctx)

    history = []
    no_improvement = 0
    best_ever = max(population, key=lambda i: i.fitness)

    for gen in range(ctx.ga_config.max_generations):
        elite_n = max(1, int(len(population) * ctx.ga_config.elitism_rate))
        elite = sorted(population, key=lambda i: -i.fitness)[:elite_n]

        new_pop = list(elite)

        while len(new_pop) < len(population):
            p1 = tournament_select(population, ctx.ga_config.tournament_size, ctx.rng)
            p2 = tournament_select(population, ctx.ga_config.tournament_size, ctx.rng)
            if ctx.rng.random() < ctx.ga_config.crossover_probability:
                child = crossover_dispatch(p1, p2, ctx)
            else:
                child = clone(p1)
            mutate(child, ctx)
            repair(child, ctx)
            evaluate(child, ctx)
            new_pop.append(child)

        population = new_pop
        for ind in population : ind.age += 1

        # Stats
        best_gen = max(population, key=lambda i: i.fitness)
        if best_gen.fitness > best_ever.fitness + ctx.ga_config.early_stop_min_delta:
            best_ever = best_gen
            no_improvement = 0
        else:
            no_improvement += 1

        history.append(GenerationStats(gen, best_gen.fitness, mean(...), median(...), diversity(...), ...))
        if progress_callback: progress_callback(gen, history[-1])

        if no_improvement >= ctx.ga_config.early_stop_patience:
            break

    return GAResult(best=best_ever, best_planning=best_ever.decoded, metrics=best_ever.metrics, history=history, ...)
```

### 14.4 Mesure de diversité

```
diversity = 1 - (mean_pairwise_overlap)
mean_pairwise_overlap = moyenne sur paires (i, j) de |{num_of : i.genes[num_of] == j.genes[num_of]}| / |genes|
```

Calculée sur un échantillon de 20 paires aléatoires (pas N²) pour rester O(1) par génération.

### 14.5 Invariants

- `GAResult.best.fitness >= seed_from_greedy(ctx).fitness` **toujours**.
- `len(history) == n_generations_run`.
- `progress_callback` ne lève jamais — exceptions silencées (cohérent avec le pattern `_progress` existant dans `scheduling/engine.py`).

### 14.6 Tests d'intégration

- `test_run_ga_terminates` : sur instance synthétique S, termine en < 10s.
- `test_run_ga_beats_or_equals_greedy` : sur 5 instances synthétiques, fitness AG ≥ fitness glouton.
- `test_run_ga_deterministic_with_seed` : 2 runs avec même `random_seed` → mêmes résultats.

---

## 15. Spec module — `ga/__init__.py`

### 15.1 Façade publique

Le **seul** point d'entrée que le reste du codebase doit importer.

```python
from .config import GAConfig, load_ga_config, default_ga_config
from .engine import run_ga, GAResult
from .chromosome import Individual

def run_ga_schedule(
    loader,
    *,
    reference_date: date,
    workdays: list[date],
    candidates: list[CandidateOF],
    line_capacities: dict[str, float],
    line_min_open: dict[str, float],
    weights: dict[str, float],
    ga_config: GAConfig | None = None,
    random_seed: int | None = None,
    progress_callback: Callable | None = None,
) -> GAResult: ...
```

C'est la fonction appelée depuis `scheduling/engine.run_schedule()`. Elle assemble le `GAContext`, appelle `run_ga()`, retourne le `GAResult`.

---

## 16. Spec — Branchement `scheduling/engine.py`

### 16.1 Modification de `run_schedule()`

```python
def run_schedule(
    loader,
    lines_config=None,
    *,
    reference_date=None,
    planning_workdays=PLANNING_WORKDAYS,
    demand_calendar_days=DEMAND_CALENDAR_DAYS,
    output_dir="outputs",
    weights_path="config/weights.json",
    immediate_components=False,
    blocking_components_mode="blocked",
    calendar_config=None,
    capacity_config=None,
    progress_callback=None,
    run_id=None,
    freeze_threshold_hour=12.0,
    # NOUVEAU :
    algorithm: Literal["greedy", "ga"] = "greedy",
    ga_config: GAConfig | None = None,
    ga_random_seed: int | None = None,
) -> SchedulerResult:
    ...
    # Phases 1-3 (chargement, matching, capacité) inchangées ←─ partage
    ...

    if algorithm == "greedy":
        # logique existante
        _run_daily_scheduling_loop(...)
    elif algorithm == "ga":
        from .ga import run_ga_schedule
        ga_result = run_ga_schedule(
            loader=loader,
            reference_date=reference_date,
            workdays=workdays,
            candidates=candidates,
            line_capacities=line_capacities,
            line_min_open=line_min_open,
            weights=weights,
            ga_config=ga_config,
            random_seed=ga_random_seed,
            progress_callback=lambda gen, stats: progress_callback("ga_gen", f"Génération {gen}", gen, ga_config.max_generations) if progress_callback else None,
        )
        # remplir day_plans à partir de ga_result.best_planning
        for line, ofs in ga_result.best_planning.plannings.items():
            day_plans[line] = group_by_day(ofs, workdays)
    else:
        raise ValueError(f"Unknown algorithm: {algorithm}")

    # Phase finale (KPIs, reporting) inchangée ←─ partage
    ...
    return SchedulerResult(...)
```

### 16.2 Invariants

- Si `algorithm == "greedy"` : comportement strictement identique à aujourd'hui (rétro-compat 100%).
- Le `SchedulerResult` retourné a la même structure dans les deux cas.

---

## 17. Spec — Branchement `services/schedule_service.py` et API

### 17.1 `ScheduleService.run_schedule()`

Ajouter les paramètres `algorithm`, `ga_config_overrides: dict | None`, `ga_random_seed`, et les propager à `run_schedule()`.

### 17.2 `api/server.py` — `RunScheduleRequest`

```python
class RunScheduleRequest(BaseModel):
    immediate_components: bool = False
    blocking_components_mode: str = Field(default="blocked", pattern="^(blocked|direct|both)$")
    demand_horizon_days: int = Field(default=15, ge=7, le=60)
    # NOUVEAU :
    algorithm: Literal["greedy", "ga"] = "greedy"
    ga_random_seed: int | None = None
    ga_config_overrides: dict | None = None    # ex: {"population_size": 50}
```

### 17.3 Endpoint dédié (optionnel mais recommandé)

```
POST /runs/compare
Body: RunScheduleRequest (sans algorithm)
Effet: lance les deux algos en parallèle (asyncio.gather), retourne {greedy: SchedulerResult, ga: GAResult, diff: ...}
```

Permet l'UI de comparaison (cf. doc fondation §7.5 mitigation 2).

---

## 18. Spec — Branchement board-ui

### 18.1 Repository

`apps/board-ui/src/api/repositories/schedule.ts` : ajouter le champ `algorithm` dans le payload.

### 18.2 Vue

Dans la vue d'ordonnancement (à identifier précisément lors de l'implémentation) :

- Sélecteur d'algo (`<select>`) : Glouton (V1) | Génétique (V2) | Comparaison.
- Si AG sélectionné : afficher progress bar génération par génération via SSE/polling.
- Onglet "Statistiques AG" : courbe de convergence (fitness vs génération), tableau des KPIs comparés au glouton.

### 18.3 Type côté front

```typescript
type ScheduleResult = {
  // ... champs existants
  ga_history?: { generation: number; best_fitness: number; mean_fitness: number; }[]
  ga_elapsed_seconds?: number
}
```

---

## 19. Spec — Tests unitaires

### 19.1 Pyramide

| Niveau | Volume cible | Couverture |
|---|---|---|
| Unitaires (par module) | 60-80 tests | Tous les algos isolés |
| Intégration | 10-15 tests | `run_ga` end-to-end sur instances synthétiques |
| Régression vs V1 | 5 tests | Sur fixtures réelles, AG ≥ V1 |
| Performance | 3 tests | Temps < seuils (< 30s sur Réelle M, < 60s sur Réelle L) |

### 19.2 Fixtures synthétiques

Créer `tests/ga/fixtures/`:

- `synthetic_S.py` : 30 OF, 2 lignes, 3 jours, contention faible.
- `synthetic_M.py` : 100 OF, 5 lignes, 5 jours, contention moyenne.
- `synthetic_L.py` : 300 OF, 10 lignes, 10 jours, contention forte.

Chaque fixture expose : `loader`, `expected_min_score_ga`, `expected_max_runtime`.

### 19.3 Reproductibilité

Tous les tests AG fixent `random_seed=42` pour résultats déterministes.

---

## 20. Spec — Bench harness

### 20.1 Script

`apps/planning-engine/production_planning/scripts/benchmark_ga.py` :

```python
def run_benchmark(
    instances: list[str],          # noms d'instances
    n_runs_ga: int = 30,
    output_dir: str = "outputs/bench",
) -> BenchmarkReport:
    """Pour chaque instance :
       - lance le glouton 1 fois
       - lance l'AG n_runs_ga fois (seeds différentes)
       - calcule statistiques (mean, max, std, p-value Wilcoxon, Cohen's d)
       - produit tables CSV + plots (matplotlib) :
         - boxplot scores AG vs glouton
         - convergence curve
         - heatmap charge/jour
       - sauvegarde un rapport markdown
    """
```

### 20.2 Sortie

```
outputs/bench/2026-04-26/
├── report.md                    # rapport synthétique
├── results.csv                  # données brutes (instance, run, score, taux_service, ...)
├── boxplot_<instance>.png
├── convergence_<instance>.png
└── gantt_diff_<instance>.png
```

### 20.3 Critères d'acceptation (rappel doc fondation §5.4)

Validés automatiquement par le harness (sortie : `PASS` / `FAIL`).

---

## 21. Configuration externalisée (`config/ga.json`)

### 21.1 Schéma cible

```json
{
  "population_size": 100,
  "max_generations": 200,
  "elitism_rate": 0.05,
  "crossover_probability": 0.8,
  "mutation_probability": 0.15,
  "tournament_size": 3,
  "crossover_mix": {
    "day_block": 0.5,
    "article_block": 0.3,
    "uniform": 0.2
  },
  "mutation_mix": {
    "move": 0.4,
    "swap": 0.3,
    "inversion": 0.0,
    "group": 0.2,
    "shift": 0.1
  },
  "seed_greedy_count": 1,
  "seed_greedy_variants": 9,
  "seed_random_count": 90,
  "early_stop_patience": 20,
  "early_stop_min_delta": 0.001,
  "component_check_strategy": "full",
  "full_check_top_k": 5,
  "setup_cost": 1.0,
  "late_weight": 5.0,
  "component_violation_weight": 100.0,
  "random_seed": null,
  "workers": 1
}
```

### 21.2 Tuning

Le harness §20 produit aussi un script de **grid search** sur `(population_size, max_generations, mutation_probability)` pour trouver les meilleurs paramètres par instance.

---

## 22. Plan de migration phase par phase

### Phase 1 — Infrastructure (1-2 j)

**Livrables** :
- `ga/config.py`, `ga/chromosome.py`, `ga/decoder.py`, `ga/__init__.py` (squelettes).
- `tests/ga/test_chromosome.py`, `test_decoder.py` (15-20 tests).
- Branchement `algorithm="ga"` dans `run_schedule()` mais qui retourne juste le décodage du seed glouton.

**Critère** : `run_schedule(algorithm="ga")` produit un `SchedulerResult` valide (pas encore optimisé).

### Phase 2 — Opérateurs et boucle (2-3 j)

**Livrables** :
- `ga/operators/*.py`, `ga/seeding.py`, `ga/repair.py`, `ga/engine.py`, `ga/fitness.py`.
- `tests/ga/test_operators.py`, `test_engine_integration.py`.
- Bench S synthétique : AG ≥ glouton.

**Critère** : sur `synthetic_M`, AG bat glouton en moins de 30s.

### Phase 3 — Intégration vérification composants (2-3 j)

**Livrables** :
- `ga/evaluation/precompute.py`, `ga/evaluation/component_checker.py`.
- `FullRecursiveChecker` opérationnel, `ApproximateChecker` derrière flag.
- Cache des évaluations dans `Individual`.

**Critère** : sur instance Réelle S, AG produit un planning sans plus de violations composants que le glouton, en < 30s.

### Phase 4 — Benchmarking (2-3 j)

**Livrables** :
- `scripts/benchmark_ga.py` complet.
- Rapport sur les 3 instances réelles.
- Grid search des paramètres.

**Critère** : rapport généré, statistiquement significatif (p < 0.05) sur ≥ 2 métriques primaires sur ≥ 2 instances.

### Phase 5 — Production (1-2 j)

**Livrables** :
- `RunScheduleRequest.algorithm` exposé via API.
- Sélecteur d'algo dans le board-ui.
- Endpoint `POST /runs/compare`.
- Documentation utilisateur (1 page dans `docs/`).

**Critère** : utilisateur peut lancer un AG depuis l'UI et voir la comparaison.

---

## 23. Critères d'acceptation par phase

| Phase | Critère go/no-go |
|---|---|
| 1 | `pytest tests/ga -k phase1` 100% vert. `run_schedule(algorithm="ga")` ne lève pas. |
| 2 | Sur `synthetic_M`, score AG ≥ score glouton sur 5 runs/5. Temps moyen < 10s. |
| 3 | Sur `Réelle S`, AG produit < ou = nb_blocked composants vs V1. Temps < 30s. |
| 4 | Rapport bench montre, sur Réelle M, p-value Wilcoxon < 0.05 sur taux_service ET nb_setups, avec Cohen's d ≥ 0.5. |
| 5 | Démo UI : run greedy + run ga + comparaison Gantt côte à côte fonctionnelle. |

Si un critère échoue, on **n'avance pas** à la phase suivante — on revoit l'encodage, les opérateurs, ou les paramètres.

---

## 24. Risques de mise en œuvre et garde-fous

| Risque | Mitigation prévue par cette spec |
|---|---|
| Le décodage AG diverge subtilement du V1 | `test_decode_matches_v1_on_seed` + métriques calculées par les **mêmes** fonctions partagées (extraire dans `scheduling/metrics.py`) |
| Le `RecursiveChecker` est trop lent | Stratégie 2 (ApproximateChecker) prête derrière flag dès Phase 3 + cache d'évaluation par `cache_key` |
| L'AG régresse vs V1 | Élitisme + seed glouton garantis par construction (§14.5) ; `run_ga` retourne au pire le seed |
| Dépendance circulaire `engine.py ↔ ga/__init__.py` | Import **local** (`from .ga import run_ga_schedule` dans la branche `if algorithm == "ga"`) |
| Stochasticité gêne le debug | `random_seed` optionnel, fixé à `42` dans tous les tests |
| Drift de l'encodage (ordre intra-jour) | Décision en revue Phase 2 : Option B pure (jour seul) ou enrichi avec preference key. À trancher avant Phase 2 — voir §9.3 note. |
| Le board-ui doit être adapté | Phase 5 isolée — Phases 1-4 totalement indépendantes du front |

---

## Annexe — Décisions à trancher avant code

1. **Encodage : Option B pure ou enrichie ?** L'inversion intra-jour n'a de sens qu'avec une preference key. Trancher avant Phase 2.
2. **Soft-repair dans `decode()` ou repair-only ?** Le pseudocode §5.4 mute `individual.genes` en cas d'overflow ; alternative = laisser le décodage produire `capacity_violations` et n'invoquer la mutation que dans `repair()`. La deuxième option est plus pure mais demande une 2e passe systématique.
3. **`random_seed` : par défaut fixe (reproductible) ou aléatoire (UI = run frais à chaque clic) ?** Recommandation : `null` par défaut côté API (= aléatoire), fixe dans les tests.
4. **Endpoint `/runs/compare` : MVP Phase 5 ou itération suivante ?** Pas indispensable au go-live, mais critique pour l'acceptabilité utilisateur (cf. doc fondation §7.5).
