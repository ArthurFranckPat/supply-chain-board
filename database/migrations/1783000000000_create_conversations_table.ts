import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Historique des conversations du copilote. Même infra locale (SQLite) et même
 * pattern que `scenarios` : les messages (UIMessage[] AI SDK) sont sérialisés
 * JSON dans une colonne texte et (dé)sérialisés par `ConversationStore`.
 *
 * `conversation_id` = l'UUID généré côté front (clé de la session Pi in-memory).
 * `user_id` scope l'historique par utilisateur (K5 — anti-IDOR).
 */
export default class extends BaseSchema {
  protected tableName = 'conversations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').notNullable().index()
      table.string('conversation_id', 64).notNullable().unique()
      table.string('title', 120).nullable()
      // UIMessage[] sérialisés JSON (texte + réflexion + tool parts).
      table.text('messages').notNullable().defaultTo('[]')

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
