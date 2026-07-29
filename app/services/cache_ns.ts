import app from '@adonisjs/core/services/app'
import cache from '@adonisjs/cache/services/main'
import type { CacheProvider } from 'bentocache/types'

/**
 * Accès namespacé au cache — point de passage UNIQUE.
 *
 * Pourquoi ce module plutôt que `cache.namespace(...)` en direct : le L1 mémoire
 * est en `serialize: false` (cf. `config/cache.ts`). Un hit L1 ne désérialise plus
 * rien, il rend DIRECTEMENT l'objet stocké — la même référence à tous les
 * appelants, requête après requête. Muter une valeur lue depuis le cache
 * corromprait donc toutes les lectures suivantes, sans erreur ni trace.
 *
 * Avant `serialize: false`, chaque hit rendait une copie fraîche (superjson) :
 * une mutation en place était invisible. Le gain de 22–93 ms par hit se paie de
 * cette contrainte-là, et rien dans le typage ne la rappelle.
 *
 * D'où le garde-fou : hors production, toute valeur rendue par une lecture est
 * gelée en profondeur. Une mutation en place lève alors un `TypeError` (les
 * modules ES sont en mode strict) au lieu de passer inaperçue. En production le
 * proxy n'est pas posé du tout — coût nul.
 *
 * Le contrat pour l'appelant est donc : **une valeur lue depuis le cache est en
 * lecture seule**. Copier avant de muter (`[...arr]`, `{ ...obj }`,
 * `new Map(entries)`), comme le font déjà `matchOrders` (`app/domain/orders.ts`)
 * et le constructeur de `PromiseEngine` (`app/domain/promise_engine.ts`).
 */

/** Méthodes dont la valeur de retour vient du cache et doit donc être gelée. */
const READ_METHODS = new Set(['get', 'getOrSet', 'getOrSetForever'])

/**
 * Gel récursif. `seen` casse les cycles ; sans lui un graphe d'objets avec
 * référence arrière boucle indéfiniment.
 *
 * Court-circuit sur `Object.isFrozen` : avec `serialize: false` les lectures
 * successives rendent la MÊME référence, donc la descente n'a lieu qu'une fois
 * par entrée de cache, pas à chaque lecture.
 */
function deepFreeze<T>(value: T, seen: WeakSet<object>): T {
  if (value === null || typeof value !== 'object') return value

  const obj = value as unknown as object
  if (seen.has(obj) || Object.isFrozen(obj)) return value
  seen.add(obj)

  // Map et Set : `Object.freeze` n'empêche PAS `.set()` / `.add()` — leur contenu
  // vit dans des slots internes, pas dans des propriétés. On descend quand même
  // dans les valeurs, qui sont, elles, protégeables. Les entrées de cache du
  // projet rendent des tableaux d'entries et reconstruisent la Map côté appelant
  // (cf. `getMfgMaterials`, `getOfPegs`) : ce cas ne devrait pas se présenter.
  if (obj instanceof Map) {
    for (const entry of obj.values()) deepFreeze(entry, seen)
    return value
  }
  if (obj instanceof Set) {
    for (const entry of obj.values()) deepFreeze(entry, seen)
    return value
  }

  // Date : gelable, mais `setTime()` et consorts écrivent dans un slot interne et
  // restent donc opérants. Pas de descente utile.
  if (obj instanceof Date) return Object.freeze(value)

  Object.freeze(obj)
  for (const key of Object.keys(obj)) {
    deepFreeze((obj as Record<string, unknown>)[key], seen)
  }
  return value
}

function guard(provider: CacheProvider): CacheProvider {
  return new Proxy(provider, {
    get(target, prop) {
      // Receiver volontairement omis : le rendre au getter ferait tourner les
      // accesseurs de bentocache avec `this` = proxy, et ses champs privés (`#…`)
      // lèveraient au premier accès.
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return value

      const bound = (value as (...args: unknown[]) => unknown).bind(target)

      // Un namespace enfant doit rester gardé, sinon le garde-fou se perd au
      // premier chaînage — exactement le bug qu'on vient de patcher en amont.
      if (prop === 'namespace') {
        return (name: string) => guard(bound(name) as CacheProvider)
      }

      if (!READ_METHODS.has(prop as string)) return bound

      return async (...args: unknown[]) => {
        const result = await bound(...args)
        return deepFreeze(result, new WeakSet())
      }
    },
  })
}

/**
 * Retourne le cache pour un namespace donné.
 *
 * À utiliser PARTOUT à la place de `cache.namespace(...)` : c'est ce qui garantit
 * que la valeur rendue est gelée hors production, donc qu'une mutation en place
 * est détectée en développement plutôt que subie en production.
 */
export function cacheNs(name: string): CacheProvider {
  const provider = cache.namespace(name)
  return app.inProduction ? provider : guard(provider)
}
