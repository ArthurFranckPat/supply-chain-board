import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, belongsTo } from '@adonisjs/lucid/orm'
import type { HasMany, BelongsTo } from '@adonisjs/lucid/types/relations'
import MfgItem from '#models/x3/mfgitm'
import MfgMat from '#models/x3/mfgmat'
import MfgOpe from '#models/x3/mfgope'
import Orders from '#models/x3/orders'
import LocalMenu from '#models/local_menu'

export default class MfgHead extends BaseModel {
  static table = 'MFGHEAD'
  static connection = 'x3'
  static primaryKey = 'numeroOrdreDeFabrication'

  @column({ columnName: 'ALLSTA_0' })
  declare statutAllocation: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'AVAMFGQTY_0' })
  declare quantiteProductible: string | null

  @column({ columnName: 'CFMFLG_0' })
  declare validee: string | null

  @column({ columnName: 'CLCSCDLTI_0' })
  declare cycleJalonnementCalcule: string | null

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

  @column({ columnName: 'DETALLNBR_0' })
  declare nombreAllocationsDetail: string | null

  @column.date({ columnName: 'EARSTRDAT_0' })
  declare premiereDateDebut: DateTime | null

  @column.date({ columnName: 'ENDDAT_0' })
  declare dateFin: DateTime | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'EXTQTY_0' })
  declare quantitePrevue: string | null

  @column.date({ columnName: 'FITCAPEND_0' })
  declare dateFinCapaciteFinie: DateTime | null

  @column.date({ columnName: 'FITCAPSTR_0' })
  declare dateDebutCapaciteFinie: DateTime | null

  @column({ columnName: 'GFSPUBTIM_0' })
  declare dateheureOptimise: string | null

  @column.date({ columnName: 'INFCAPEND_0' })
  declare dateFinCapaciteInfinie: DateTime | null

  @column.date({ columnName: 'INFCAPSTR_0' })
  declare dateDebutCapaciteInfinie: DateTime | null

  @column({ columnName: 'ITMCLENBR_0' })
  declare nombreArticlesSoldes: string | null

  @column({ columnName: 'ITMLINNBR_0' })
  declare nombreArticlesLances: string | null

  @column.date({ columnName: 'LATENDDAT_0' })
  declare derniereDateFin: DateTime | null

  @column({ columnName: 'LTIREDCOE_0' })
  declare coefficientDeReductionDuDelai: string | null

  @column({ columnName: 'MATCLENBR_0' })
  declare nombreMatieresSoldees: string | null

  @column({ columnName: 'MATLINNBR_0' })
  declare nombreMatieres: string | null

  @column({ columnName: 'MFGFCY_0' })
  declare siteProduction: string | null

  @column({ columnName: 'MFGMOD_0' })
  declare modeLancement: string | null

  @column({ columnName: 'MFGNUM_0' })
  declare numeroOrdreDeFabrication: string | null

  @column({ columnName: 'MFGPIO_0' })
  declare priorite: string | null

  @column({ columnName: 'MFGSTA_0' })
  declare statutOrdreDeFabrication: string | null

  @column({ columnName: 'MFGTEX_0' })
  declare texteProduction: string | null

  @column({ columnName: 'MFGTRKFLG_0' })
  declare flagSuivi: string | null

  @column({ columnName: 'MTOREF_0' })
  declare reseauMto: string | null

  @column({ columnName: 'NPIPRO_0' })
  declare prototype: string | null

  @column.date({ columnName: 'OBJDAT_0' })
  declare objectifInitial: DateTime | null

  @column({ columnName: 'OPECLENBR_0' })
  declare nombreOperationsSold: string | null

  @column({ columnName: 'OPELINNBR_0' })
  declare nombreOperations: string | null

  @column({ columnName: 'OPTFLG_0' })
  declare flagOptimisation: string | null

  @column({ columnName: 'OPTUSR_0' })
  declare opeOptimisation: string | null

  @column({ columnName: 'OVRALLNBR_0' })
  declare nombreAllocationsGlobales: string | null

  @column({ columnName: 'PLNFCY_0' })
  declare sitePlanification: string | null

  @column({ columnName: 'PRPMATNBR_0' })
  declare nombreDeMatieresPreparees: string | null

  @column({ columnName: 'PRPSTA_0' })
  declare statutPreparationOf: string | null

  @column({ columnName: 'QUACPLQTY_0' })
  declare quantiteRealiseeSousControle: string | null

  @column({ columnName: 'REJCPLQTY_0' })
  declare quantiteRealiseeRejetee: string | null

  @column({ columnName: 'RMNEXTQTY_0' })
  declare quantiteRestante: string | null

  @column({ columnName: 'ROUALT_0' })
  declare alternativeGamme: string | null

  @column({ columnName: 'ROUECCMAJ_0' })
  declare versionMajeure: string | null

  @column({ columnName: 'ROUECCMIN_0' })
  declare versionMineure: string | null

  @column({ columnName: 'ROUNUM_0' })
  declare gammeLancee: string | null

  @column({ columnName: 'SCDFLG_0' })
  declare etatJalonnement: string | null

  @column({ columnName: 'SCDMOD_0' })
  declare modeJalonnement: string | null

  @column({ columnName: 'SHTMATNBR_0' })
  declare nombreDeRuptures: string | null

  @column({ columnName: 'SINUM_0' })
  declare noPieceIntegrale: string | null

  @column.date({ columnName: 'STRDAT_0' })
  declare dateDebut: DateTime | null

  @column({ columnName: 'STU_0' })
  declare uniteStock: string | null

  @column({ columnName: 'SUSFLG_0' })
  declare flagOfSuspendu: string | null

  @column.date({ columnName: 'TRKFIRST_0' })
  declare dateDebutSuivi: DateTime | null

  @column.date({ columnName: 'TRKFIRSTC_0' })
  declare dateDebutSuivi1: DateTime | null

  @column.date({ columnName: 'TRKLAST_0' })
  declare dateFinSuivi: DateTime | null

  @column.date({ columnName: 'TRKLASTC_0' })
  declare dateFinSuivi1: DateTime | null

  @column({ columnName: 'TYPMOD_0' })
  declare typeMode: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModification: string | null

  @column({ columnName: 'WGGFLG_0' })
  declare flagPlanDePesee: string | null

  @column({ columnName: 'WGGSTA_0' })
  declare situationDePesee: string | null

  @column({ columnName: 'X1PDPGEN_0' })
  declare genereDepuisLePdp: string | null

  @column({ columnName: 'X1PRPSTA_0' })
  declare statutPreparation: string | null

  @column({ columnName: 'X1WAVPREP_0' })
  declare vagueDePreparation: string | null

  @column.date({ columnName: 'X4INTERDAT_0' })
  declare dateIntervention: DateTime | null

  @column({ columnName: 'X4NUMDEMAND_0' })
  declare demandeDeService: string | null

  @column({ columnName: 'X4NUMINT_0' })
  declare intervention: string | null

  @column({ columnName: 'X4PANNE_0' })
  declare codePanne: string | null

  @column({ columnName: 'X4SAVORI_0' })
  declare origineSav: string | null

  @column({ columnName: 'XACFLG_0' })
  declare flagAction: string | null

  @column({ columnName: 'XBLOCAGE_0' })
  declare flagBlocage: string | null

  @column.date({ columnName: 'XDATREFEND_0' })
  declare dateFinReference: DateTime | null

  @column.date({ columnName: 'XDATREFSTR_0' })
  declare dateDebutReference: DateTime | null

  @column.date({ columnName: 'XDESCDAT_0' })
  declare dateDescente: DateTime | null

  @column({ columnName: 'XDESCTIM_0' })
  declare heureDescente: string | null

  @column({ columnName: 'XNCFLG_0' })
  declare flagNonConformite: string | null

  @column({ columnName: 'XNIVMNTC_0' })
  declare niveauxDeMaintenanceConcernes: string | null

  @column({ columnName: 'XOBJ1_0' })
  declare objetPartie1: string | null

  @column({ columnName: 'XOBJ2_0' })
  declare objetPartie2: string | null

  @column({ columnName: 'XOBJ3_0' })
  declare objetPartie3: string | null

  @column({ columnName: 'XSSTYPOT_0' })
  declare soustypeOt: string | null

  @column({ columnName: 'XSTACLO_0' })
  declare statutOutillageEnCloture: string | null

  @column({ columnName: 'XSTAOUTC_0' })
  declare statutOutillageEnCreationOt: string | null

  @column({ columnName: 'XTYPOBJ_0' })
  declare typeObjet: string | null

  @column({ columnName: 'XTYPOF_0' })
  declare typeOf: string | null

  @hasMany(() => MfgItem, {
    foreignKey: 'numeroOrdreDeFabrication',
    localKey: 'numeroOrdreDeFabrication',
  })
  declare mfgItemList: HasMany<typeof MfgItem>

  @hasMany(() => MfgMat, {
    foreignKey: 'numeroOrdreDeFabrication',
    localKey: 'numeroOrdreDeFabrication',
  })
  declare mfgMatList: HasMany<typeof MfgMat>

  @hasMany(() => MfgOpe, {
    foreignKey: 'numeroOrdreDeFabrication',
    localKey: 'numeroOrdreDeFabrication',
  })
  declare mfgOpeList: HasMany<typeof MfgOpe>

  // ORDERS.VCRNUM_0 polymorphe — filtre VCRTYP_0 = 10 (OF)
  @hasMany(() => Orders, {
    foreignKey: 'daOrdreSst',
    localKey: 'numeroOrdreDeFabrication',
    onQuery: (query) => query.where('typePiece', 10),
  })
  declare encoursList: HasMany<typeof Orders>

  @belongsTo(() => LocalMenu, { foreignKey: 'statutOrdreDeFabrication', localKey: 'value', onQuery: (q) => q.where('chapter', 317) })
  declare statutOFMenu: BelongsTo<typeof LocalMenu>

  @belongsTo(() => LocalMenu, { foreignKey: 'typeOf', localKey: 'value', onQuery: (q) => q.where('chapter', 1026) })
  declare typeOfMenu: BelongsTo<typeof LocalMenu>

  @belongsTo(() => LocalMenu, { foreignKey: 'modeLancement', localKey: 'value', onQuery: (q) => q.where('chapter', 333) })
  declare modeLancementMenu: BelongsTo<typeof LocalMenu>

  @belongsTo(() => LocalMenu, { foreignKey: 'priorite', localKey: 'value', onQuery: (q) => q.where('chapter', 365) })
  declare prioriteMenu: BelongsTo<typeof LocalMenu>

}
