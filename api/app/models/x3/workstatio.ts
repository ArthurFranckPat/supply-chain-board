import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'
import RoutingOp from '#models/x3/rouope'

export default class WorkStation extends BaseModel {
  static table = 'WORKSTATIO'
  static connection = 'x3'
  static primaryKey = 'posteDeCharge'

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'CLEPCTAUT_0' })
  declare pourSoldeAutomatique: string | null

  @column({ columnName: 'CONSTRAINT_0' })
  declare contraint: string | null

  @column({ columnName: 'CPLHOUTIM_0' })
  declare cumulDesTempsRealisesEnHeures: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'DSPLEV_0' })
  declare niveauAffichage: string | null

  @column({ columnName: 'EFF_0' })
  declare efficienceEnPourcentage: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'EXTHOUTIM_0' })
  declare cumulDesTempsPrevusEnHeures: string | null

  @column({ columnName: 'GRPFLG_0' })
  declare regroupement: string | null

  @column({ columnName: 'GRPHOR_0' })
  declare horizonRegroupement: string | null

  @column({ columnName: 'OPTCOD_0' })
  declare codeOptimisation: string | null

  @column({ columnName: 'PCCCOD_0' })
  declare natureDeDepense: string | null

  @column({ columnName: 'QLFLEV_0' })
  declare niveauDeQualification: string | null

  @column({ columnName: 'RCCP_0' })
  declare pgc: string | null

  @column({ columnName: 'RPLAUTO_0' })
  declare remplacementAutomatique: string | null

  @column({ columnName: 'RUNBRKFLG_0' })
  declare executerPendantPause: string | null

  @column({ columnName: 'SBBFLG_0' })
  declare distinctionDesExemplaires: string | null

  @column({ columnName: 'SHR_0' })
  declare pourcentageDePerte: string | null

  @column({ columnName: 'STOLOC_0' })
  declare emplacementDeStockage: string | null

  @column({ columnName: 'TWD_0' })
  declare schemaHebdomadaire: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModif: string | null

  @column({ columnName: 'USE_0' })
  declare utilisationEnPourcentage: string | null

  @column({ columnName: 'VLTCCE_0' })
  declare sectionValorisation: string | null

  @column({ columnName: 'WCR_0' })
  declare centreDeCharge: string | null

  @column({ columnName: 'WCRFCY_0' })
  declare siteRattachement: string | null

  @column({ columnName: 'WST_0' })
  declare posteDeCharge: string | null

  @column({ columnName: 'WSTDES_0' })
  declare intitulePosteDeCharge: string | null

  @column({ columnName: 'WSTDESAXX_0' })
  declare intitulePosteDeCharge1: string | null

  @column({ columnName: 'WSTNBR_0' })
  declare nombreDePostes: string | null

  @column({ columnName: 'WSTSHO_0' })
  declare intituleCourt: string | null

  @column({ columnName: 'WSTSHOAXX_0' })
  declare intituleCourt1: string | null

  @column({ columnName: 'WSTTYP_0' })
  declare typeDuPosteDeCharge: string | null

  @column({ columnName: 'X4CADTH_0' })
  declare cadenceTheoriqueMoyenne: string | null

  @column({ columnName: 'X4ITMSAV_0' })
  declare articleSav: string | null

  @column({ columnName: 'X4POPESIM_0' })
  declare plusieursOpeSimul: string | null

  @column({ columnName: 'X4PSUIPOI_0' })
  declare suiviPointage: string | null

  @column({ columnName: 'XPOURCH_0' })
  declare chargeMax2: string | null

  @column({ columnName: 'XPOURCH0_0' })
  declare chargeMax1: string | null

  @column({ columnName: 'ZFLGIND_0' })
  declare exclureDesIndicateurs: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'articleSav', localKey: 'article' })
  declare ficheArticleSav: BelongsTo<typeof ItemMaster>

  @hasMany(() => RoutingOp, { foreignKey: 'posteDeChargePrincipal', localKey: 'posteDeCharge' })
  declare routingOpList: HasMany<typeof RoutingOp>

}
