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
 * `operations_replica` et `stock_detail_replica` sont volontairement HORS
 * `syncAll()` — charge X3 non arbitrée, cf. les commentaires de
 * `syncOperations`/`syncStockDetail`. Restent des commandes manuelles
 * (`node ace replica:sync --only=…`).
 *
 * `stock_flux_replica` a, elle, une cadence QUOTIDIENNE (cf. `dailyWindowStart`)
 * plutôt que le tick de 5 min : ~3-4 min et ~122 appels SOAP chunkés par run, à ne
 * pas rejouer douze fois par heure. La valorisation historique qui la lit se
 * regarde en tendance sur 12 mois glissants, et l'usage mesuré (table
 * d'instrumentation `stock_valuation_calls`, 152 appels) est à 100 %
 * `grain=mois` sur la fenêtre par défaut : une donnée de la veille y répond.
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

/** Heure LOCALE visée pour l'ingestion quotidienne de `stock_flux_replica`.
 *  Creux d'activité : les ~3-4 min de SOAP ne concurrencent aucun écran. */
const DAILY_SYNC_HOUR = 3

/** Reprise minimale après une tentative quotidienne ÉCHOUÉE. Sans cette borne,
 *  une journée où X3 refuse relancerait l'ingestion à chaque tick de 5 min. Une
 *  heure laisse quelques reprises dans la journée sans marteler l'ERP. */
const DAILY_RETRY_COOLDOWN_MS = 60 * 60 * 1000

/**
 * Début de la fenêtre quotidienne courante : la dernière occurrence de
 * `DAILY_SYNC_HOUR`, aujourd'hui si elle est passée, hier sinon.
 *
 * Raisonner en FENÊTRE plutôt qu'en « âge > 24 h » est ce qui rend la garde
 * rattrapante : une app arrêtée de 02 h à 09 h trouve au premier tick une fenêtre
 * ouverte à 03 h et un dernier succès de la veille, donc elle synchronise à 09 h
 * au lieu d'attendre le lendemain. Heure locale et non UTC : le creux d'activité
 * est celui de l'usine, et il suit l'heure d'été.
 *
 * Pure, testable sans DB ni horloge réelle.
 */
export function dailyWindowStart(now: Date, hour: number = DAILY_SYNC_HOUR): Date {
  const start = new Date(now)
  start.setHours(hour, 0, 0, 0)
  if (start.getTime() > now.getTime()) start.setDate(start.getDate() - 1)
  return start
}

/**
 * Faut-il lancer l'ingestion quotidienne ? `null` en horodatage vaut « jamais »,
 * donc oui — une table jamais ingérée doit partir au premier tick.
 *
 * Pure, testable sans DB ni horloge réelle.
 */
export function needsDailyRun(
  runs: { lastAttemptAt: string | null; lastSuccessAt: string | null },
  now: Date,
  windowStart: Date,
  cooldownMs: number = DAILY_RETRY_COOLDOWN_MS
): boolean {
  const success = runs.lastSuccessAt ? Date.parse(runs.lastSuccessAt) : null
  // Travail du jour déjà fait.
  if (success !== null && success >= windowStart.getTime()) return false

  const attempt = runs.lastAttemptAt ? Date.parse(runs.lastAttemptAt) : null
  // Une tentative trop récente est soit un échec qu'on ne veut pas marteler, soit
  // un run en cours dont la ligne n'est pas encore écrite — attendre dans les deux
  // cas. Un horodatage illisible (`NaN`) ne peut pas retenir le déclenchement :
  // c'est le succès qui autorise à ne rien faire, pas la tentative.
  if (attempt !== null && !Number.isNaN(attempt) && now.getTime() - attempt < cooldownMs) {
    return false
  }
  return true
}

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
      // Sous la garde `running` comme les ticks : depuis que le cycle peut
      // enchaîner l'ingestion quotidienne de `stock_flux_replica`, il dépasse
      // parfois les 5 min et le premier tick le rattraperait.
      void this.runGuarded(logger, 'boot')
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

    await this.syncStockFluxIfDue(logger)
  }

  /**
   * Ingestion quotidienne de `stock_flux_replica`, adossée à `ingestion_log` et
   * non à un second timer — cf. `dailyWindowStart`.
   *
   * Enchaînée APRÈS `syncAll()` dans le même cycle, donc sous la même garde
   * `running` : les deux ingestions ne se chevauchent jamais, et `X3Database`
   * n'est pas sollicitée en parallèle (pool à 1, ZSOAPSQL en O(n²) — la
   * parallélisation a déjà été mesurée sans gain sur ce projet).
   *
   * Le jour où elle se déclenche, le cycle dure ~3-4 min au lieu de ~30 s. Sans
   * conséquence : le tick suivant trouve `running` à vrai et passe son tour.
   */
  private async syncStockFluxIfDue(logger: LoggerService) {
    try {
      const now = new Date()
      const runs = await replicaSyncService.lastFullRuns('stock_flux_replica')
      if (!needsDailyRun(runs, now, dailyWindowStart(now))) return

      logger.info('[replica-sync] stock_flux_replica : ingestion quotidienne')
      const r = await replicaSyncService.syncStockFlux('scheduler-daily')
      if (r.status === 'ok') {
        logger.info(
          { rows: r.rows, ms: r.durationMs },
          `[replica-sync] ${r.table} : ${r.rows} lignes en ${r.durationMs} ms`
        )
      } else {
        logger.warn({ err: r.error }, `[replica-sync] échec ${r.table} (non fatal)`)
      }
    } catch (err) {
      // La réplique de flux ne doit jamais faire tomber le cycle des quatre tables
      // du tick 5 min : celles-là servent le board, celle-ci un seul KPI qui sait
      // repartir sur X3 direct.
      logger.warn({ err }, '[replica-sync] échec de la garde quotidienne stock_flux (non fatal)')
    }
  }

  /** Un cycle au plus à la fois. Un cycle en cours fait passer son tour au suivant. */
  private async runGuarded(logger: LoggerService, source: string) {
    if (this.running) return
    this.running = true
    try {
      await this.sync(logger, source)
    } finally {
      this.running = false
    }
  }

  private startTimer(logger: LoggerService) {
    this.timer = setInterval(() => {
      void this.runGuarded(logger, 'scheduler')
    }, SYNC_INTERVAL_MS)
    this.timer.unref()
  }
}
