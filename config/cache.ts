import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, store, drivers } from '@adonisjs/cache'
import type { InferStores } from '@adonisjs/cache/types'
import type { CacheSerializer } from 'bentocache/types'
import SuperJSON from 'superjson'

/**
 * Serializer superjson : le serializer par défaut de bentocache est du JSON brut
 * (`JSON.stringify`), qui détruit les `Date` (→ string ISO) et les `Map` (→ {}).
 * Or les payloads cachés ici (flux X3 avec `date: Date`, maps de ruptures) en
 * contiennent. superjson préserve Date/Map à travers l'aller-retour L2 (fichier
 * en dev, Redis en prod).
 *
 * Le L1 mémoire, lui, ne sérialise plus (`serialize: false` ci-dessous) : les
 * objets y sont stockés tels quels, donc Date et Map y survivent nativement.
 */
const superjsonSerializer: CacheSerializer = {
  serialize: (value) => SuperJSON.stringify(value),
  deserialize: (value) => SuperJSON.parse(value),
}

/**
 * Couche L1 mémoire, SANS sérialisation.
 *
 * Par défaut bentocache sérialise aussi le L1 : chaque hit — donc en mémoire,
 * dans le process, sans I/O — repayait un `SuperJSON.parse` complet, synchrone
 * sur le thread principal. Mesuré sur les payloads du projet : 22,70 ms pour
 * 3 k OF / 8 k flux, 93,51 ms pour 10 k OF / 30 k flux. Et l'entrée était
 * stockée deux fois (objet + forme sérialisée).
 *
 * L'option n'était pas honorée avant `patches/bentocache+1.6.1.patch` : elle
 * était perdue au passage par un namespace, et tout le projet est namespacé.
 *
 * CONTREPARTIE, non négociable : un hit L1 rend désormais la MÊME référence à
 * tous les appelants. Une valeur lue depuis le cache est en LECTURE SEULE —
 * copier avant de muter. Le garde-fou est dans `app/services/cache_ns.ts` :
 * hors production, toute valeur lue est gelée en profondeur, une mutation en
 * place lève un `TypeError` au lieu de corrompre les requêtes suivantes.
 *
 * `maxSize` / `maxEntrySize` deviennent inutilisables (la taille d'un objet non
 * sérialisé n'est pas calculable) — ils n'étaient pas posés.
 */
const l1 = () => drivers.memory({ serialize: false })

// `file` en dev, `redis` en prod, `memory` en test (cf. .env).
//
// Les tests sont forcés sur `memory` quel que soit le `.env` chargé : le L2 fichier
// survit au process, deux runs de suite partageraient donc les mêmes entrées et un
// test verrait le cache d'un autre. C'est la seule couche où cette garantie tient,
// puisqu'il n'existe pas de `.env.test` dans ce dépôt.
const cacheStore = app.inTest ? 'memory' : env.get('CACHE_STORE')

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
    // Cache mémoire pur (tests). Meurt avec le process — voir `file` ci-dessous.
    memory: store().useL1Layer(l1()),

    // Dev local : L1 mémoire + L2 fichier sous `tmp/cache`, sans dépendance externe.
    //
    // Avec le store `memory` (L1 seule), TOUT le cache mourait avec le process : chaque
    // `node ace serve`, chaque redémarrage HMR rejouait les ~90 s de préchauffage X3 du
    // boot (cf. providers/cache_preheat_provider.ts) contre X3 prod. La grâce de 12 h
    // existe précisément pour éviter ça, mais elle ne peut rien couvrir si son support
    // disparaît à l'arrêt. Le L2 fichier lui donne ce support — c'est le pendant local du
    // « persistant cross-reboot » que le L2 Redis apporte en prod.
    //
    // Déclaré inconditionnellement : contrairement à Redis, le driver n'ouvre aucune
    // connexion à la résolution (il crée le dossier au premier write), donc le résoudre
    // au boot en mode `redis` ou `memory` ne coûte rien.
    //
    // Chemin RELATIF, surtout pas `app.tmpPath('cache')` : le driver fichier de
    // bentocache passe le répertoire dans le même `#sanitizePath` que les clés, qui
    // remplace `:` par `/` pour transformer les namespaces en sous-dossiers. Sur
    // Windows il mange donc la lettre de lecteur — `C:\…\tmp\cache` devient le
    // dossier relatif `C/Users/…/tmp/cache` créé sous le CWD. L'échec est
    // silencieux (les erreurs L2 sont avalées) : le cache paraît vide alors qu'il
    // écrit ailleurs. Sans `:`, plus de mutilation possible.
    //
    // LIMITE connue, acceptée : les écritures ne sont pas atomiques (`writeFile`
    // direct, sans fichier temporaire ni `rename`) et le mutex du driver est
    // intra-process. DEUX serveurs de dev partageant ce dossier peuvent donc se
    // lire mutuellement un fichier à moitié écrit — la désérialisation échoue,
    // bentocache compte un miss et rejoue la requête X3. Observé sur `board:orders`
    // (11 Mo, fenêtre d'écriture large). C'est auto-réparateur (le miss réécrit
    // l'entrée) et cantonné au dev, la prod étant sur Redis. Le dossier étant
    // relatif au CWD, deux worktrees ne se marchent pas dessus ; seul le cas « deux
    // serveurs dans le MÊME worktree » est concerné.
    file: store()
      .useL1Layer(l1())
      .useL2Layer(drivers.file({ directory: 'tmp/cache' })),

    // Store redis déclaré UNIQUEMENT si CACHE_STORE=redis. Sinon le provider résout
    // tous les stores au boot → ouvre la connexion Redis même en mode memory →
    // ECONNREFUSED en dev local sans Redis + crash de quit() au shutdown. Ne pas le
    // déclarer = aucune connexion Redis jamais résolue.
    ...(cacheStore === 'redis'
      ? {
          // Cache distribué : L1 mémoire (accès rapide intra-process) + L2 Redis
          // (persistant, partagé entre instances → cross-reboot, scale-out).
          redis: store()
            .useL1Layer(l1())
            .useL2Layer(drivers.redis({ connectionName: 'main' })),
        }
      : {}),
  },
})

export default cacheConfig

declare module '@adonisjs/cache/types' {
  interface CacheStores extends InferStores<typeof cacheConfig> {}
}
