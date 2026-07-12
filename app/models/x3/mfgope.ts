import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import MfgHead from '#models/x3/mfghead'
import PurchaseOrder from '#models/x3/porder'

export default class MfgOpe extends BaseModel {
  static table = 'MFGOPE'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'ALTOPECOD_0' })
  declare operationAlternativePmsim: string | null

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

  @column({ columnName: 'CPLCRG_0' })
  declare fraisReel: string | null

  @column({ columnName: 'CPLLAB_0' })
  declare posteMoRealise: string | null

  @column({ columnName: 'CPLLABNBR_0' })
  declare nombrePostesMoRealise: string | null

  @column({ columnName: 'CPLOPETIM_0' })
  declare tempsOperationRealise: string | null

  @column({ columnName: 'CPLPRI_0' })
  declare prixReel: string | null

  @column({ columnName: 'CPLQTY_0' })
  declare quantiteRealiseeTotale: string | null

  @column({ columnName: 'CPLSETTIM_0' })
  declare tempsReglageRealise: string | null

  @column({ columnName: 'CPLUNTTIM_0' })
  declare tempsUnitaireRealise: string | null

  @column({ columnName: 'CPLWST_0' })
  declare posteRealise: string | null

  @column({ columnName: 'CPLWSTNBR_0' })
  declare nombrePostesRealise: string | null

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

  @column({ columnName: 'EXTLAB_0' })
  declare posteMoPrevu: string | null

  @column({ columnName: 'EXTLABNBR_0' })
  declare nombrePostesMoPrevus: string | null

  @column({ columnName: 'EXTOPETIM_0' })
  declare tempsOperationPrevu: string | null

  @column({ columnName: 'EXTPRI_0' })
  declare prixPrevu: string | null

  @column({ columnName: 'EXTQTY_0' })
  declare quantitePrevue: string | null

  @column({ columnName: 'EXTSETTIM_0' })
  declare tempsReglagePrevu: string | null

  @column({ columnName: 'EXTSTRQTY_0' })
  declare quantiteEnUsSstraitance: string | null

  @column({ columnName: 'EXTSTUQTY_0' })
  declare quantitePrevueUs: string | null

  @column({ columnName: 'EXTUNTTIM_0' })
  declare tempsUnitairePrevu: string | null

  @column({ columnName: 'EXTWST_0' })
  declare postePrevu: string | null

  @column({ columnName: 'EXTWSTNBR_0' })
  declare nombrePostesPrevus: string | null

  @column.date({ columnName: 'FITCAPEND_0' })
  declare dateFinCapaciteFinie: DateTime | null

  @column.date({ columnName: 'FITCAPSTR_0' })
  declare dateDebutCapaciteFinie: DateTime | null

  @column.date({ columnName: 'FRCSTRDAT_0' })
  declare debutForceOrdonnancement: DateTime | null

  @column({ columnName: 'FRCSTRHOU_0' })
  declare heureForceeOrdonnancement: string | null

  @column({ columnName: 'FXGNUM_0' })
  declare typeContenant: string | null

  @column({ columnName: 'GRPSETTIM_0' })
  declare tempsReglageGroupePmsim: string | null

  @column.date({ columnName: 'INFCAPEND_0' })
  declare dateFinCapaciteInfinie: DateTime | null

  @column.date({ columnName: 'INFCAPSTR_0' })
  declare dateDebutCapaciteInfinie: DateTime | null

  @column({ columnName: 'INVQTY_0' })
  declare quantiteFacturee: string | null

  @column({ columnName: 'MFGFCY_0' })
  declare siteProduction: string | null

  @column({ columnName: 'MFGNUM_0' })
  declare numeroOrdreDeFabrication: string | null

  @column({ columnName: 'MFGPIO_0' })
  declare priorite: string | null

  @column({ columnName: 'MFGSTA_0' })
  declare statutOrdreDeFabrication: string | null

  @column({ columnName: 'MFOTEX_0' })
  declare texte: string | null

  @column({ columnName: 'MFOTRKFLG_0' })
  declare flagSuivi: string | null

  @column.date({ columnName: 'OPEEND_0' })
  declare dateFin: DateTime | null

  @column({ columnName: 'OPELABCOE_0' })
  declare coefTempsMaindoeuvreOperatoire: string | null

  @column({ columnName: 'OPENUM_0' })
  declare numeroOperation: string | null

  @column({ columnName: 'OPENUMLEV_0' })
  declare suffixeOperationPmsim: string | null

  @column({ columnName: 'OPEPLNNUM_0' })
  declare planOperation: string | null

  @column({ columnName: 'OPEROUPCT_0' })
  declare imageOperation: string | null

  @column({ columnName: 'OPESPLNUM_0' })
  declare fractionDebutOperation: string | null

  @column({ columnName: 'OPESTA_0' })
  declare statutOperation: string | null

  @column.date({ columnName: 'OPESTR_0' })
  declare dateDebut: DateTime | null

  @column({ columnName: 'OPESTRCOE_0' })
  declare coefficientUsStruo: string | null

  @column({ columnName: 'OPESTUCOE_0' })
  declare coefConversionUsuo: string | null

  @column({ columnName: 'OPEUOM_0' })
  declare uniteOperation: string | null

  @column({ columnName: 'OPSNUM_0' })
  declare numeroCharge: string | null

  @column({ columnName: 'PLNFCY_0' })
  declare sitePlanification: string | null

  @column({ columnName: 'POHNUM_0' })
  declare noCommande: string | null

  @column({ columnName: 'POPLIN_0' })
  declare ligneCommande: string | null

  @column({ columnName: 'POPSEQ_0' })
  declare sequence: string | null

  @column({ columnName: 'PRGNUM_0' })
  declare programme: string | null

  @column({ columnName: 'PRPTIM_0' })
  declare tpsPreparation: string | null

  @column({ columnName: 'PSPTIM_0' })
  declare tempsPostOperatoire: string | null

  @column({ columnName: 'QUACPLQTY_0' })
  declare quantiteRealiseeSousControle: string | null

  @column({ columnName: 'REFPRI_0' })
  declare prixReference: string | null

  @column({ columnName: 'REJCPLQTY_0' })
  declare quantiteRealiseeRejetee: string | null

  @column({ columnName: 'ROODES_0' })
  declare designationOperation: string | null

  @column({ columnName: 'ROOTIMCOD_0' })
  declare typeTempsOperatoire: string | null

  @column({ columnName: 'ROUOPENUM_0' })
  declare numeroOperationDeGamme: string | null

  @column({ columnName: 'RPLIND_0' })
  declare indiceRemplacement: string | null

  @column({ columnName: 'RSTMAC_0' })
  declare restrictionMachinePmsim: string | null

  @column({ columnName: 'SCHGRP_0' })
  declare critereRegroupementPmsim: string | null

  @column({ columnName: 'SCHSBB_0' })
  declare critereDeDistinction: string | null

  @column({ columnName: 'SCOCOD_0' })
  declare codeSoustraitance: string | null

  @column({ columnName: 'SCOITMREF_0' })
  declare articleDeSoustraitance: string | null

  @column({ columnName: 'SCOLTI_0' })
  declare delaiSoustraitance: string | null

  @column({ columnName: 'SCOPUU_0' })
  declare uniteAchat: string | null

  @column({ columnName: 'SCOWST_0' })
  declare posteSoustraitance: string | null

  @column({ columnName: 'SETLABCOE_0' })
  declare coefTempsMaindoeuvreReglage: string | null

  @column({ columnName: 'SHR_0' })
  declare pourcentageDePerte: string | null

  @column({ columnName: 'SPLCOD_0' })
  declare fractionnementCapaFinie: string | null

  @column({ columnName: 'SPLMAXNBR_0' })
  declare nbMaxiFractionnementCapaFinie: string | null

  @column({ columnName: 'STDLAB_0' })
  declare posteMoStandard: string | null

  @column({ columnName: 'STDLABNBR_0' })
  declare nombrePostesMoStandard: string | null

  @column({ columnName: 'STDOPETIM_0' })
  declare tempsOperatoireStandard: string | null

  @column({ columnName: 'STDQTY_0' })
  declare quantiteStandard: string | null

  @column({ columnName: 'STDSETTIM_0' })
  declare tempsReglageStandard: string | null

  @column({ columnName: 'STDUNTTIM_0' })
  declare tempsUnitaireStandard: string | null

  @column({ columnName: 'STDWST_0' })
  declare posteStandard: string | null

  @column({ columnName: 'STDWSTNBR_0' })
  declare nbPostesStandard: string | null

  @column({ columnName: 'TECCRD_0' })
  declare ficheTechnique: string | null

  @column({ columnName: 'TIMCOD_0' })
  declare uniteDeGestion: string | null

  @column({ columnName: 'TIMUOMCOD_0' })
  declare uniteTemps: string | null

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
  declare operateurModif: string | null

  @column({ columnName: 'WAITIM_0' })
  declare tempsAttente: string | null

  @column({ columnName: 'WIPNUM_0' })
  declare numeroEncoursSc: string | null

  @column({ columnName: 'WSTEFF_0' })
  declare efficiencePosteEn: string | null

  @column({ columnName: 'X1FTCOD_0' })
  declare codeGammeDanalyses: string | null

  @column({ columnName: 'X1TECCRD_0' })
  declare ficheTechniqueComp: string | null

  @column({ columnName: 'X4COLLAB_0' })
  declare collaborateur: string | null

  @column({ columnName: 'X4LIMEND_0' })
  declare pieceReellePieceDeSimulation: string | null

  @column({ columnName: 'X4LIMFLG_0' })
  declare versionActive: string | null

  @column({ columnName: 'X4LIMSTR_0' })
  declare versionSaisie: string | null

  @column({ columnName: 'X4LIMTYP_0' })
  declare versionArretee: string | null

  @column({ columnName: 'X4PFINFLG_0' })
  declare flagFinOpe: string | null

  @column.date({ columnName: 'X4PLNGMAO_0' })
  declare planningGmao: DateTime | null

  @column({ columnName: 'XCADTHEO_0' })
  declare cadenceTheo: string | null

  @column.date({ columnName: 'XDATREFEND_0' })
  declare dateFinReference: DateTime | null

  @column.date({ columnName: 'XDATREFSTR_0' })
  declare dateDebutReference: DateTime | null

  @column({ columnName: 'XEMPREINTE_0' })
  declare nbDempreintes: string | null

  @column({ columnName: 'XMACHINE_0' })
  declare codeMachine: string | null

  @column({ columnName: 'XSERNUM_0' })
  declare numeroSerie: string | null

  @belongsTo(() => MfgHead, {
    foreignKey: 'numeroOrdreDeFabrication',
    localKey: 'numeroOrdreDeFabrication',
  })
  declare ordreFabrication: BelongsTo<typeof MfgHead>

  @belongsTo(() => PurchaseOrder, { foreignKey: 'noCommande', localKey: 'noCommande' })
  declare commandeSousTraitance: BelongsTo<typeof PurchaseOrder>
}
