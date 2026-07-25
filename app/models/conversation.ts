import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Conversation du copilote (historique persisté). Les messages sont stockés en
 * JSON texte et (dé)sérialisés par `ConversationStore` — le modèle reste un
 * simple miroir de table (même pattern que `Scenario`).
 */
export default class Conversation extends BaseModel {
  static table = 'conversations'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  /** UUID généré côté front — clé de la session Pi in-memory. */
  @column()
  declare conversationId: string

  @column()
  declare title: string | null

  /** JSON sérialisé d'un UIMessage[]. */
  @column()
  declare messages: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
