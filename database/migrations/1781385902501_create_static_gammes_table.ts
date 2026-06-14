import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'static_gammes'

  async up() {
    this.schema.createTable(this.tableName, (t) => {
      t.increments('id')
      t.string('article').notNullable().index()
      t.string('workstation').notNullable()
      t.string('workstation_label').notNullable().defaultTo('')
      t.float('rate').notNullable().defaultTo(0) // cadence (unités/heure)
      t.integer('synced_at').notNullable().defaultTo(0)
    })
    this.schema.raw('CREATE UNIQUE INDEX static_gammes_article_unique ON static_gammes (article)')
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
