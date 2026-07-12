import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'

export default class Bom extends BaseModel {
  static table = 'BOM'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'ACSCOD_0' })
  declare codeAcces: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BASQTY_0' })
  declare quantiteBase: string | null

  @column.date({ columnName: 'BOHENDDAT_0' })
  declare dateFinValidite: DateTime | null

  @column.date({ columnName: 'BOHSTRDAT_0' })
  declare dateDebutValidite: DateTime | null

  @column({ columnName: 'BOMALT_0' })
  declare alternativeNomenclature: string | null

  @column({ columnName: 'BOMALTTYP_0' })
  declare typeAlternativeNomenclature: string | null

  @column({ columnName: 'BOMDESAXX_0' })
  declare designationEntete: string | null

  @column({ columnName: 'BOMRLE_0' })
  declare indiceRevision: string | null

  @column({ columnName: 'CFGVCRNUM_0' })
  declare npieceConfig: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'HEATEX_0' })
  declare texteEntete: string | null

  @column({ columnName: 'IDENT1_0' })
  declare identifiant1: string | null

  @column({ columnName: 'ITMREF_0' })
  declare articleParent: string | null

  @column({ columnName: 'NPIPRO_0' })
  declare prototype: string | null

  @column({ columnName: 'PLMATTURL_0' })
  declare documentsLies: string | null

  @column({ columnName: 'QTYCOD_0' })
  declare uniteDeGestion: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModification: string | null

  @column({ columnName: 'USESTA_0' })
  declare statutUtilisation: string | null

  @column({ columnName: 'X1_PREFIX_0' })
  declare prefixe: string | null

  @column({ columnName: 'XCFCOD_0' })
  declare codeVariante: string | null

  @column({ columnName: 'XCOMMCPVV_0' })
  declare commentCumulPvv: string | null

  @column({ columnName: 'XEXPINF_0' })
  declare indicateurExport: string | null

  @column.date({ columnName: 'XEXPINFDAT_0' })
  declare dateExport: DateTime | null

  @column({ columnName: 'XNBEMPR_0' })
  declare nombreDempreintes: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'articleParent', localKey: 'article' })
  declare ficheArticleParent: BelongsTo<typeof ItemMaster>
}
