/**
 * Borne GLOBALE de concurrence des lectures X3 (#183).
 *
 * LE TROU QUE CE MODULE FERME. `config/database.ts` pose `pool: { max: 4 }` sur
 * la connexion Lucid `x3` et documente ce 4 comme la concurrence acceptable
 * contre Syracuse. Ce n'en était pas une : `max: 4` ne contraint QUE le chemin
 * Lucid. Dix-sept fichiers (`grep -rln "new X3Database" app commands providers`)
 * instancient leur propre `X3Database`, chacune avec son knex et son propre
 * `pool: { min: 1, max: 1 }` — 36 instanciations au total. Elles s'ignorent
 * mutuellement et ignorent le pool Lucid. La concurrence réelle de l'app contre
 * X3 n'était donc plafonnée NULLE PART : elle valait le nombre d'appelants
 * simultanés, pas 4.
 *
 * C'est la « limite connue, non traitée » annoncée en fin du commit perf de
 * #183. La suppression de la réplique a retiré le gros consommateur (8 à 11 h de
 * ZSOAPSQL par jour et par instance, cf. le journal d'ingestion archivé), et
 * l'alignement des TTL a retiré les ~360 reconstructions quotidiennes de
 * `stock-valuation`. Restait le fait structurel : rien n'empêche l'app d'ouvrir
 * vingt requêtes SOAP d'un coup sur un ERP qui, sous `ZSOAPSQL` (O(n²), CPU côté
 * serveur), s'écroule bien avant.
 *
 * OÙ, ET POURQUOI ICI. Le point d'étranglement est `sendSoap` : `X3Connection
 * .query` est son seul appelant (`grep -rn "sendSoap\|callSoap" app tests`), et
 * toute lecture SQL X3 passe par `X3Connection`, que l'appelant vienne du pool
 * Lucid ou d'une `X3Database` isolée. Borner ici borne tout le monde, sans avoir
 * à unifier 36 instanciations de knex ni à toucher un seul repository.
 *
 * CE QUI N'EST PAS BORNÉ, ET C'EST VOULU. `object_client`, `run_client` et
 * `print_server_client` spawnent leur propre curl vers le même Syracuse. Ils
 * sont hors de cette file : ce sont des écritures et des impressions déclenchées
 * par un geste utilisateur, unitaires, sans rapport avec le volume de ZSOAPSQL
 * qui a saturé l'ERP. Les mettre derrière la même file ferait attendre un
 * affermissement d'OF derrière un préchauffage — mauvais arbitrage.
 *
 * ATTENDRE PLUTÔT QU'ÉCHOUER, mais pas indéfiniment. Même raisonnement que
 * `acquireConnectionTimeout` dans `config/database.ts` : les lectures passent par
 * bentocache en SWR (`timeout: 0`), donc un appelant qui a une valeur en grâce
 * est servi instantanément et c'est le refresh d'arrière-plan qui fait la queue.
 * Une file sans plafond serait en revanche une fuite : au-delà de
 * `QUEUE_WAIT_MS`, l'attente est abandonnée avec une erreur explicite.
 *
 * ARITHMÉTIQUE DES BORNES — les trois nombres vont ensemble, ne pas en bouger un
 * seul :
 *
 *   file (120 s) + curl (`--max-time 120`, `execFile timeout` 125 s) = 245 s
 *   245 s < 250 s = `acquireConnectionTimeout` du pool Lucid
 *
 * C'est la raison du 120 s. Un appelant du pool Lucid tient son slot pendant
 * qu'il fait la queue ici : si la file pouvait durer plus que le pool n'attend,
 * la file DEVIENDRAIT la cause de la famine qu'elle est censée éviter. La borne
 * vaut pour UNE tentative ; `X3Connection` en fait deux (`retries = 1`), et ce
 * doublement pré-existe à cette file.
 */

/** Concurrence simultanée par défaut. Le 4 de `config/database.ts`, enfin vrai. */
const DEFAULT_MAX = 4

/** Attente maximale dans la file. Cf. « arithmétique des bornes » ci-dessus. */
const DEFAULT_QUEUE_WAIT_MS = 120_000

