import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Scénarios (issue #57, vision étage 3). Même infra locale (SQLite) qu'`OfOverride` :
 * on persiste les MUTATIONS (pas le résultat, cf. vision §5) → rejouées sur données
 * fraîches, diff recalculé à l'ouverture.
 */
export default class extends BaseSchema {
  protected tableName = 'scenarios'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('nom', 120).notNullable()
      table.text('description').nullable()
      table.string('auteur', 120).nullable()
      // brouillon | applique — un scénario appliqué est archivé (mutations rejouées en PATCHs réels).
      table.string('statut', 20).notNullable().defaultTo('brouillon')
      // Liste ordonnée de PlanMutation, sérialisée JSON.
      table.text('mutations').notNullable().defaultTo('[]')
      // Traçabilité de la dernière évaluation (« évalué le … sur données du … »).
      table.string('evaluated_at', 30).nullable()
      table.string('data_at', 30).nullable()

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
