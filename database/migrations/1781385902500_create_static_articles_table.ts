import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'static_articles'

  async up() {
    this.schema.createTable(this.tableName, (t) => {
      t.string('code').primary()
      t.string('description').notNullable().defaultTo('')
      t.string('category').notNullable().defaultTo('')
      t.string('supply_type').notNullable().defaultTo('FABRICATION') // ACHAT | FABRICATION
      t.integer('synced_at').notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
