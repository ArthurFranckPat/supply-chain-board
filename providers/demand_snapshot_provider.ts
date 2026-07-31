import { type ApplicationService } from '@adonisjs/core/types'
import type { LoggerService } from '@adonisjs/core/types'
import demandSnapshotService from '#services/demand_snapshot_service'

/**
 * Photo quotidienne du besoin (#74 lot 1, absorbé par #98 lot 4).
 *
 * Le lot 1 s'arrêtait volontairement à la commande manuelle `node ace
 * snapshot:run`, le temps que le mapping d'extraction soit validé contre X3
 * réel — ce qui a été fait le 31/07/2026 (28 646 lignes, 4 sources croisées).
 * Le dernier critère d'acceptation du lot 1 qui restait ouvert était la photo
 * NOCTURNE automatique : c'est ce provider.
 *
 * ## Pourquoi un provider séparé de `replica_sync_provider`
 *
 * Ce sont deux magasins différents : la réplique vit dans `tmp/replica.sqlite3`
 * (connexion `replica`), la photo dans la base applicative. Les faire partager un
 * cycle rendrait un échec d'ingestion capable d'empêcher une photo, alors que les
 * deux n'ont aucune dépendance l'une envers l'autre.
 *
 * ## Pourquoi 04 h et pas 03 h
 *
 * `stock_flux_replica` occupe déjà la fenêtre de 03 h avec ~122 appels SOAP
 * chunkés sur ~3-4 min. Décaler d'une heure évite de faire se croiser deux
 * traitements lourds sur le même X3 (pool à 1, `ZSOAPSQL` en O(n²)).
 *
 * ## Ce que la photo capture
 *
 * L'état LIVE au moment du run, écrit sous la date du jour. X3 ne permet aucune
 * reconstruction rétroactive : une photo manquée est manquée, un rattrapage tardif
 * capture l'état d'aujourd'hui sous la date d'aujourd'hui. D'où une garde qui
 * déclenche dès que la photo du jour manque, et non une qui essaierait de
 * remonter le temps.
 */

/** Tick de vérification. Plus lâche que les 5 min de la réplique : la question
 *  posée ne change qu'une fois par jour, un quart d'heure de granularité suffit
 *  largement à tenir l'heure visée. */
const CHECK_INTERVAL_MS = 15 * 60 * 1000

/** Heure LOCALE visée. Cf. docstring : décalée d'une heure après `stock_flux`. */
const SNAPSHOT_HOUR = 4

/** Temporisation de reprise après un échec, en mémoire du process. Le seul état
 *  qui ne survit pas au redémarrage — assumé : la garde de jour, elle, est
 *  durable, donc au pire un redémarrage coûte UNE tentative de plus, pas une
 *  boucle. Un journal de runs dédié serait la vraie réponse, mais le lot 1 a
 *  explicitement écarté d'en créer un tant que rien ne le réclame. */
const RETRY_COOLDOWN_MS = 60 * 60 * 1000

/** Jour local au format `YYYY-MM-DD`. `toISOString()` serait faux ici : il
 *  convertit en UTC, donc renverrait la veille pour toute heure locale avant
 *  01 h ou 02 h en France. */
export function localDay(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Faut-il prendre la photo du jour ?
 *
 * Trois conditions, dans cet ordre : l'heure visée est passée, la photo du jour
 * n'existe pas encore, et aucune tentative trop récente n'est en cours ou n'a
 * échoué.
 *
 * La comparaison porte sur le JOUR et non sur un âge : « la photo d'aujourd'hui
 * existe-t-elle » est la question métier, et elle est insensible aux
 * redémarrages, aux runs manuels et aux backfills — tous écrivent la même date.
 *
 * Pure, testable sans DB ni horloge réelle.
 */
export function needsSnapshot(
  latestDay: string | null,
  now: Date,
  lastAttemptMs: number | null,
  hour: number = SNAPSHOT_HOUR,
  cooldownMs: number = RETRY_COOLDOWN_MS
): boolean {
  if (now.getHours() < hour) return false
  if (latestDay === localDay(now)) return false
  if (lastAttemptMs !== null && now.getTime() - lastAttemptMs < cooldownMs) return false
  return true
}

export default class DemandSnapshotProvider {
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false
  private lastAttemptMs: number | null = null

  constructor(protected app: ApplicationService) {}

  async ready() {
    // Pas de planification en repl/test — même garde que les autres providers.
    if (!this.app.getEnvironment().startsWith('web')) return

    void this.app.booted(async () => {
      const logger = await this.app.container.make('logger')
      // Une vérification au boot rattrape la photo du jour si le process était
      // arrêté à l'heure visée. Fire-and-forget : ne bloque pas le démarrage.
      void this.tick(logger)
      this.timer = setInterval(() => void this.tick(logger), CHECK_INTERVAL_MS)
      this.timer.unref()
    })
  }

  async shutdown() {
    if (this.timer) clearInterval(this.timer)
  }

  private async tick(logger: LoggerService) {
    if (this.running) return
    this.running = true
    try {
      const now = new Date()
      const latestDay = await demandSnapshotService.latestSnapshotDay()
      if (!needsSnapshot(latestDay, now, this.lastAttemptMs)) return

      // Posé AVANT le run : une extraction qui dure ne doit pas être relancée par
      // le tick suivant, et un échec doit temporiser même s'il ne laisse aucune
      // trace en base.
      this.lastAttemptMs = now.getTime()

      const r = await demandSnapshotService.run(now, 'scheduler')
      if (r.status === 'ok') {
        logger.info(
          { date: r.date, rows: r.rows, ms: r.durationMs },
          `[snapshot] ${r.date} : ${r.rows} lignes en ${r.durationMs} ms`
        )
      } else {
        // Non fatal, et sans conséquence sur les écrans : la photo alimente
        // l'historique de #74, aucun rendu live n'en dépend.
        logger.warn({ err: r.error, date: r.date }, `[snapshot] ${r.status} ${r.date} (non fatal)`)
      }
    } catch (err) {
      logger.warn({ err }, '[snapshot] échec de la garde quotidienne (non fatal)')
    } finally {
      this.running = false
    }
  }
}
