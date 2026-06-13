import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'
import Workstatio from '#models/x3/workstatio'

export default class RoutingOp extends BaseModel {
  static table = 'ROUOPE'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'ALTOPECOD_0' })
  declare operationAlternative: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BASQTY_0' })
  declare quantiteBase: string | null

  @column({ columnName: 'BPAADD_0' })
  declare adresse: string | null

  @column({ columnName: 'BPRNUM_0' })
  declare tiers: string | null

  @column({ columnName: 'CAD_0' })
  declare cadence: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'EFF_0' })
  declare efficienceEn: string | null

  @column({ columnName: 'EQUNUM_0' })
  declare outillage: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'FCY_0' })
  declare site: string | null

  @column({ columnName: 'FXGNUM_0' })
  declare typeContenant: string | null

  @column({ columnName: 'GRPSETTIM_0' })
  declare tempsReglageGroupe: string | null

  @column({ columnName: 'ITMREF_0' })
  declare gamme: string | null

  @column({ columnName: 'LABNBR_0' })
  declare nombreDePostesMo: string | null

  @column({ columnName: 'LABWST_0' })
  declare posteDeChargeMaindoeuvre: string | null

  @column({ columnName: 'OPELABCOE_0' })
  declare coefTempsMaindoeuvreOperatoire: string | null

  @column({ columnName: 'OPENUM_0' })
  declare numeroOperation: string | null

  @column({ columnName: 'OPENUMLEV_0' })
  declare suffixeOperation: string | null

  @column({ columnName: 'OPEPLNNUM_0' })
  declare planOperation: string | null

  @column({ columnName: 'OPEROUPCT_0' })
  declare imageOperation: string | null

  @column({ columnName: 'OPESTUCOE_0' })
  declare coefConversionUsuo: string | null

  @column({ columnName: 'OPESTUFOR_0' })
  declare formuleCoefUsuo: string | null

  @column({ columnName: 'OPETIM_0' })
  declare tpsOperatoire: string | null

  @column({ columnName: 'OPEUOM_0' })
  declare uniteOperation: string | null

  @column({ columnName: 'PRGNUM_0' })
  declare programme: string | null

  @column({ columnName: 'PRPTIM_0' })
  declare tpsPreparation: string | null

  @column({ columnName: 'PSPTIM_0' })
  declare tempsPostOperatoire: string | null

  @column({ columnName: 'REFPRI_0' })
  declare prixReference: string | null

  @column({ columnName: 'ROODES_0' })
  declare designationOperation: string | null

  @column({ columnName: 'ROOTEX_0' })
  declare texteOperation: string | null

  @column({ columnName: 'ROOTIMCOD_0' })
  declare typeTempsOperatoire: string | null

  @column({ columnName: 'ROUALT_0' })
  declare alternativeGamme: string | null

  @column({ columnName: 'RPLIND_0' })
  declare indiceRemplacement: string | null

  @column({ columnName: 'RSTMAC_0' })
  declare restrictionMachine: string | null

  @column({ columnName: 'SCHGRP_0' })
  declare critereRegroupement: string | null

  @column({ columnName: 'SCHGRPFOR_0' })
  declare formuleRegroupement: string | null

  @column({ columnName: 'SCHSBB_0' })
  declare critereDeDistinction: string | null

  @column({ columnName: 'SCHSBBFOR_0' })
  declare formuleDistinction: string | null

  @column({ columnName: 'SCOCOD_0' })
  declare codeSoustraitance: string | null

  @column({ columnName: 'SCOITMREF_0' })
  declare articleDeSoustraitance: string | null

  @column({ columnName: 'SCOWST_0' })
  declare posteDeChargeSoustraitance: string | null

  @column({ columnName: 'SETLABCOE_0' })
  declare coefTempsMaindoeuvreReglage: string | null

  @column({ columnName: 'SETTIM_0' })
  declare tempsReglage: string | null

  @column({ columnName: 'SHR_0' })
  declare pourcentageDePerte: string | null

  @column({ columnName: 'SPLCOD_0' })
  declare fractionnementCapaFinie: string | null

  @column({ columnName: 'SPLMAXNBR_0' })
  declare nbMaxiFractionnementCapaFinie: string | null

  @column({ columnName: 'STDOPENUM_0' })
  declare operationStandard: string | null

  @column({ columnName: 'TECCRD_0' })
  declare ficheTechnique: string | null

  @column({ columnName: 'TIMCOD_0' })
  declare uniteDeGestion: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModif: string | null

  @column.date({ columnName: 'VALENDDAT_0' })
  declare dateFin: DateTime | null

  @column.date({ columnName: 'VALSTRDAT_0' })
  declare dateDebut: DateTime | null

  @column({ columnName: 'WAITIM_0' })
  declare tempsAttente: string | null

  @column({ columnName: 'WST_0' })
  declare posteDeChargePrincipal: string | null

  @column({ columnName: 'WSTNBR_0' })
  declare nombreDePostes: string | null

  @column({ columnName: 'X1FTCOD_0' })
  declare codeGammeDanalyses: string | null

  @column({ columnName: 'X1TECCRD_0' })
  declare ficheTechniqueComp: string | null

  @column({ columnName: 'X4LIMEND_0' })
  declare pieceReellePieceDeSimulation: string | null

  @column({ columnName: 'X4LIMFLG_0' })
  declare versionActive: string | null

  @column({ columnName: 'X4LIMSTR_0' })
  declare versionSaisie: string | null

  @column({ columnName: 'X4LIMTYP_0' })
  declare versionArretee: string | null

  @column({ columnName: 'XCADTHEO_0' })
  declare cadenceTheo: string | null

  @column({ columnName: 'XEMPREINTE_0' })
  declare nbDempreintes: string | null

  @column({ columnName: 'XFCY_0' })
  declare site1: string | null

  @column({ columnName: 'XFTCOD_0' })
  declare codeFicheTechnique: string | null

  @column({ columnName: 'XMACHINE_0' })
  declare codeMachine: string | null

  @column({ columnName: 'XREPERE_0' })
  declare repere: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'gamme', localKey: 'article' })
  declare ficheArticle: BelongsTo<typeof ItemMaster>

  @belongsTo(() => Workstatio, { foreignKey: 'posteDeChargePrincipal', localKey: 'posteDeCharge' })
  declare posteDeCharge: BelongsTo<typeof Workstatio>
}
