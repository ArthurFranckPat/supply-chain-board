import { BaseModel, column } from '@adonisjs/lucid/orm'

/**
 * Document imprimable du dossier d'OF (issue #85).
 *
 * Le couple d'états dépend du dossier X3 : sur AE1 le bon de travail est
 * `RECETTE`, pas le `BONTRV` standard. Ces codes sont donc de la donnée, pas un
 * type figé dans le code.
 */
export default class PrintDocument extends BaseModel {
  static table = 'print_documents'

  @column({ isPrimary: true })
  declare id: number

  /** Code état `AREPORT.RPTCOD` (GESARP), passé tel quel à ZSOAPPRINT. */
  @column()
  declare code: string

  /** Libellé métier — l'atelier ne parle pas en codes X3. */
  @column()
  declare label: string

  /** Ordre d'impression du dossier. */
  @column()
  declare position: number

  @column()
  declare active: boolean

  @column({ columnName: 'updated_at' })
  declare updatedAt: number

  @column({ columnName: 'updated_by' })
  declare updatedBy: string
}
