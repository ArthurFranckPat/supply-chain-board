import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class OfOverride extends BaseModel {
  static table = 'of_overrides'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare numOf: string

  @column()
  declare dateDebut: string | null

  @column()
  declare dateFin: string | null

  @column()
  declare status: number | null

  @column()
  declare note: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
