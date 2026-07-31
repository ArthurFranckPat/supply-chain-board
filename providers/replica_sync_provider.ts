import { type ApplicationService } from '@adonisjs/core/types'
import type { LoggerService } from '@adonisjs/core/types'
import replicaSyncService from '#services/replica_sync_service'

/**
 * Rafraîchissement périodique de la réplique complète — `orders_replica`,
 * `order_lines_replica`, `stock_replica`, `receptions_replica` (#98, lot 2 + suite
 * lot 3).
 *
 * Le lot 1 posait volontairement AUCUNE planification : « L'app ne lit pas encore
 * la réplique : la déclencher n'a donc aucun effet sur les écrans » (cf.
 * `replica_sync_service.ts`). Ce n'est plus vrai dès que `board_dataset` consulte ces
 * tables via `replicaGate` (`getOrders`/`getOrdersForWindow`, `getOpenOrderLines`,
 * `getStock`, `getReceptions`) — une réplique jamais rafraîchie se fige sur l'état
 * du dernier `node ace replica:sync` manuel et ne change plus jamais, contrairement
 * à la voie X3 directe qu'elle remplace (TTL 2-5 min selon la table). Sans ce
 * provider, activer `REPLICA_READS=true` dégraderait la fraîcheur au lieu de la
 * préserver.
 *
 * `stock_flux_replica`, `operations_replica`, `stock_detail_replica` sont
 * volontairement HORS `syncAll()` — charge X3 non arbitrée, cf. les commentaires de
 * `syncStockFlux`/`syncOperations`/`syncStockDetail`. Restent des commandes
 * manuelles (`node ace replica:sync --only=…`).
 *
 * `syncAll()` est SÉQUENTIEL côté service (ZSOAPSQL en O(n²), la parallélisation a
 * déjà été mesurée sans gain sur ce projet) : ~29 s mesurées en prod pour les trois
 * premières tables (13,4 + 12,7 + 2,8 s), `receptions_replica` en plus depuis (#98,
 * suite lot 3). Un tick de 5 min absorbe ce coût sans se chevaucher avec le suivant
 * (garde `running`).
 *
 * Même patron que `cache_preheat_provider.ts` (tick in-process, `unref()` pour ne
 * jamais retenir le process) plutôt qu'un cron externe : c'est le seul mécanisme de
 * planification que ce projet utilise déjà.
 */

// Aligné sur ORDERS_TTL (board_dataset.ts), le plus long des trois TTL concernés
// (LIVE_TTL et STOCK_TTL sont à 2 min) : au pire un tick de retard sur la fraîcheur
// que la voie X3 directe offrait déjà via ses propres TTL.
const SYNC_INTERVAL_MS = 5 * 60 * 1000

export default class ReplicaSyncProvider {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(protected app: ApplicationService) {}

  async ready() {
    // Pas de planification en repl/test — même garde que cache_preheat_provider.
    if (!this.app.getEnvironment().startsWith('web')) return

    void this.app.booted(async () => {
      const logger = await this.app.container.make('logger')
      // Fire-and-forget : un run initial au boot évite d'attendre 5 min si la
      // réplique a vieilli pendant l'arrêt du process, sans bloquer le démarrage.
      void this.sync(logger, 'boot')
      this.startTimer(logger)
    })
  }

  async shutdown() {
    if (this.timer) clearInterval(this.timer)
  }

  private async sync(logger: LoggerService, source: string) {
    const { results } = await replicaSyncService.syncAll(source)
    for (const r of results) {
      if (r.status === 'ok') {
        logger.info(
          { rows: r.rows, ms: r.durationMs },
          `[replica-sync] ${r.table} : ${r.rows} lignes en ${r.durationMs} ms`
        )
      } else {
        // Non fatal : X3 injoignable → la table reste sur son dernier état connu,
        // et le portail (last-run-failed) repart sur la voie directe pour ce cycle.
        logger.warn({ err: r.error }, `[replica-sync] échec ${r.table} (non fatal)`)
      }
    }
  }

  private startTimer(logger: LoggerService) {
    this.timer = setInterval(() => {
      if (this.running) return
      this.running = true
      void this.sync(logger, 'scheduler').finally(() => {
        this.running = false
      })
    }, SYNC_INTERVAL_MS)
    this.timer.unref()
  }
}
