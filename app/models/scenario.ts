import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Scénario de plan (issue #57). Les mutations sont stockées en JSON texte et
 * (dé)sérialisées par `ScenarioStore` — le modèle reste un simple miroir de table.
 */
export default class Scenario extends BaseModel {
  static table = 'scenarios'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare nom: string

  @column()
  declare description: string | null

  @column()
  declare auteur: string | null

  @column()
  declare statut: string

  /** JSON sérialisé d'un PlanMutation[]. */
  @column()
  declare mutations: string

  @column()
  declare evaluatedAt: string | null

  @column()
  declare dataAt: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
