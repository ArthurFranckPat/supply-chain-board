import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Index d'expression pour la lecture cockpit par identité tronquée (#119).
 *
 * `getPointages(…, cplwst)` filtre `substr(cplwst, 1, 6) = ?` — l'index
 * `(cplwst, iptdat)` n'est plus utilisable (contre-revue #119, point D).
 * Sans cet index, chaque chargement de poste scanne ~90k lignes.
 */
export default class extends BaseSchema {
  protected tableName = 'operations_trk_replica'

  async up() {
    this.schema.raw(
      `CREATE INDEX IF NOT EXISTS idx_operations_trk_wst6_day ON ${this.tableName} (substr(cplwst, 1, 6), iptdat)`
    )
  }

  async down() {
    this.schema.raw(`DROP INDEX IF EXISTS idx_operations_trk_wst6_day`)
  }
}
