import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'local_menus'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.integer('chapter').notNullable()
      table.string('name', 100).notNullable()
      table.integer('value').notNullable()
      table.string('label', 255).notNullable()
      table.primary(['chapter', 'value'])
      table.index(['chapter'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}