import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Règle de routage d'impression (issue #85, lot 2) : quel atelier, quel
 * document, quelle destination X3.
 */
export default class PrintDestination extends BaseModel {
  static table = 'print_destinations'

  @column({ isPrimary: true })
  declare id: number

  /** STOLOC de l'atelier ; '' = règle par défaut. */
  @column()
  declare stoloc: string

  /** 'BONTRV' | 'BSM'. */
  @column({ columnName: 'doc_type' })
  declare docType: string

  /** Code `APRINTER.COD_0`. */
  @column({ columnName: 'dest_code' })
  declare destCode: string

  /** true = destination sans effet physique (fichier/mail/aperçu). */
  @column()
  declare sandbox: boolean

  @column({ columnName: 'dest_label' })
  declare destLabel: string

  @column()
  declare note: string

  @column({ columnName: 'updated_at' })
  declare updatedAt: number

  @column({ columnName: 'updated_by' })
  declare updatedBy: string
}
