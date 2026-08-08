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

  @column({ columnName: 'reorder_delay' })
  declare reorderDelay: number

  /** ITMMASTER.PCUSTUCOE_1 — US par palette (#119). null = pas de coefficient. */
  @column({ columnName: 'us_par_palette' })
  declare usParPalette: number | null

  /**
   * `ITMMASTER.ITMSTA_0` — menu local 246 : 1 Actif, 2 Élaboration, 3 En
   * rupture, 4 Non renouvelé, 5 Périmé, 6 Non utilisable.
   *
   * La table porte TOUS les statuts depuis 08/08/2026 (cf. migration) : filtrer
   * sur `ARTICLE_ACTIF` là où l'on veut le seul parc vivant.
   */
  @column()
  declare status: number

  @column({ columnName: 'synced_at' })
  declare syncedAt: number
}
