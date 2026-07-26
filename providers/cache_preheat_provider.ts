import { type ApplicationService } from '@adonisjs/core/types'
import type { LoggerService } from '@adonisjs/core/types'
import boardDataset from '#services/board_dataset'

/**
 * Préchauffage + maintien à chaud du cache X3.
 *
 * 1. PREHEAT (boot) : la vue ORDERS (~18-20 s SOAP à froid, partagée par
 *    /programme, /ordonnancement, /ruptures, engagement poste…) et l'estimateur
 *    de conditionnement (STOCK + STOJOU sur 6 mois) sont coûteux. Sans
 *    préchauffage, le PREMIER utilisateur subit le cold start (~22 s mesuré
 *    sur le panneau engagement ; jusqu'à 86 s avant optimisation du
 *    conditionnement).
 * 2. WARMER (tick 4 min) : board:orders a un TTL de 5 min + grâce 12 h. Une
 *    nuit / un week-end sans trafic épuise la grâce → le 1er utilisateur du
 *    matin repayait le mur froid synchrone. Un tick inférieur au TTL garde la
 *    valeur vivante en permanence : fraîche → no-op ; en grâce → le SWR
 *    bentocache (timeout 0) déclenche le refresh X3 en arrière-plan. Hors
 *    requête, les creds X3 = compte de service `.env` (getX3EnvConfig).
 *    Multi-instance : le lock bentocache évite le dogpile sur la factory.
 *
 * Fire-and-forget (non bloquant), log-only en cas d'échec (X3 injoignable au
 * boot = non fatal, le cache se remplit à la 1re requête via SWR). Rien en
 * environnement `repl`/`test`.
 *
 * NB : le hook `ready()` (pas `boot()`) est utilisé car `cache` (@adonisjs/cache
 * services/main) n'est assigné qu'après les hooks `app.booted()`, exécutés
 * après le `boot()` de tous les providers — l'appeler depuis `boot()` lève
 * "Cannot read properties of undefined (reading 'namespace')".
 */

// Sous le TTL de board:orders (5 min, cf. board_dataset.ORDERS_TTL) : à chaque
// tick la valeur est soit fraîche (no-op) soit en grâce (refresh SWR background)
// → elle ne meurt jamais entre deux utilisateurs.
const WARM_INTERVAL_MS = 4 * 60 * 1000

export default class CachePreheatProvider {
  private warmTimer: ReturnType<typeof setInterval> | null = null

  constructor(protected app: ApplicationService) {}

  async ready() {
    // Pas de préchauffage en repl/test.
    if (!this.app.getEnvironment().startsWith('web')) return

    // ATTENTION au timing : `cache` (@adonisjs/cache/services/main) n'est
    // instancié qu'à l'intérieur d'un hook `app.booted()`. L'appeler pendant
    // boot() d'un provider (ici) → cache encore `undefined` →
    // "Cannot read properties of undefined (reading 'namespace')".
    // On reporte donc le préchauffage APRÈS le boot complet de l'app.
    void this.app.booted(async () => {
      const logger = await this.app.container.make('logger')
      // Fire-and-forget : on n'attend pas (le serveur doit rester responsive).
      void this.preheat(logger)
      this.startOrdersWarmer(logger)
    })
  }

  async shutdown() {
    if (this.warmTimer) clearInterval(this.warmTimer)
  }

  private async preheat(logger: LoggerService) {
    // Séquentiel, doux pour le pool SOAP X3 : orders d'abord (le plus partagé),
    // puis l'estimateur de conditionnement.
    try {
      logger.info('[cache-preheat] préchauffage board:orders…')
      await boardDataset.getOrders()
      logger.info('[cache-preheat] board:orders prêt')
    } catch (e) {
      // Non fatal : X3 peut être indispo au boot. Le cache se remplira à la 1re requête.
      logger.warn({ err: e }, '[cache-preheat] échec préchauffage orders (non fatal)')
    }
    try {
      logger.info('[cache-preheat] préchauffage estimateur conditionnement…')
      await boardDataset.getConditionnementEstimator()
      logger.info('[cache-preheat] estimateur conditionnement prêt')
    } catch (e) {
      logger.warn({ err: e }, '[cache-preheat] échec préchauffage (non fatal)')
    }
  }

  /**
   * Maintien à chaud de board:orders : un appel périodique à getOrders()
   * (sans force). Fraîche → retour instantané ; en grâce → SWR, le refresh
   * part en arrière-plan (erreurs avalées par bentocache) ; hors grâce →
   * recalcul synchrone DANS le warmer, jamais dans une requête utilisateur.
   */
  private startOrdersWarmer(logger: LoggerService) {
    this.warmTimer = setInterval(() => {
      boardDataset.getOrders().catch((e) => {
        logger.warn({ err: e }, '[cache-warmer] échec refresh board:orders (non fatal)')
      })
    }, WARM_INTERVAL_MS)
    // Ne jamais retenir le process vivant pour ce timer (tests, shutdown).
    this.warmTimer.unref()
  }
}
