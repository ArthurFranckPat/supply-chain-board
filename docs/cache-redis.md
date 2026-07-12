# Cache distribué (issue #20)

Cache via [`@adonisjs/cache`](https://github.com/adonisjs/cache) (bentocache). Remplace les
caches in-memory par-process (`boardDataset`, `SuiviService`) par une couche unique
persistante cross-reboot et partageable entre instances (scale-out).

## Configuration

- `config/cache.ts` — stores + serializer + grace.
- `config/redis.ts` — connexion `main` (ioredis), utilisée par le store `redis`.
- `start/env.ts` — `CACHE_STORE`, `REDIS_HOST/PORT/PASSWORD/DB`.

### Stores

| Store    | Couches               | Usage                                 |
| -------- | --------------------- | ------------------------------------- |
| `memory` | L1 mémoire            | dev local (sans Redis), tests         |
| `redis`  | L1 mémoire + L2 Redis | prod (persistant, partagé, scale-out) |

`CACHE_STORE` choisit le store par défaut. **Le store `redis` n'est déclaré que si
`CACHE_STORE=redis`** : sinon le provider résoudrait la connexion Redis au boot (ECONNREFUSED
en local sans Redis + crash de `quit()` au shutdown).

### Serializer

Serializer **superjson** (le défaut bentocache est du JSON brut qui détruit `Date`→string et
`Map`→`{}`). Les payloads cachés contiennent des `Date` (flux X3) et des `Map` (ruptures,
emplacements) → superjson les préserve à travers Redis ET la couche L1.

### Grace period

`grace: '12h'` : sert la valeur **périmée** si la factory échoue (X3 injoignable) —
remplace l'ancien fallback in-memory « sert le cache périmé si X3 KO », désormais valable
cross-reboot.

## Conventions de clés / TTL

Clés namespacées **par utilisateur** (`<domaine>:user_<id>`) : chaque user se connecte avec
ses propres creds X3 + son env (test/prod, issue #13) → les données diffèrent → isolation
obligatoire. Fallback `<domaine>` (sans user) hors contexte HTTP (CLI, boot).

| Namespace         | Clé                | TTL   | Source                                |
| ----------------- | ------------------ | ----- | ------------------------------------- |
| `board:user_<id>` | `referential`      | 2 h   | gammes (SQLite)                       |
| `board:user_<id>` | `orders`           | 5 min | OF ouverts (X3)                       |
| `board:user_<id>` | `live:<from>:<to>` | 2 min | demande + réception + suggestion (X3) |
| `board:user_<id>` | `bom`              | 2 h   | nomenclatures (SQLite)                |
| `suivi:user_<id>` | `context`          | 2 min | snapshot brut suivi (X3 + SQLite)     |

### Invalidation

- `boardDataset.reloadAll()` → `board().clear()` (vide tout le namespace board de l'user).
- `reloadSuiviContext()` → `suivi().delete({ key: 'context' })` (déclenché par `?refresh=1`).
- `force=true` sur les getters board → `delete` ciblé avant `getOrSet`.

## Sérialisation : données brutes, pas d'instances

Le cache ne stocke que du **sérialisable**. `SuiviService` cache un snapshot brut
(`RawSuiviData` : flux, maps, entrées BOM) ; les ports domaine non sérialisables
(`MapStockProvider`, `FlowOfMatcher`, `NomenclatureBomNavigator`) sont **reconstruits à chaud**
via `assembleContext()` à chaque requête (partie CPU peu coûteuse). Même principe pour
`boardDataset` (flux/MO plats).

## Vérifier la connectivité

```bash
node ace cache:verify
```

Roundtrip set/get/delete sur le store par défaut + contrôle Date/Map. En `CACHE_STORE=redis`,
le get traverse L2 → confirme la connexion Redis.
