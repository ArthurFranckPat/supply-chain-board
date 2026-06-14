import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class StaticNomenclature extends BaseModel {
  static table = 'static_nomenclatures'

  @column({ isPrimary: true })
  declare id: number

  @column({ columnName: 'parent_article' })
  declare parentArticle: string

  @column({ columnName: 'parent_description' })
  declare parentDescription: string

  @column()
  declare level: number

  @column({ columnName: 'component_article' })
  declare componentArticle: string

  @column({ columnName: 'component_description' })
  declare componentDescription: string

  @column({ columnName: 'link_quantity' })
  declare linkQuantity: number

  @column({ columnName: 'component_type' })
  declare componentType: string

  @column({ columnName: 'consumption_nature' })
  declare consumptionNature: string

  @column({ columnName: 'synced_at' })
  declare syncedAt: number
}
