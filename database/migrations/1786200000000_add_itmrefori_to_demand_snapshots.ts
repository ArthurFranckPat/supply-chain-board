import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Pegging du besoin matière (refonte CBN lot 0, ticket 01).
 *
 * La photo quotidienne capture désormais la source `besoin_matiere`
 * (WIPTYP=6, WIPSTA=1 uniquement). Chaque ligne porte son article parent
 * `ITMREFORI_0` (100 % peuplé) — un niveau de nomenclature gratuit dans
 * ORDERS, sans BOMD ni reverse-BOM récursif. Cette colonne stocke ce parent,
 * nullable pour les 8 autres sources historiques.
 */
export default class extends BaseSchema {
  protected tableName = 'demand_snapshots'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('itmrefori', 20).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('itmrefori')
    })
  }
}
