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
 *
 * EXPORTÉ pour être vérifiable directement : depuis `serialize: false`, une lecture
 * servie par le L1 ne traverse plus aucun serializer. `cache:verify` et le test
 * fonctionnel du cache passeraient donc au vert sans jamais exercer superjson —
 * ils le contrôlent maintenant sur ce symbole.
 */
export const superjsonSerializer: CacheSerializer = {
  serialize: (value) => SuperJSON.stringify(value),
  deserialize: (value) => SuperJSON.parse(value),
}

/**
 * Couche L1 mémoire, AVEC sérialisation (défaut).
 *
 * HISTORIQUE : `drivers.memory({ serialize: false })` évitait le `SuperJSON.parse`
 * à chaque hit (mesuré : 22,70 ms pour 3 k OF / 8 k flux, 93,51 ms pour 10 k OF /
 * 30 k flux) et le double stockage. ABANDONNÉ : incompatible avec un L2 dans
 * bentocache 1.6.1 — quand une entrée arrive d'un hit L2, le handler la rejoue
 * dans le L1 SOUS FORME SÉRIALISÉE (`two_tier_handler.ts` → `l1.set(key,
 * entry.serialize())`), alors que la voie normale (`cache_stack.set`) y stocke
 * l'objet brut quand `serializeL1=false`. La lecture L1 suivante passe cette
 * chaîne à `CacheEntry.fromDriver` sans désérialiseur → `TypeError: Cannot read
 * properties of undefined (reading 'deserialize')`. Constaté en dev dès
 * l'introduction du L2 fichier (boot : préchauffage puis second accès). En
 * revenant au défaut, les deux conventions d'écriture convergent et tout chemin
 * est cohérent.
 *
 * Conséquences de la désérialisation systématique :
 * - chaque hit L1 repayait SuperJSON.parse sur le thread principal (cf. mesure
 *   ci-dessus) — à re-mesurer si ça redevient chaud en profilage ;
 * - un hit rend une COPIE fraîche (plus de référence partagée mutables) : le
 *   garde-fou `Object.freeze` hors prod de `app/services/cache_ns.ts` devient
 *   redondant, on le laisse (défense en profondeur).
 */
const l1 = () => drivers.memory()

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
