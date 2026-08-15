import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Table générique de paramétrage système de l'application (mode de données, toggles globaux).
 *
 * Persistée dans la base applicative (`tmp/db.sqlite3`).
 */
export default class extends BaseSchema {
  protected tableName = 'system_settings'

  async up() {
    this.schema.createTable(this.tableName, (t) => {
      t.string('key').primary()
      t.text('value').notNullable()
      t.string('updated_by').notNullable().defaultTo('system')
      t.integer('updated_at').notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
