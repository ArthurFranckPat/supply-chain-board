import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'
import MfgHead from '#models/x3/mfghead'
import Orders from '#models/x3/orders'

export default class MfgItem extends BaseModel {
  static table = 'MFGITM'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'ABCCLS_0' })
  declare categorieAbc: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BASQTY_0' })
  declare quantiteBase: string | null

  @column({ columnName: 'BOMALT_0' })
  declare alternativeNomenclature: string | null

  @column({ columnName: 'BOMOFS_0' })
  declare delaiOperation: string | null

  @column({ columnName: 'BOMOPE_0' })
  declare numeroOperation: string | null

  @column({ columnName: 'BPCNUM_0' })
  declare destinataire: string | null

  @column({ columnName: 'BPCTYPDEN_0' })
  declare typeDestinatairesiteclient: string | null

  @column.date({ columnName: 'CLODAT_0' })
  declare dateCloture: DateTime | null

  @column({ columnName: 'CPLQTY_0' })
  declare quantiteRealiseeTotale: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'CSTFLG_0' })
  declare valorisation: string | null

  @column({ columnName: 'ECCVALMAJ_0' })
  declare versionMajeure: string | null

  @column({ columnName: 'ECCVALMIN_0' })
  declare versionMineure: string | null

  @column.date({ columnName: 'ENDDAT_0' })
  declare dateFin: DateTime | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'EXTQTY_0' })
  declare quantitePrevue: string | null

  @column({ columnName: 'FMI_0' })
  declare origineArticle: string | null

  @column({ columnName: 'ITMLIN_0' })
  declare ligneOf: string | null

  @column({ columnName: 'ITMREF_0' })
  declare article: string | null

  @column({ columnName: 'ITMSTA_0' })
  declare etatLigne: string | null

  @column({ columnName: 'ITMTYP_0' })
  declare typeProduit: string | null

  @column({ columnName: 'LIKQTY_0' })
  declare quantiteLien: string | null

  @column({ columnName: 'LIKQTYCOD_0' })
  declare codeQuantiteLien: string | null

  @column({ columnName: 'LOT_0' })
  declare lot: string | null

  @column({ columnName: 'MFGDES_0' })
  declare designationOf: string | null

  @column({ columnName: 'MFGFCY_0' })
  declare siteProduction: string | null

  @column({ columnName: 'MFGLIN_0' })
  declare noLigne: string | null

  @column({ columnName: 'MFGNUM_0' })
  declare numeroOrdreDeFabrication: string | null

  @column({ columnName: 'MFGPIO_0' })
  declare priorite: string | null

  @column({ columnName: 'MFGSTA_0' })
  declare statutOrdreDeFabrication: string | null

  @column({ columnName: 'MFITRKFLG_0' })
  declare flagSuivi: string | null

  @column({ columnName: 'PJT_0' })
  declare affaire: string | null

  @column({ columnName: 'PLANNER_0' })
  declare planificateur: string | null

  @column({ columnName: 'PLNFCY_0' })
  declare sitePlanification: string | null

  @column({ columnName: 'QTYRND_0' })
  declare arrondiQuantite: string | null

  @column({ columnName: 'QUACPLQTY_0' })
  declare quantiteRealiseeSousControle: string | null

  @column({ columnName: 'REJCPLQTY_0' })
  declare quantiteRealiseeRejetee: string | null

  @column({ columnName: 'RMNEXTQTY_0' })
  declare quantiteRestante: string | null

  @column.date({ columnName: 'STRDAT_0' })
  declare dateDebut: DateTime | null

  @column({ columnName: 'STU_0' })
  declare uniteStock: string | null

  @column({ columnName: 'TCLCOD_0' })
  declare categorieArticle: string | null

  @column.date({ columnName: 'TRKFIRST_0' })
  declare datePremierSuivi: DateTime | null

  @column.date({ columnName: 'TRKFIRSTC_0' })
  declare dateDebutSuivi: DateTime | null

  @column.date({ columnName: 'TRKLAST_0' })
  declare dateDernierSuivi: DateTime | null

  @column.date({ columnName: 'TRKLASTC_0' })
  declare dateFinSuivi: DateTime | null

  @column({ columnName: 'TSICOD_0' })
  declare familleStatistique: string | null

  @column({ columnName: 'UOM_0' })
  declare uniteLancement: string | null

  @column({ columnName: 'UOMEXTQTY_0' })
  declare quantiteLancement: string | null

  @column({ columnName: 'UOMSTUCOE_0' })
  declare coefficientUomus: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModification: string | null

  @column({ columnName: 'VCRLINORI_0' })
  declare noLignePieceOrigine: string | null

  @column({ columnName: 'VCRNUMORI_0' })
  declare noPieceOrigineNoRecOuNoOf: string | null

  @column({ columnName: 'VCRSEQORI_0' })
  declare noSequencePieceOrigine: string | null

  @column({ columnName: 'VCRTYPORI_0' })
  declare typePieceOrigine: string | null

  @column({ columnName: 'WIPNUM_0' })
  declare numeroOrdreEncours: string | null

  @column.date({ columnName: 'X4DATPER_0' })
  declare datePeremption: DateTime | null

  @column.date({ columnName: 'X4DATREF_0' })
  declare dateReferencePeremption: DateTime | null

  @column({ columnName: 'XNBEMPR_0' })
  declare nombreDempreintes: string | null

  @column({ columnName: 'XVERSIONC_0' })
  declare versionCompose: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'article', localKey: 'article' })
  declare ficheArticle: BelongsTo<typeof ItemMaster>

  @belongsTo(() => MfgHead, {
    foreignKey: 'numeroOrdreDeFabrication',
    localKey: 'numeroOrdreDeFabrication',
  })
  declare ordreFabrication: BelongsTo<typeof MfgHead>

  // ORDERS.WIPTYP_0 = 5 → ligne article OF
  @hasMany(() => Orders, {
    foreignKey: 'daOrdreSst',
    localKey: 'numeroOrdreDeFabrication',
    onQuery: (query) => query.where('typeOrdre', 5),
  })
  declare encoursList: HasMany<typeof Orders>

}
