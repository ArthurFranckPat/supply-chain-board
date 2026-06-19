import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Table `users` (issue #13).
 *
 * Pas de colonne `password` : l'autorité d'auth est Sage X3. On garde le mot de
 * passe X3 chiffré au repos (`x3_password_encrypted`) + le dernier env choisi.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('username').notNullable().unique()
      table.text('x3_password_encrypted').nullable()
      table.string('last_env').notNullable().defaultTo('test')
      table.timestamp('last_login_at').nullable()
      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
