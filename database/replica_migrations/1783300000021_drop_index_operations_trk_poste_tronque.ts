import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Retire l'index d'expression `substr(cplwst, 1, 6)` (#119).
 *
 * Il n'existait que pour une lecture par identité TRONQUÉE, qui repliait
 * `PP_093S` sur `PP_093`. Cette fusion est supprimée : le cockpit filtre en
 * égalité stricte sur `cplwst`, servie par `idx_operations_trk_wst_day`.
 */
export default class extends BaseSchema {
  protected tableName = 'operations_trk_replica'

  async up() {
    this.schema.raw(`DROP INDEX IF EXISTS idx_operations_trk_wst6_day`)
  }

  async down() {
    this.schema.raw(
      `CREATE INDEX IF NOT EXISTS idx_operations_trk_wst6_day ON ${this.tableName} (substr(cplwst, 1, 6), iptdat)`
    )
  }
}
