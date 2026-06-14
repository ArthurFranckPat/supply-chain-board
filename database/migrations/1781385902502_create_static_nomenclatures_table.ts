import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'static_nomenclatures'

  async up() {
    this.schema.createTable(this.tableName, (t) => {
      t.increments('id')
      t.string('parent_article').notNullable().index()
      t.string('parent_description').notNullable().defaultTo('')
      t.integer('level').notNullable().defaultTo(0)
      t.string('component_article').notNullable().index()
      t.string('component_description').notNullable().defaultTo('')
      t.float('link_quantity').notNullable().defaultTo(0)
      t.string('component_type').notNullable().defaultTo('ACHETE') // ACHETE | FABRIQUE
      t.string('consumption_nature').notNullable().defaultTo('PROPORTIONNEL') // PROPORTIONNEL | FORFAIT
      t.integer('synced_at').notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
