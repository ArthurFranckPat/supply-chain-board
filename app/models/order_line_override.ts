import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Override de date de livraison sur une ligne de commande ouverte.
 * Surcharge l'échéance X3 pour le board planification (issue #10).
 * Clé composite (numCommande, ligne) — une ligne de commande = une entrée.
 */
export default class OrderLineOverride extends BaseModel {
  static table = 'order_line_overrides'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare numCommande: string

  @column()
  declare ligne: string

  /** Date de livraison surchargée (ISO YYYY-MM-DD). */
  @column()
  declare dateLivraison: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
