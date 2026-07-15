import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'

export default class StockAlloc extends BaseModel {
  static table = 'STOALL'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column.date({ columnName: 'ALLDAT_0' })
  declare finReservation: DateTime | null

  @column({ columnName: 'ALLTYP_0' })
  declare typeAllocation: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column.date({ columnName: 'BESDAT_0' })
  declare dateBesoin: DateTime | null

  @column({ columnName: 'BPAADD_0' })
  declare adresseLivraison: string | null

  @column({ columnName: 'BPRNUM_0' })
  declare numeroTiers: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'DEFLOC_0' })
  declare empExclusifDeConsoParDefaut: string | null

  @column({ columnName: 'DEFLOCTYP_0' })
  declare typeEmpExclusifDeConsoDefaut: string | null

  @column({ columnName: 'DEFWRH_0' })
  declare depotConsoDefaut: string | null

  @column({ columnName: 'ECCVALMAJ_0' })
  declare versionMajeure: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'ITMREF_0' })
  declare article: string | null

  @column({ columnName: 'LOC_0' })
  declare emplacementRupture: string | null

  @column({ columnName: 'LOT_0' })
  declare lotRupture: string | null

  @column({ columnName: 'MVTDES_0' })
  declare designationMouvement: string | null

  @column({ columnName: 'PRECOD_0' })
  declare codePreparation: string | null

  @column({ columnName: 'PRENUM_0' })
  declare noPreparation: string | null

  @column({ columnName: 'QTYSTU_0' })
  declare quantiteUs: string | null

  @column({ columnName: 'QTYSTUACT_0' })
  declare quantiteActiveUs: string | null

  @column({ columnName: 'SCOFLG_0' })
  declare typeDapprovisionnement: string | null

  @column({ columnName: 'SEQ_0' })
  declare sequence: string | null

  @column({ columnName: 'SERNUM_0' })
  declare noSerieRupture: string | null

  @column({ columnName: 'SLO_0' })
  declare slot: string | null

  @column({ columnName: 'SRGLIN_0' })
  declare noLigneListe: string | null

  @column({ columnName: 'SRGLOC_0' })
  declare emplacementExclusifConsommation: string | null

  @column({ columnName: 'SRGNUM_0' })
  declare noListeARanger: string | null

  @column({ columnName: 'SRGQTYSTU_0' })
  declare quantiteUsARanger: string | null

  @column({ columnName: 'STA_0' })
  declare statut: string | null

  @column({ columnName: 'STOCOU_0' })
  declare chronoStock: string | null

  @column({ columnName: 'STOFCY_0' })
  declare siteStockage: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModif: string | null

  @column({ columnName: 'VCRLIN_0' })
  declare noLignePiece: string | null

  @column({ columnName: 'VCRNUM_0' })
  declare noPieceNoRecNoLivOuNoOf: string | null

  @column({ columnName: 'VCRSEQ_0' })
  declare noSequencePiece: string | null

  @column({ columnName: 'VCRTYP_0' })
  declare typePiece: string | null

  @column({ columnName: 'WRH_0' })
  declare depotRupture: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'article', localKey: 'article' })
  declare ficheArticle: BelongsTo<typeof ItemMaster>
}
