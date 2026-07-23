import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Trace X3 des tirages en échec (issue #85).
 *
 * `ZSOAPPRINT` peut échouer sans le moindre message SOAP — le journal n'affiche
 * alors que « X3 a refusé l'opération (statut non-succès) sans message
 * explicite », ce qui ne se diagnostique pas. La trace (`adxwss.trace.on`) porte
 * le wrapper appelé, les arguments transmis et le `Result(n)` du sous-programme.
 *
 * Elle est demandée AU PREMIER APPEL, jamais sur un rejeu : réappeler pour
 * obtenir la trace, ce serait un second tirage, et le papier ne se reprend pas.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('print_jobs', (t) => {
      /** Trace X3 brute, ou à défaut la réponse SOAP. Vide sur les tirages réussis. */
      t.text('x3_trace').notNullable().defaultTo('')
    })
  }

  async down() {
    this.schema.alterTable('print_jobs', (t) => {
      t.dropColumn('x3_trace')
    })
  }
}
