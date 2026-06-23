import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class CapacityClosure extends BaseModel {
  static table = 'capacity_closures'

  @column({ isPrimary: true })
  declare id: number

  /** 'global' | 'wst' | 'stoloc'. */
  @column()
  declare scope: string

  /** Code WST ou STOLOC (vide si global). */
  @column()
  declare code: string

  @column({ columnName: 'date_from' })
  declare dateFrom: string

  @column({ columnName: 'date_to' })
  declare dateTo: string

  @column()
  declare motif: string

  /** 0 = fermé, 0.5 = demi-journée, 1 = ouvert. */
  @column()
  declare factor: number

  @column({ columnName: 'created_at' })
  declare createdAt: number
}
