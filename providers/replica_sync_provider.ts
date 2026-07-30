import { type ApplicationService } from '@adonisjs/core/types'
import type { LoggerService } from '@adonisjs/core/types'
import replicaSyncService from '#services/replica_sync_service'

/**
 * Rafraîchissement périodique de `orders_replica` (#98, lot 2).
 *
 * Le lot 1 posait volontairement AUCUNE planification : « L'app ne lit pas encore
 * la réplique : la déclencher n'a donc aucun effet sur les écrans » (cf.
 * `replica_sync_service.ts`). Ce n'est plus vrai dès que `board_dataset.getOrders()`
 * / `getOrdersForWindow()` consultent `orders_replica` via le portail — une réplique
 * jamais rafraîchie se fige sur l'état du dernier `node ace replica:sync` manuel et
 * ne change plus jamais, contrairement à la voie X3 directe qu'elle remplace (TTL
 * 5 min). Sans ce provider, activer `REPLICA_READS=true` dégraderait la fraîcheur au
 * lieu de la préserver.
 *
 * Ne resynchronise QUE `orders_replica` : c'est la seule table que `board_dataset`
 * consulte via `replicaGate` à ce lot. `order_lines_replica` / `stock_replica`
 * restent au rythme manuel tant qu'aucun lecteur ne dépend de leur fraîcheur — les
 * planifier maintenant coûterait de la charge SOAP pour rien.
 *
 * Même patron que `cache_preheat_provider.ts` (tick in-process, `unref()` pour ne
 * jamais retenir le process) plutôt qu'un cron externe : c'est le seul mécanisme de
 * planification que ce projet utilise déjà.
 */

// Aligné sur ORDERS_TTL (board_dataset.ts) : au pire un tick de retard sur la
// fraîcheur que la voie X3 directe offrait déjà via son propre TTL.
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
    const result = await replicaSyncService.syncOrders(source)
    if (result.status === 'ok') {
      logger.info(
        { rows: result.rows, ms: result.durationMs },
        `[replica-sync] orders_replica : ${result.rows} lignes en ${result.durationMs} ms`
      )
    } else {
      // Non fatal : X3 injoignable → la réplique reste sur son dernier état connu,
      // et le portail (last-run-failed) repart sur la voie directe pour ce cycle.
      logger.warn({ err: result.error }, `[replica-sync] échec orders_replica (non fatal)`)
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
