import { type ApplicationService } from '@adonisjs/core/types'
import type { LoggerService } from '@adonisjs/core/types'
import replicaSyncService, { type TableIngestionResult } from '#services/replica_sync_service'
import type { ReplicaTable } from '#services/replica_gate'

/**
 * Rafraîchissement périodique de la réplique complète — `orders_flux_replica`,
 * `stock_replica`, `receptions_replica` (#98, lot 2 + suite lot 3, #105).
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
 * `operations_replica`, `stock_detail_replica`, `stock_flux_replica` et
 * `latency_replica` restent HORS `syncAll()` — les trois premières parce que trop
 * coûteuses pour douze passages par heure, la dernière parce que trop LENTE à
 * bouger pour les mériter (cf. `syncLatency()`) — mais ont chacune leur propre
 * cadence, déclarée dans `SCHEDULE` et déclenchée par ce même tick. Elles étaient manuelles jusqu'au 31/07/2026, ce qui rendait leur câblage
 * en lecture inopérant : sans cadence, la borne d'âge de `ReplicaGate` les renvoie
 * en voie directe la quasi-totalité du temps.
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

export interface LastRuns {
  lastAttemptAt: string | null
  lastSuccessAt: string | null
}

/** Horodatage ISO → epoch ms. `null` (jamais) et illisible (`NaN`) donnent tous
 *  deux `null` : dans les deux cas on ne peut pas démontrer qu'un run a eu lieu,
 *  et c'est la démonstration qui autorise à ne rien faire. */
