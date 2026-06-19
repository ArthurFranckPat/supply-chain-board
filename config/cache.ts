import env from '#start/env'
import { defineConfig, store, drivers } from '@adonisjs/cache'
import type { InferStores } from '@adonisjs/cache/types'
import type { CacheSerializer } from 'bentocache/types'
import SuperJSON from 'superjson'

/**
 * Serializer superjson : le serializer par défaut de bentocache est du JSON brut
 * (`JSON.stringify`), qui détruit les `Date` (→ string ISO) et les `Map` (→ {}).
 * Or les payloads cachés ici (flux X3 avec `date: Date`, maps de ruptures) en
 * contiennent. superjson préserve Date/Map à travers l'aller-retour Redis ET la
 * couche L1 mémoire (les valeurs y sont aussi sérialisées).
 */
const superjsonSerializer: CacheSerializer = {
  serialize: (value) => SuperJSON.stringify(value),
  deserialize: (value) => SuperJSON.parse(value),
}

// memory en dev/test (aucune dépendance Redis), redis en prod (cf. .env).
const cacheStore = env.get('CACHE_STORE')

const cacheConfig = defineConfig({
  default: cacheStore,

  serializer: superjsonSerializer,

  // TTL par défaut si non précisé au point d'usage (chaque getOrSet déclare le sien).
  ttl: '5m',

  /**
   * Grace period : sert la valeur périmée si la factory échoue (X3 injoignable) —
   * reproduit le comportement « sert le cache périmé si X3 KO » qu'avait boardDataset
   * en mémoire, désormais valable cross-reboot via Redis.
   */
  grace: '12h',

  stores: {
    // Cache mémoire pur (dev local sans Redis, tests).
    memory: store().useL1Layer(drivers.memory()),

    // Store redis déclaré UNIQUEMENT si CACHE_STORE=redis. Sinon le provider résout
    // tous les stores au boot → ouvre la connexion Redis même en mode memory →
    // ECONNREFUSED en dev local sans Redis + crash de quit() au shutdown. Ne pas le
    // déclarer = aucune connexion Redis jamais résolue.
    ...(cacheStore === 'redis'
      ? {
          // Cache distribué : L1 mémoire (accès rapide intra-process) + L2 Redis
          // (persistant, partagé entre instances → cross-reboot, scale-out).
          redis: store()
            .useL1Layer(drivers.memory())
            .useL2Layer(drivers.redis({ connectionName: 'main' })),
        }
      : {}),
  },
})

export default cacheConfig

declare module '@adonisjs/cache/types' {
  interface CacheStores extends InferStores<typeof cacheConfig> {}
}
