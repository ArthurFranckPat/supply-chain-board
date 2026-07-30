import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Instrumentation d'usage de `getStockValuation()` (#98, lot 3 — scoping STOJOU).
 *
 * Le lot 3 hésite entre répliquer STOJOU au grain jour×document (~600k lignes/12
 * mois, mesuré en prod) ou au grain agrégé mois+semaine séparément (repli X3
 * direct pour les plages `pinned` hors fenêtre glissante). Trancher sans deviner
 * demande de savoir, en usage réel, à quelle fréquence `grain='semaine'` et
 * `pinned=true` sont choisis — donnée absente du code, à collecter sur quelques
 * jours puis à analyser (cf. commentaire GitHub #98 du 30/07/2026).
 *
 * Table à supprimer une fois la décision prise (ou l'usage aura confirmé une
 * fréquence assez stable pour ne plus avoir besoin de collecter).
 */
export default class extends BaseSchema {
  protected tableName = 'stock_valuation_calls'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('grain', 16).notNullable()
      table.boolean('pinned').notNullable()
      table.date('from_date').notNullable()
      table.date('to_date').notNullable()
      table.timestamp('called_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
