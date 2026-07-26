import { type ApplicationService } from '@adonisjs/core/types'
import type { LoggerService } from '@adonisjs/core/types'
import boardDataset from '#services/board_dataset'
import { defaultStockRange } from '#repositories/stock_valuation_repository'
import { RETARD_LOOKBACK_DAYS } from '#services/suivi_service'

/**
 * Préchauffage + maintien à chaud du cache X3.
 *
 * 1. PREHEAT (boot) : les entrées coûteuses de `tasks()` — vue ORDERS
 *    (~18-20 s SOAP à froid, partagée par /programme, /ordonnancement,
 *    /ruptures, engagement poste…), les deux KPI du dashboard (retard 23 s,
 *    valorisation stock 9 s) et l'estimateur de conditionnement (STOCK +
 *    STOJOU sur 6 mois). Sans préchauffage, le PREMIER utilisateur subit le
 *    cold start (~22 s mesuré sur le panneau engagement ; jusqu'à 86 s avant
 *    optimisation du conditionnement).
 * 2. WARMER (tick 4 min) : ces entrées ont un TTL de 2 à 5 min + grâce 12 h.
 *    Une nuit / un week-end sans trafic épuise la grâce → le 1er utilisateur du
 *    matin repayait le mur froid synchrone. Le tick garde la valeur vivante en
 *    permanence : fraîche → no-op ; en grâce → le SWR bentocache (timeout 0)
 *    déclenche le refresh X3 en arrière-plan. Hors requête, les creds X3 =
 *    compte de service `.env` (getX3EnvConfig).
 *    Multi-instance : le lock bentocache évite le dogpile sur la factory.
 *
 * PRÉREQUIS : ne chauffer que des clés STABLES. Une clé qui embarque le jour
 * courant (`…:2026-07-26`) est neuve chaque matin — le warmer alimenterait
 * celle d'hier pendant que l'utilisateur en demande une autre. C'était le cas
 * de stock-valuation avant le passage aux buckets de période.
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
// → elle ne meurt jamais entre deux utilisateurs. Les entrées à TTL 2 min
// (stock) expirent entre deux ticks : la grâce 12 h les couvre, le tick les
// rafraîchit — c'est le comportement voulu, pas un trou.
const WARM_INTERVAL_MS = 4 * 60 * 1000

export default class CachePreheatProvider {
  private warmTimer: ReturnType<typeof setInterval> | null = null
  private warmRunning = false

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
      this.startWarmer(logger)
    })
  }

  async shutdown() {
    if (this.warmTimer) clearInterval(this.warmTimer)
  }

  /**
   * Entrées maintenues chaudes, dans l'ordre de préchauffage (séquentiel, doux
   * pour le pool SOAP X3) : orders d'abord (le plus partagé), puis les deux
   * KPI du dashboard, puis l'estimateur de conditionnement.
   *
   * Les deux KPI du dashboard sont les murs restants mesurés en requête :
   * retard 23 s (3 requêtes SOAP séquentielles), valorisation stock 9 s
   * (1 requête base + ~6 chunks STOJOU). Leurs clés de cache sont stables
   * (cf. boardDataset.getRetardKpi / getStockValuation) : le warmer les tient
   * donc vraiment à chaud, au lieu d'alimenter une clé neuve chaque jour.
   */
  private tasks(): Array<{ label: string; run: () => Promise<unknown> }> {
    return [
      { label: 'board:orders', run: () => boardDataset.getOrders() },
      {
        label: 'retard-kpi (dashboard)',
        run: () => boardDataset.getRetardKpi(new Date(), RETARD_LOOKBACK_DAYS),
      },
      {
        label: 'stock-valuation (dashboard)',
        run: () => {
          // Mêmes valeurs par défaut que le contrôleur (grain mois, 12 périodes
          // glissantes) → même clé de cache, sinon on chaufferait à côté.
          const refDate = new Date()
          const { from, to } = defaultStockRange('mois', refDate)
          return boardDataset.getStockValuation('mois', from, to, refDate)
        },
      },
      {
        label: 'estimateur conditionnement',
        run: () => boardDataset.getConditionnementEstimator(),
      },
    ]
  }

  private async preheat(logger: LoggerService) {
    for (const task of this.tasks()) {
      try {
        logger.info(`[cache-preheat] préchauffage ${task.label}…`)
        await task.run()
        logger.info(`[cache-preheat] ${task.label} prêt`)
      } catch (e) {
        // Non fatal : X3 peut être indispo au boot. Le cache se remplira à la 1re requête.
        logger.warn({ err: e }, `[cache-preheat] échec préchauffage ${task.label} (non fatal)`)
      }
    }
  }

  /**
   * Maintien à chaud : un appel périodique à chaque entrée (sans force).
   * Fraîche → retour instantané ; en grâce → SWR, le refresh part en
   * arrière-plan (erreurs avalées par bentocache) ; hors grâce → recalcul
   * synchrone DANS le warmer, jamais dans une requête utilisateur.
   *
   * Séquentiel volontairement (pas de Promise.all) : ces factories tapent
   * toutes le même pool SOAP, les lancer ensemble allonge chaque requête.
   * Un tick ne se chevauche pas avec le précédent (garde `warmRunning`).
   */
  private startWarmer(logger: LoggerService) {
    this.warmTimer = setInterval(() => {
      if (this.warmRunning) return
      this.warmRunning = true
      void (async () => {
        for (const task of this.tasks()) {
          try {
            await task.run()
          } catch (e) {
            logger.warn({ err: e }, `[cache-warmer] échec refresh ${task.label} (non fatal)`)
          }
        }
        this.warmRunning = false
      })()
    }, WARM_INTERVAL_MS)
    // Ne jamais retenir le process vivant pour ce timer (tests, shutdown).
    this.warmTimer.unref()
  }
}
