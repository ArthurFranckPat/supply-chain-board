import { BaseModel, column } from '@adonisjs/lucid/orm'

/** Réglages d'impression (issue #85) — ligne unique, id = 1. */
export default class PrintSetting extends BaseModel {
  static table = 'print_settings'

  @column({ isPrimary: true })
  declare id: number

  /** 'off' | 'single' | 'all' — cf. migration pour la sémantique. */
  @column({ columnName: 'auto_print_mode' })
  declare autoPrintMode: string

  @column({ columnName: 'updated_at' })
  declare updatedAt: number

  @column({ columnName: 'updated_by' })
  declare updatedBy: string
}
