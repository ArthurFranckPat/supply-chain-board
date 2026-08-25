import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Journal des sources capturées par run de photo (#149).
 *
 * Avant ce lot, `sourcesEnEchec` et `sourceBreakdown` ne vivaient que dans les
 * logs. La présence d'une source était déduite des lignes stockées dans
 * `demand_snapshots`, confondant « rien écrit » (échec d'extraction) et
 * « rien à écrire » (source réellement vide, zéro ligne). Une nuit où le CBN
 * ne rend aucun OF suggéré — ~2 000 lignes `of_suggestion` qui disparaissent —
 * est l'événement métier le plus fort du diff des drivers, et le diff le
 * passait sous silence en l'écartant comme un trou d'instrumentation (#145).
 *
 * Une ligne par (`snapshot_date`, `source`) avec le verdict du run :
 * - `capturee` — extraction réussie, au moins une ligne
 * - `vide`     — extraction réussie, zéro ligne
 * - `echec`    — extraction en échec (source non réécrite)
 * et le nombre de lignes. `diffDrivers()` lit ce journal au lieu de déduire
 * de la présence en lignes ; une source `vide` est comparée (disparition
 * affichée), une source `echec` est écartée avec motif exact. Les snapshots
 * historiques sans journal continuent avec l'ancien garde-fou SOURCES_ATTENDUES.
 */
export default class extends BaseSchema {
  protected tableName = 'demand_snapshot_sources'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.date('snapshot_date').notNullable()
      table.string('source', 24).notNullable()
      /** Verdict du run : `capturee` | `vide` | `echec`. */
      table.string('statut', 12).notNullable()
      table.integer('lignes').notNullable().defaultTo(0)
      table.timestamp('created_at')
    })

    this.schema.raw(
      `CREATE INDEX idx_demand_snapshot_sources_date_source ON ${this.tableName} (snapshot_date, source)`
    )
    this.schema.raw(
      `CREATE INDEX idx_demand_snapshot_sources_date ON ${this.tableName} (snapshot_date)`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
