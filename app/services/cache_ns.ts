import app from '@adonisjs/core/services/app'
import cache from '@adonisjs/cache/services/main'
import type { CacheProvider } from 'bentocache/types'
import { getActiveX3EnvName } from '#config/x3'

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
 * Convention de version des clés `getOrSetForever`.
 *
 * Une clé `forever` n'a pas de TTL : sa valeur reste en cache jusqu'à invalidation
 * manuelle ou changement de clé. Toute évolution sémantique de la valeur cachée
 * (logique de filtrage, enrichissement, structure du résultat) DOIT incrémenter le
 * suffixe de version dans la clé — ex. `appro:drivers:...:v12` → `v13`.
 *
 * Sans bump, la PROD sert l'ancienne valeur indéfiniment aux couples déjà cachés,
 * et le correctif ne prend effet que sur les couples jamais calculés. Ce défaut a
 * déjà eu lieu (commit f482355 : exclusion statut 6 ajoutée sans bumper v12 → v13).
 *
 * La version est suffixée à la clé, pas au namespace : deux versions coexistent
 * le temps que les nouvelles clés remplacent les anciennes (graceful rollover).
 */

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
 * Retourne le cache pour un namespace donné, CLOISONNÉ PAR ENVIRONNEMENT X3.
 *
 * À utiliser PARTOUT à la place de `cache.namespace(...)` : c'est ce qui garantit
 * à la fois le gel hors production (ci-dessus) et le cloisonnement `test`/`prod`.
 *
 * ## Pourquoi le suffixe d'environnement
 *
 * Les clés de ce cache sont GLOBALES, pas par utilisateur (issue #39, C2 — cf.
 * `board_dataset.ts`) : les données usine sont identiques pour tous, et un
 * namespace par user faisait repayer le cold start X3 (~18 s) à chaque nouvel
 * arrivant. Le raisonnement est bon, mais il s'appuyait sur une prémisse fausse,
 * écrite telle quelle dans le commentaire d'origine :
 *
 *   « Les creds X3 (via ALS) ne changent que la session, pas la donnée
 *     renvoyée → aucun risque de cloisonnement. »
 *
 * Les credentials changent le POOL (`CLTEST` vs `CLAERECO2`), donc la donnée.
 * Et les deux côtés de l'app ne résolvent pas l'environnement pareil : ce qui
 * tourne hors requête (préchauffage au boot, providers, commandes ace) prend
 * `X3_ENV`, ce qui tourne dans une requête prend l'environnement de la session
 * (cf. `getX3EnvConfig`). Avec `X3_ENV=test` et un utilisateur connecté en prod —
 * la configuration de développement courante — le préchauffage remplit
 * `board:orders` depuis CLTEST et la session prod lit cette même entrée.
 *
 * Le suffixe rend le mélange impossible sans rien retirer au partage : tous les
 * utilisateurs d'un MÊME environnement continuent de se réchauffer mutuellement.
 *
 * Même règle que `ReplicaGate` (`env-mismatch`), posée au même endroit qu'elle :
 * un chokepoint, pas une vérification recopiée dans chaque appelant.
 *
 * ## Conséquence assumée
 *
 * En développement, le préchauffage remplit désormais `…:test` pendant qu'une
 * session prod lit `…:prod` : elle paie donc le chemin froid au lieu de se voir
 * servir la mauvaise donnée. C'est le bon compromis — froid vaut mieux que faux.
 * En déploiement, `X3_ENV` vaut celui des utilisateurs et le préchauffage
 * réchauffe de nouveau le bon namespace.
 *
 * L'environnement est lu à CHAQUE appel, jamais capturé : tous les appelants
 * passent par `() => cacheNs(...)` ou l'appellent dans le corps d'une fonction,
 * donc la résolution a lieu dans le contexte de la requête courante. Ne jamais
 * hisser un `cacheNs(...)` au niveau module — il figerait l'environnement du boot
 * pour toutes les requêtes.
 */
/** Composition du namespace effectif. Pure, exportée pour être testable : le
 *  fallback `X3_ENV` est figé au boot par AdonisJS (`env.get()` ne relit pas
 *  `process.env`), donc un test ne peut pas le faire varier à chaud. */
export function envScopedNamespace(name: string, envName: string): string {
  return `${name}:${envName}`
}

export function cacheNs(name: string): CacheProvider {
  const provider = cache.namespace(envScopedNamespace(name, getActiveX3EnvName()))
  return app.inProduction ? provider : guard(provider)
}