function parsedAt(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

/**
 * Faut-il lancer l'ingestion quotidienne ? `null` en horodatage vaut « jamais »,
 * donc oui — une table jamais ingérée doit partir au premier tick.
 *
 * Pure, testable sans DB ni horloge réelle.
 */
export function needsDailyRun(
  runs: LastRuns,
  now: Date,
  windowStart: Date,
  cooldownMs: number = DAILY_RETRY_COOLDOWN_MS
): boolean {
  const success = parsedAt(runs.lastSuccessAt)
  // Travail du jour déjà fait.
  if (success !== null && success >= windowStart.getTime()) return false

  // Une tentative trop récente est soit un échec qu'on ne veut pas marteler, soit
  // un run en cours dont la ligne n'est pas encore écrite — attendre dans les deux
  // cas.
  const attempt = parsedAt(runs.lastAttemptAt)
  if (attempt !== null && now.getTime() - attempt < cooldownMs) return false
  return true
}

/**
 * Faut-il lancer une ingestion à cadence PÉRIODIQUE (par opposition à la fenêtre
 * quotidienne) ? Déclenche quand le dernier succès date de plus de `everyMs`.
 *
 * L'intervalle sert aussi de temporisation de reprise : après un échec,
 * `lastSuccessAt` reste vieux et rappellerait à chaque tick de 5 min. Une reprise
 * à la cadence nominale suffit — inutile d'un second réglage qui pourrait la
 * contredire.
 *
 * Pure, testable sans DB ni horloge réelle.
 */
export function needsIntervalRun(runs: LastRuns, now: Date, everyMs: number): boolean {
  const success = parsedAt(runs.lastSuccessAt)
  if (success !== null && now.getTime() - success < everyMs) return false

  const attempt = parsedAt(runs.lastAttemptAt)
  if (attempt !== null && now.getTime() - attempt < everyMs) return false
  return true
}

/**
 * Tables qui n'ont pas leur place dans le tick de 5 min — trop coûteuses, ou trop
 * lentes à bouger pour le mériter — mais qui ont malgré tout besoin d'une cadence :
 * sans elle, leur borne d'âge dans `ReplicaGate` les renvoie en voie directe la
 * quasi-totalité du temps, et le câblage ne rapporte rien.
 *
 * **Règle de choix : cadence ≈ seuil / 3.** Le seuil dit à partir de quand la
 * donnée devient trompeuse à l'écran ; la cadence doit rester assez en dessous
 * pour qu'une ou deux ingestions manquées ne fassent pas basculer la table. Une
 * cadence égale au seuil produirait un clignotement permanent réplique/direct.
 *
 * Coûts mesurés (CLTEST, 3 runs consécutifs, 31/07/2026) : `operations` 2,3 s
 * constant (~14 chunks SOAP, scopés aux `num_of` d'`orders_flux_replica`),
 * `stock_detail` 1,9-2,0 s. Stable, aucun échec — c'est la mesure « en charge
 * répétée » qui manquait à `43f94e0` et qui les gardait en commande manuelle.
 * Réserve : en PROD `stock_detail` porte ~45k lignes contre 4 683 ici, donc
 * compter environ un ordre de grandeur de plus.
 *
 * `stock_flux_replica` est le cas à part : cadence QUOTIDIENNE ancrée sur une
 * heure creuse plutôt qu'un intervalle, parce que ~3-4 min et ~122 appels SOAP
 * chunkés ne se placent pas n'importe quand dans la journée.
 */
interface ScheduledIngestion {
  table: ReplicaTable
  run: (source: string) => Promise<TableIngestionResult>
  /** Cadence périodique. Exclusif avec `dailyHour`. */
  everyMs?: number
  /** Heure locale d'une cadence quotidienne. Exclusif avec `everyMs`. */
  dailyHour?: number
}

export const SCHEDULE: ScheduledIngestion[] = [
  {
    // Seuil 30 min (pointages) → cadence 10 min, deux runs manqués tolérés.
    table: 'operations_replica',
    run: (s) => replicaSyncService.syncOperations(s),
    everyMs: 10 * 60 * 1000,
  },
  {
    // Seuil 6 h (ratios US/palette observés, pas un état instantané) → 2 h.
    table: 'stock_detail_replica',
    run: (s) => replicaSyncService.syncStockDetail(s),
    everyMs: 2 * 60 * 60 * 1000,
  },
  {
    // Seuil 26 h. Cf. `dailyWindowStart` pour le choix fenêtre vs intervalle.
    table: 'stock_flux_replica',
    run: (s) => replicaSyncService.syncStockFlux(s),
    dailyHour: DAILY_SYNC_HOUR,
  },
  {
    // Seuil 18 h → cadence 6 h, deux runs manqués tolérés.
    //
    // Seule entrée de `SCHEDULE` qui n'est pas là pour son coût : la requête
    // vaut ~1 s. C'est la donnée qui ne justifie pas le tick — moyenne glissante
    // sur 180 jours, consommée derrière un cache de 2 h. Cf. `syncLatency()`.
    table: 'latency_replica',
    run: (s) => replicaSyncService.syncLatency(s),
    everyMs: 6 * 60 * 60 * 1000,
  },
]

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

    await this.runScheduled(logger)
  }

  /**
   * Tables à cadence propre (cf. `SCHEDULE`), adossées à `ingestion_log` et non à
   * des timers séparés.
   *
   * Enchaînées APRÈS `syncAll()` dans le même cycle, donc sous la même garde
   * `running` : les ingestions ne se chevauchent jamais, et `X3Database` n'est
   * pas sollicitée en parallèle (pool à 1, ZSOAPSQL en O(n²) — la parallélisation
   * a déjà été mesurée sans gain sur ce projet). Séquentielles entre elles pour
   * la même raison.
   *
   * Le jour où `stock_flux_replica` se déclenche, le cycle dure ~3-4 min au lieu
   * de ~30 s. Sans conséquence : le tick suivant trouve `running` à vrai et passe
   * son tour.
   */
  private async runScheduled(logger: LoggerService) {
    for (const entry of SCHEDULE) {
      try {
        const now = new Date()
        const runs = await replicaSyncService.lastFullRuns(entry.table)

        const periodique = entry.everyMs !== undefined
        const due = periodique
          ? needsIntervalRun(runs, now, entry.everyMs!)
          : needsDailyRun(runs, now, dailyWindowStart(now, entry.dailyHour))
        if (!due) continue

        // Le régime est écrit dans `ingestion_log.source` : c'est ce qui permet
        // de distinguer, en relisant le journal, un run de cadence périodique
        // d'un run de fenêtre nocturne — et de constater qu'une cadence s'est
        // bien déclenchée d'elle-même plutôt que par une commande manuelle.
        const r = await entry.run(periodique ? 'scheduler' : 'scheduler-daily')
        if (r.status === 'ok') {
          logger.info(
            { rows: r.rows, ms: r.durationMs },
            `[replica-sync] ${r.table} : ${r.rows} lignes en ${r.durationMs} ms`
          )
        } else {
          logger.warn({ err: r.error }, `[replica-sync] échec ${r.table} (non fatal)`)
        }
      } catch (err) {
        // Isolé PAR TABLE, et non autour de la boucle : une table en échec ne doit
        // pas priver les suivantes de leur cadence. Non fatal dans tous les cas —
        // ces tables savent toutes repartir sur X3 direct, et les quatre du tick
        // 5 min, qui servent le board, sont déjà passées.
        logger.warn({ err }, `[replica-sync] échec de la cadence ${entry.table} (non fatal)`)
      }
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
