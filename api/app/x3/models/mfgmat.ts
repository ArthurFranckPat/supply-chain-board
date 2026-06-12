import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'
import MfgHead from '#models/x3/mfghead'
import Orders from '#models/x3/orders'

export default class MfgMat extends BaseModel {
  static table = 'MFGMAT'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'ALLQTY_0' })
  declare quantiteAllouee: string | null

  @column({ columnName: 'ALLSTA_0' })
  declare statutAllocation: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BASQTY_0' })
  declare quantiteBase: string | null

  @column({ columnName: 'BOMOFS_0' })
  declare delaiOperation: string | null

  @column({ columnName: 'BOMOPE_0' })
  declare numeroOperation: string | null

  @column({ columnName: 'BOMQTY_0' })
  declare quantiteLienUm: string | null

  @column({ columnName: 'BOMSEQ_0' })
  declare sequenceNomenclature: string | null

  @column({ columnName: 'BOMSEQORI_0' })
  declare sequenceOrigine: string | null

  @column({ columnName: 'BOMSHO_0' })
  declare designationLien: string | null

  @column({ columnName: 'BOMSTUCOE_0' })
  declare coefficientUomus: string | null

  @column({ columnName: 'BOMUOM_0' })
  declare uom: string | null

  @column({ columnName: 'CPNTYP_0' })
  declare typeComposant: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'CTN_0' })
  declare recipient: string | null

  @column({ columnName: 'CUMFLG_0' })
  declare besoinCumule: string | null

  @column({ columnName: 'CUMFXDQTY_0' })
  declare quantiteForfaitaireCumulee: string | null

  @column({ columnName: 'DEFPOT_0' })
  declare titreParDefaut: string | null

  @column({ columnName: 'ECCVALMAJ_0' })
  declare versionMajeure: string | null

  @column({ columnName: 'ECCVALMIN_0' })
  declare versionMineure: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'ISSMGTCOD_0' })
  declare modeDestockage: string | null

  @column({ columnName: 'ITMREF_0' })
  declare article: string | null

  @column({ columnName: 'LIKQTY_0' })
  declare quantiteLien: string | null

  @column({ columnName: 'LIKQTYCOD_0' })
  declare codeQuantiteLien: string | null

  @column({ columnName: 'LOC_0' })
  declare emplacement: string | null

  @column({ columnName: 'LOT_0' })
  declare lotPreferentiel: string | null

  @column({ columnName: 'MATSTA_0' })
  declare statutMatiere: string | null

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

  @column({ columnName: 'MFMTEX_0' })
  declare texteLienNomenclature: string | null

  @column({ columnName: 'MFMTRKFLG_0' })
  declare flagSuivi: string | null

  @column({ columnName: 'PICPRN_0' })
  declare impressionBonMatieres: string | null

  @column({ columnName: 'PKC_0' })
  declare codeAServir: string | null

  @column({ columnName: 'PLANNER_0' })
  declare planificateur: string | null

  @column({ columnName: 'PLNFCY_0' })
  declare sitePlanification: string | null

  @column({ columnName: 'PRPSTA_0' })
  declare statutPreparation: string | null

  @column({ columnName: 'QTYCOD_0' })
  declare uniteDeGestion: string | null

  @column({ columnName: 'QTYRND_0' })
  declare arrondiQuantite: string | null

  @column({ columnName: 'RELSCATIA_0' })
  declare perteAuLancement: string | null

  @column.date({ columnName: 'RETDAT_0' })
  declare dateBesoin: DateTime | null

  @column({ columnName: 'RETQTY_0' })
  declare quantiteBesoin: string | null

  @column({ columnName: 'RETQTYORI_0' })
  declare quantiteOrigine: string | null

  @column({ columnName: 'SCA_0' })
  declare pourcentageDeRebut: string | null

  @column({ columnName: 'SCOFLG_0' })
  declare typeDapprovisionnement: string | null

  @column({ columnName: 'SHTQTY_0' })
  declare quantiteEnRupture: string | null

  @column({ columnName: 'STA_0' })
  declare statutPreferentiel: string | null

  @column({ columnName: 'STDQTY_0' })
  declare quantiteStandard: string | null

  @column({ columnName: 'STOMGTCOD_0' })
  declare gestionStock: string | null

  @column({ columnName: 'STU_0' })
  declare uniteStock: string | null

  @column.date({ columnName: 'TRKFIRST_0' })
  declare dateDebutSuivi: DateTime | null

  @column.date({ columnName: 'TRKFIRSTC_0' })
  declare dateDebutSuivi1: DateTime | null

  @column.date({ columnName: 'TRKLAST_0' })
  declare dateFinSuivi: DateTime | null

  @column.date({ columnName: 'TRKLASTC_0' })
  declare dateFinSuivi1: DateTime | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModification: string | null

  @column({ columnName: 'USEQTY_0' })
  declare quantiteConsommee: string | null

  @column({ columnName: 'WGGBOX_0' })
  declare enCoursDePesee: string | null

  @column({ columnName: 'WGGSTA_0' })
  declare situationDePesee: string | null

  @column({ columnName: 'WGGSTAAVS_0' })
  declare situationPeseeAvantSoldee: string | null

  @column({ columnName: 'WIPNUM_0' })
  declare numeroOrdre: string | null

  @column({ columnName: 'X1CNI_0' })
  declare contrainteObligatoire: string | null

  @column({ columnName: 'X1TOPREP_0' })
  declare aPreparer: string | null

  @column({ columnName: 'X4LIMEND_0' })
  declare pieceReellePieceDeSimulation: string | null

  @column({ columnName: 'X4LIMFLG_0' })
  declare versionActive: string | null

  @column({ columnName: 'X4LIMSTR_0' })
  declare versionSaisie: string | null

  @column({ columnName: 'X4LIMTYP_0' })
  declare versionArretee: string | null

  @column({ columnName: 'X4PKC_0' })
  declare codeAServir1: string | null

  @column({ columnName: 'XCOMBOMP_0' })
  declare commentaireNomenclature: string | null

  @column({ columnName: 'XQSP_0' })
  declare qsp: string | null

  @column({ columnName: 'XRETQTYTOT_0' })
  declare besoinTotal: string | null

  @column({ columnName: 'XSERNUM_0' })
  declare numeroSerie: string | null

  @column({ columnName: 'XVERSION_0' })
  declare version: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'article', localKey: 'article' })
  declare ficheArticle: BelongsTo<typeof ItemMaster>

  @belongsTo(() => MfgHead, {
    foreignKey: 'numeroOrdreDeFabrication',
    localKey: 'numeroOrdreDeFabrication',
  })
  declare ordreFabrication: BelongsTo<typeof MfgHead>

  // ORDERS.WIPTYP_0 = 6 → ligne matière OF
  @hasMany(() => Orders, {
    foreignKey: 'daOrdreSst',
    localKey: 'numeroOrdreDeFabrication',
    onQuery: (query) => query.where('typeOrdre', 6),
  })
  declare encoursList: HasMany<typeof Orders>

}
