import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import demandSnapshotService, { SOURCES_ATTENDUES } from '#services/demand_snapshot_service'

/**
 * `node ace snapshot:run` — photo quotidienne du besoin (#74 lot 1, absorbé
 * par #98 lot 4) et des messages CBN (#138 lot 0).
 *
 * `--date=YYYY-MM-DD` écrit sous la date visée, défaut aujourd'hui. Ce n'est
 * PAS un backfill : la photo capture l'état LIVE au moment du run, X3
 * n'autorisant aucune reconstruction rétroactive. Antidater un run fabrique
 * donc un faux passé — n'utiliser le flag que pour recaler un run lancé après
 * minuit.
 *
 * Idempotent : rejouer pour la même date REMPLACE la photo, source par source
 * (côté service), jamais de doublon.
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
      // Détail par source (#138 lot 0). Chaque extraction est isolée par son
      // propre try/catch : un run peut réussir en ayant perdu une population
      // entière, et seul ce rapprochement avec les sources attendues le dit.
      for (const [src, n] of Object.entries(result.sourceBreakdown).sort(([a], [b]) =>
        a.localeCompare(b)
      )) {
        this.logger.log(`  ${src.padEnd(18)} ${n}`)
      }
      const manquantes = SOURCES_ATTENDUES.filter((s) => result.sourceBreakdown[s] === undefined)
      if (manquantes.length > 0) {
        // Pas un échec : ce que ce run n'a pas réécrit reste figé par le run
        // précédent du même jour (garde-fou par source). Mais si c'est la
        // PREMIÈRE écriture du jour, la population manque pour de bon —
        // `snapshot:diagnose` tranche.
        this.logger.warning(
          `${manquantes.length} source(s) non extraite(s) : ${manquantes.join(', ')} — vérifier avec snapshot:diagnose`
        )
      }
    } else if (result.status === 'skipped-empty') {
      this.logger.warning(`${result.date} : ${result.error}`)
      this.exitCode = 1
    } else {
      this.logger.error(`${result.date} : ÉCHEC — ${result.error}`)
      this.exitCode = 1
    }

    // Cf. `replica_sync.ts` : X3Database garde un pool knex ouvert (timer tarn
    // interne) qui ne rendrait jamais la main au shell sans cette sortie
    // explicite.
    process.exit(this.exitCode ?? 0)
  }
}
