import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('static_articles', (table) => {
      table.integer('reorder_delay').notNullable().defaultTo(14)
    })

    this.schema.alterTable('scenarios', (table) => {
      table.string('strategy', 50).notNullable().defaultTo('date_besoin')
    })
  }

  async down() {
    this.schema.alterTable('static_articles', (table) => {
      table.dropColumn('reorder_delay')
    })

    this.schema.alterTable('scenarios', (table) => {
      table.dropColumn('strategy')
    })
  }
}
