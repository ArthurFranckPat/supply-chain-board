import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import demandSnapshotService from '#services/demand_snapshot_service'

/**
 * `node ace snapshot:run` — photo quotidienne du besoin (#74 lot 1, absorbé
 * par #74, lot 1).
 *
 * `--date=YYYY-MM-DD` : rattrapage/backfill du jour visé, défaut aujourd'hui.
 * Idempotent : rejouer pour la même date REMPLACE la photo (swap complet côté
 * service), jamais de doublon.
 */
export default class SnapshotRun extends BaseCommand {
  static commandName = 'snapshot:run'
  static description = 'Prend une photo du besoin (OF + lignes de commande + stock + appros)'

  static options: CommandOptions = { startApp: true }

  @flags.string({ description: 'Date de la photo (YYYY-MM-DD). Défaut : aujourd’hui' })
  declare date: string

  async run() {
    let target = new Date()
    if (this.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(this.date)) {
        this.logger.error(`--date invalide : ${this.date} (attendu YYYY-MM-DD)`)
        this.exitCode = 1
        process.exit(1)
      }
      target = new Date(`${this.date}T00:00:00`)
    }

    const result = await demandSnapshotService.run(target, 'cli')

    if (result.status === 'ok') {
      this.logger.success(`${result.date} : ${result.rows} lignes en ${result.durationMs} ms`)
    } else if (result.status === 'skipped-empty') {
      this.logger.warning(`${result.date} : ${result.error}`)
      this.exitCode = 1
    } else {
      this.logger.error(`${result.date} : ÉCHEC — ${result.error}`)
      this.exitCode = 1
    }

    // X3Database garde un pool knex ouvert (timer tarn interne) qui ne rendrait
    // jamais la main au shell sans cette sortie explicite.
    process.exit(this.exitCode ?? 0)
  }
}
