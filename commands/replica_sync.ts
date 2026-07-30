import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import replicaSyncService from '#services/replica_sync_service'
import replicaGate from '#services/replica_gate'

/**
 * `node ace replica:sync` — ingestion X3 → réplique SQLite locale (#98, lot 1).
 *
 * Commande manuelle, PAS de planification automatique à ce lot. L'app ne lit pas
 * encore la réplique : la déclencher n'a donc aucun effet sur les écrans, et un
 * worker qui tournerait tout seul contre X3 prod sans lecteur en face serait de la
 * charge SOAP gratuite. La planification vient avec la bascule des lectures
 * (lot 2), quand la fraîcheur commence à compter pour quelqu'un.
 *
 * `--status` n'interroge que le journal — aucun appel X3.
 */
export default class ReplicaSync extends BaseCommand {
  static commandName = 'replica:sync'
  static description =
    'Ingère ORDERS / lignes de commande / STOCK depuis X3 vers la réplique SQLite'

  static options: CommandOptions = { startApp: true }

  @flags.boolean({ description: "Affiche l'âge de chaque table sans rien ingérer" })
  declare status: boolean

  @flags.array({
    description: 'Tables à ingérer (orders, order-lines, stock). Défaut : toutes',
  })
  declare only: string[]

  async run() {
    if (this.status) return this.printStatus()

    const only = new Set(this.only ?? [])
    const all = only.size === 0

    const results = []
    if (all || only.has('orders')) results.push(await replicaSyncService.syncOrders('cli'))
    if (all || only.has('order-lines')) results.push(await replicaSyncService.syncOrderLines('cli'))
    if (all || only.has('stock')) results.push(await replicaSyncService.syncStock('cli'))

    if (results.length === 0) {
      this.logger.error(`Aucune table reconnue dans --only=${[...only].join(',')}`)
      this.exitCode = 1
      return
    }

    for (const r of results) {
      const seconds = (r.durationMs / 1000).toFixed(1)
      if (r.status === 'ok') {
        this.logger.success(`${r.table} : ${r.rows} lignes en ${seconds} s`)
      } else {
        this.logger.error(`${r.table} : ÉCHEC après ${seconds} s — ${r.error}`)
      }
    }

    // Sortie non nulle si une seule table a échoué : la commande est destinée à
    // être appelée par un ordonnanceur au lot 2, qui doit pouvoir le détecter.
    if (results.some((r) => r.status === 'failed')) this.exitCode = 1
  }

  /**
   * Fraîcheur ET verdict du portail. Les deux sont nécessaires pour comprendre ce
   * que voit l'app : une table peut être fraîche de 30 secondes et servie en voie
   * directe quand même (écriture X3 depuis, ou `REPLICA_READS` fermé). L'âge seul
   * répondrait à côté de la question.
   */
  private async printStatus() {
    const [freshness, verdicts] = await Promise.all([
      replicaSyncService.freshness(),
      replicaGate.verdicts(),
    ])

    const byTable = new Map(freshness.map((f) => [f.table, f]))

    for (const v of verdicts) {
      const f = byTable.get(v.table)
      const age = !f || f.ageMs === null ? 'jamais ingérée' : `${Math.round(f.ageMs / 60000)} min`
      const rows = !f || f.rows === null ? '—' : `${f.rows} lignes`
      const why = v.reason ? ` (${v.reason})` : ''
      const line = `${v.table} : lecture ${v.source}${why} · ${rows} · âge ${age}`

      if (v.source === 'replica') this.logger.info(line)
      else this.logger.warning(line)
    }

    // Les runs partiels n'apparaissent pas ci-dessus (freshness ne retient que le
    // complet). Les lister à part évite de croire qu'ils n'ont pas eu lieu.
    const partials = await replicaSyncService.recentPartialRuns()
    for (const p of partials) {
      this.logger.info(`  ↳ partiel ${p.table} : ${p.note ?? '—'} (${p.startedAt})`)
    }
  }
}
