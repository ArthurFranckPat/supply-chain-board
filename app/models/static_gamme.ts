import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class StaticGamme extends BaseModel {
  static table = 'static_gammes'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare article: string

  @column()
  declare workstation: string

  @column({ columnName: 'workstation_label' })
  declare workstationLabel: string

  @column()
  declare rate: number

  @column({ columnName: 'synced_at' })
  declare syncedAt: number
}
