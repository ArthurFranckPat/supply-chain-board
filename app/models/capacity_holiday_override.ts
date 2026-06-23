import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class CapacityHolidayOverride extends BaseModel {
  static table = 'capacity_holiday_overrides'

  @column({ isPrimary: true })
  declare id: number

  /** Date ISO du férié concerné. */
  @column()
  declare date: string

  /** false = férié neutralisé (jour travaillé). */
  @column()
  declare active: boolean
}
