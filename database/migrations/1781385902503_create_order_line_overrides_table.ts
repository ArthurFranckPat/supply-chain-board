import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'order_line_overrides'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('num_commande', 30).notNullable()
      table.string('ligne', 10).notNullable()
      table.string('date_livraison', 10).notNullable()

      table.unique(['num_commande', 'ligne'])
      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
