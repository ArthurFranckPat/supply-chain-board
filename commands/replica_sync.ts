import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import replicaSyncService from '#services/replica_sync_service'

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

  private async printStatus() {
    const freshness = await replicaSyncService.freshness()

    if (freshness.length === 0) {
      this.logger.info('Aucune ingestion journalisée — réplique jamais alimentée.')
      return
    }

    for (const f of freshness) {
      const age = f.ageMs === null ? '—' : `${Math.round(f.ageMs / 60000)} min`
      const rows = f.rows === null ? '—' : `${f.rows} lignes`
      const line = `${f.table} : ${f.status}, ${rows}, âge ${age}`
      if (f.status === 'ok') this.logger.info(line)
      else this.logger.warning(line)
    }
  }
}
