import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'of_overrides'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('workstation', 30).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('workstation')
    })
  }
}
