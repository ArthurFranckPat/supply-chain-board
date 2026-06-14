import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class StaticArticle extends BaseModel {
  static table = 'static_articles'

  @column({ isPrimary: true })
  declare code: string

  @column()
  declare description: string

  @column()
  declare category: string

  @column({ columnName: 'supply_type' })
  declare supplyType: string

  @column({ columnName: 'synced_at' })
  declare syncedAt: number
}
