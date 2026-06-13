/**
 * X3 OF (Ordre de Fabrication) -- vue ZPREVCHARGEPF.
 *
 * Read-only model reflecting the X3 Oracle view. No migration needed.
 * Fields are inferred from the SQL query in the repository.
 */

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class X3Of extends BaseModel {
  static table = 'ZPREVCHARGEPF'

  @column({ isPrimary: true })
  declare num_of: string

  @column()
  declare article: string

  @column()
  declare description: string

  @column()
  declare statut: number

  @column()
  declare qte_restante: number

  @column.date()
  declare date_debut: DateTime | null

  @column.date()
  declare date_fin: DateTime | null

  @column()
  declare methode_obtention_livraison: string | null
}
