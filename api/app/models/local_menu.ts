import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class LocalMenu extends BaseModel {
  static table = 'local_menus'
  static primaryKey = 'value'

  @column({ columnName: 'chapter' })
  declare chapter: number

  @column({ columnName: 'name' })
  declare name: string

  @column({ columnName: 'value' })
  declare value: number

  @column({ columnName: 'label' })
  declare label: string
}
