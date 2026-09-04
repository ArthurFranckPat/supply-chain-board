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

  /** Grande famille X3 (YFAMSTAT7_0) — ex: ESH, BDH. */
  @column()
  declare famille: string

  /** Typologie fine X3 (TSICOD_4) — ex: ESH10-60, BDH60 (bouche), BDH10 (module hygro). */
  @column()
  declare typologie: string

  /**
   * Délai X3 (PRPLTI_0 achat / MFGLTI_0 fabrication), NULL si non renseigné —
   * cf. migration 1783600000000. Un délai inconnu et un délai nul ne se pilotent
   * pas pareil : le repli est décidé par chaque consommateur (`?? 14`, …), jamais ici.
   */
  @column({ columnName: 'reorder_delay' })
  declare reorderDelay: number | null

  @column({ columnName: 'synced_at' })
  declare syncedAt: number
}