/**
 * Erreur d'abandon de file.
 *
 * Son message évite délibérément tous les mots-clés de `TRANSIENT_ERRORS`
 * (`connection.ts`) — `curl`, `timeout`, `connection`, `refused`,
 * `resultxml is nil`. Une file saturée n'est PAS un incident transitoire à
 * réessayer : le réessai remettrait le même appelant au bout de la même file,
 * pendant que la file est justement trop longue. On échoue franchement.
 */
export class X3QueueSaturatedError extends Error {
  constructor(waitedMs: number, max: number) {
    super(
      `File d'accès X3 saturée : abandon après ${waitedMs} ms d'attente ` +
        `(${max} lectures simultanées au plus, X3_MAX_CONCURRENCY).`
    )
    this.name = 'X3QueueSaturatedError'
  }
}

/**
 * Lu à chaque acquisition, et non figé au chargement du module : un test peut
 * poser la valeur avant d'appeler, et l'exploitation peut la changer sans
 * toucher au code. Une valeur absente, non numérique ou < 1 retombe sur le
 * défaut — on ne laisse pas une faute de frappe dans un `.env` supprimer la
 * borne sans bruit.
 */
function resolveLimit(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback
}

type Release = () => void

interface Waiter {
  resolve: (release: Release) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  queuedAt: number
}

let inFlight = 0
const queue: Waiter[] = []

/**
 * Une libération est IDEMPOTENTE : `withX3Slot` la joue dans un `finally`, et un
 * double appel (rejet puis nettoyage) rendrait deux slots pour un seul pris,
 * ce qui desserrerait la borne silencieusement à chaque erreur.
 *
 * Le slot libéré est passé DIRECTEMENT au premier de la file, sans repasser par
 * `inFlight` : le compteur reste constant, et la file est strictement FIFO — pas
 * de famine du plus ancien appelant sous charge continue.
 */
function makeRelease(): Release {
  let released = false
  return () => {
    if (released) return
    released = true

    const next = queue.shift()
    if (next) {
      clearTimeout(next.timer)
      next.resolve(makeRelease())
      return
    }
    inFlight -= 1
  }
}

function acquire(): Promise<Release> {
  const max = resolveLimit('X3_MAX_CONCURRENCY', DEFAULT_MAX)

  if (inFlight < max) {
    inFlight += 1
    return Promise.resolve(makeRelease())
  }

  const waitMs = resolveLimit('X3_QUEUE_WAIT_MS', DEFAULT_QUEUE_WAIT_MS)

  return new Promise<Release>((resolve, reject) => {
    const waiter: Waiter = {
      resolve,
      reject,
      queuedAt: Date.now(),
      timer: setTimeout(() => {
        const index = queue.indexOf(waiter)
        if (index >= 0) queue.splice(index, 1)
        reject(new X3QueueSaturatedError(Date.now() - waiter.queuedAt, max))
      }, waitMs),
    }
    // Ne jamais retenir le process vivant pour une attente (tests, shutdown).
    waiter.timer.unref?.()
    queue.push(waiter)
  })
}

/**
 * Exécute `run` en tenant un des slots de concurrence X3.
 *
 * Sûr vis-à-vis de l'interblocage : `run` est ici toujours une feuille (le spawn
 * de curl), elle ne réacquiert jamais de slot. NE PAS envelopper avec ceci du
 * code qui déclenche lui-même une lecture X3 — ce serait le seul moyen de créer
 * un cycle d'attente sur cette file.
 */
export async function withX3Slot<T>(run: () => Promise<T>): Promise<T> {
  const release = await acquire()
  try {
    return await run()
  } finally {
    release()
  }
}

/** Instantané pour le diagnostic (`PERF_TRACE=1`) et les tests. */
export function x3ConcurrencyStats(): { inFlight: number; queued: number; max: number } {
  return {
    inFlight,
    queued: queue.length,
    max: resolveLimit('X3_MAX_CONCURRENCY', DEFAULT_MAX),
  }
}
