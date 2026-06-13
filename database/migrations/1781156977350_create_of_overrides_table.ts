import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'of_overrides'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('num_of', 30).notNullable().unique()
      table.string('date_debut', 10).nullable()
      table.string('date_fin', 10).nullable()
      table.integer('status').nullable()
      table.text('note').nullable()

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
