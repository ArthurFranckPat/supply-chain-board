import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class StaticWorkstation extends BaseModel {
  static table = 'static_workstations'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare code: string

  @column()
  declare description: string

  @column()
  declare wsttyp: number

  @column()
  declare wstnbr: number

  @column()
  declare eff: number

  @column({ columnName: 'use_pct' })
  declare usePct: number

  @column()
  declare shr: number

  @column()
  declare twd: string

  @column({ columnName: 'daycap_0' })
  declare daycap0: number
  @column({ columnName: 'daycap_1' })
  declare daycap1: number
  @column({ columnName: 'daycap_2' })
  declare daycap2: number
  @column({ columnName: 'daycap_3' })
  declare daycap3: number
  @column({ columnName: 'daycap_4' })
  declare daycap4: number
  @column({ columnName: 'daycap_5' })
  declare daycap5: number
  @column({ columnName: 'daycap_6' })
  declare daycap6: number

  @column()
  declare stoloc: string

  @column()
  declare wcr: string

  @column()
  declare wcrfcy: string

  @column({ columnName: 'synced_at' })
  declare syncedAt: number
}
