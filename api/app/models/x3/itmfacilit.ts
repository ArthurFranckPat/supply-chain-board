import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'

export default class ItemFacility extends BaseModel {
  static table = 'ITMFACILIT'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'ABCCLS_0' })
  declare categorieAbc: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BUDCSTUPD_0' })
  declare miseAJourCoutStdBudget: string | null

  @column({ columnName: 'BUY_0' })
  declare acheteur: string | null

  @column({ columnName: 'CFGVCRNUM_0' })
  declare npieceConfig: string | null

  @column({ columnName: 'CLEPCTAUT_0' })
  declare pourSoldeAutomatique: string | null

  @column({ columnName: 'COMSEQCON_0' })
  declare ctrlSeqComposant: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'CSTROU_0' })
  declare cout: string | null

  @column({ columnName: 'CSTROUALT_0' })
  declare alternativeGammeCout: string | null

  @column({ columnName: 'CUNCOD_0' })
  declare modeInventaire: string | null

  @column({ columnName: 'CUNFLG_0' })
  declare bloqueInventaire: string | null

  @column({ columnName: 'CUNLISNUM_0' })
  declare inventaireEnCours: string | null

  @column({ columnName: 'CUTCSTUPD_0' })
  declare miseAJourCoutStdActualise: string | null

  @column({ columnName: 'DAYCOV_0' })
  declare couverture: string | null

  @column({ columnName: 'DEFLOC_0' })
  declare emplacParDefaut: string | null

  @column({ columnName: 'DEFLOCTYP_0' })
  declare typeEmplacementParDefaut: string | null

  @column({ columnName: 'DLU_0' })
  declare coefficientDlu: string | null

  @column({ columnName: 'EXCFDMA_0' })
  declare dateDisponibiliteNonApplicable: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'FOH_0' })
  declare horizonDemande: string | null

  @column({ columnName: 'FOHUOT_0' })
  declare uniteTempsHorizonDemande: string | null

  @column({ columnName: 'FRTCLS_0' })
  declare classeDeFret: string | null

  @column({ columnName: 'GENLEVINS_0' })
  declare niveauGeneralInspection: string | null

  @column({ columnName: 'ISM_0' })
  declare stockagemanipulation: string | null

  @column({ columnName: 'ITMREF_0' })
  declare article: string | null

  @column({ columnName: 'ITMTOLNEG_0' })
  declare toleranceArticle: string | null

  @column({ columnName: 'ITMTOLPOS_0' })
  declare tolerancePesee: string | null

  @column({ columnName: 'LOCMGTCOD_0' })
  declare gestionEmplacement: string | null

  @column({ columnName: 'LOCNUM_0' })
  declare nEmplacement: string | null

  @column({ columnName: 'LPNMGTCOD_0' })
  declare gestionContenant: string | null

  @column({ columnName: 'LTIQLYCRD_0' })
  declare ficheQualiteRecontrole: string | null

  @column({ columnName: 'MATWRH_0' })
  declare depotOf: string | null

  @column({ columnName: 'MAXSTO_0' })
  declare stockMaximum: string | null

  @column({ columnName: 'MAXSTOCLC_0' })
  declare stockMaximumCalcule: string | null

  @column({ columnName: 'MFGLOTQTY_0' })
  declare lotTechnique: string | null

  @column({ columnName: 'MFGLTI_0' })
  declare delaiDeFabrication: string | null

  @column({ columnName: 'MFGROU_0' })
  declare gammeFabrication: string | null

  @column({ columnName: 'MFGROUALT_0' })
  declare alternativeGammeFabrication: string | null

  @column({ columnName: 'MFGSHTCOD_0' })
  declare lancementSiEnRupture: string | null

  @column({ columnName: 'MFGWRH_0' })
  declare depotConso: string | null

  @column({ columnName: 'MIC_0' })
  declare coeffReduct: string | null

  @column({ columnName: 'MONPROMON_0' })
  declare moisDernierTraitementMensuel: string | null

  @column({ columnName: 'MONPROYEA_0' })
  declare anneeDernierTraitementMensuel: string | null

  @column({ columnName: 'NEWLTISTA_0' })
  declare statutRecontrole: string | null

  @column({ columnName: 'NMFC_0' })
  declare nmfc: string | null

  @column({ columnName: 'NQA_0' })
  declare niveauQualiteAcceptable: string | null

  @column({ columnName: 'OFS_0' })
  declare delaiReapprovisionnement: string | null

  @column({ columnName: 'ORDWRH_0' })
  declare depotCommande: string | null

  @column({ columnName: 'OTRSTYP_0' })
  declare typeMouvement: string | null

  @column({ columnName: 'OVECOD_0' })
  declare fraisGeneraux: string | null

  @column({ columnName: 'OVECPNFLG_0' })
  declare fgCpnCalculFgNiv: string | null

  @column({ columnName: 'PCK_0' })
  declare emballage: string | null

  @column({ columnName: 'PCKCAP_0' })
  declare capaciteEmballage: string | null

  @column({ columnName: 'PCKFLG_0' })
  declare colisage: string | null

  @column({ columnName: 'PCKSERFLG_0' })
  declare detailSerie: string | null

  @column({ columnName: 'PCKSTKFLG_0' })
  declare detailStock: string | null

  @column({ columnName: 'PCU_0' })
  declare uniteConditionnement: string | null

  @column({ columnName: 'PJMSTRSTK_0' })
  declare stockPourAffaire: string | null

  @column({ columnName: 'PLANNER_0' })
  declare planificateur: string | null

  @column({ columnName: 'PLH_0' })
  declare horizonFerme: string | null

  @column({ columnName: 'PLHUOT_0' })
  declare uniteTempsHorizonPlanification: string | null

  @column({ columnName: 'PROPER_0' })
  declare prorataQteRegularisation: string | null

  @column({ columnName: 'PRPLTI_0' })
  declare picking: string | null

  @column({ columnName: 'PTOCOD_0' })
  declare regleDaffectation: string | null

  @column({ columnName: 'QLYCRD_0' })
  declare ficheTechnique: string | null

  @column({ columnName: 'QUAACS_0' })
  declare codeAcces: string | null

  @column({ columnName: 'QUAADXUID_0' })
  declare processFrequence: string | null

  @column({ columnName: 'QUAFLG_0' })
  declare soumisAControle: string | null

  @column({ columnName: 'QUAFRY_0' })
  declare frequenceControleQualite: string | null

  @column({ columnName: 'QUALTI_0' })
  declare controleQualite: string | null

  @column({ columnName: 'QUANUM_0' })
  declare nombreEntrees: string | null

  @column({ columnName: 'QUANUMUID_0' })
  declare entreesProcess: string | null

  @column({ columnName: 'RCCROU_0' })
  declare pgc: string | null

  @column({ columnName: 'RCCROUALT_0' })
  declare alternativeGammePgc: string | null

  @column({ columnName: 'REDMODFLG_0' })
  declare modeDeRedressement: string | null

  @column({ columnName: 'RELSCATIA_0' })
  declare perteAuLancement: string | null

  @column({ columnName: 'REOCOD_0' })
  declare typeSugges: string | null

  @column({ columnName: 'REOFCY_0' })
  declare siteReapprovisionnement: string | null

  @column({ columnName: 'REOMGTCOD_0' })
  declare modeReapprovisionnement: string | null

  @column({ columnName: 'REOMINCLC_0' })
  declare lotEconomiqueCalcule: string | null

  @column({ columnName: 'REOMINQTY_0' })
  declare lotEconomique: string | null

  @column({ columnName: 'REOPER_0' })
  declare periodiciteReaprovisionnement: string | null

  @column({ columnName: 'REOPOL_0' })
  declare politiqueReapprovisionnement: string | null

  @column({ columnName: 'REOTSD_0' })
  declare seuilDeReapprovisionnement: string | null

  @column({ columnName: 'REOTSDCLC_0' })
  declare seuilReapprovisionnementCalcule: string | null

  @column({ columnName: 'SAFSTO_0' })
  declare stockSecurite: string | null

  @column({ columnName: 'SAFSTOCLC_0' })
  declare stockSecuriteCalcule: string | null

  @column({ columnName: 'SCCWRH_0' })
  declare depotConsoSoustrt: string | null

  @column({ columnName: 'SCOWRH_0' })
  declare depotExpeSoustrt: string | null

  @column({ columnName: 'SESCOD_0' })
  declare saisonnalite: string | null

  @column({ columnName: 'SHIWRH_0' })
  declare depotExpedition: string | null

  @column({ columnName: 'SHLLTI_0' })
  declare delaiRecontrole: string | null

  @column({ columnName: 'SHLLTIUOM_0' })
  declare uniteTpsRecontrole: string | null

  @column({ columnName: 'SHR_0' })
  declare pourcentageDePerte: string | null

  @column({ columnName: 'SIMCSTUPD_0' })
  declare majCoutSimulation: string | null

  @column({ columnName: 'SMPMOD_0' })
  declare modeEchantillonnage: string | null

  @column({ columnName: 'SMPTYP_0' })
  declare echantillonnage: string | null

  @column({ columnName: 'STAFED_0' })
  declare regionetat: string | null

  @column({ columnName: 'STDCSTUPD_0' })
  declare miseAJourCoutStandard: string | null

  @column({ columnName: 'STOCOD_0' })
  declare modeRetraitStock: string | null

  @column({ columnName: 'STOFCY_0' })
  declare siteStock: string | null

  @column({ columnName: 'STOMGTCOD_0' })
  declare gestionStock: string | null

  @column({ columnName: 'TCTRDEF_0' })
  declare contenantParDefaut: string | null

  @column({ columnName: 'TCTRNUM_0' })
  declare contenant: string | null

  @column({ columnName: 'TCTRPCUCOE_0' })
  declare nbUnitescontenant: string | null

  @column({ columnName: 'TOTLTI_0' })
  declare multiNiveaux: string | null

  @column({ columnName: 'TRFWRH_0' })
  declare depotMvtInterne: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModif: string | null

  @column({ columnName: 'VLTCOD_0' })
  declare methodeDeValorisation: string | null

  @column({ columnName: 'VLTCODDAT_0' })
  declare dateExpertise: string | null

  @column({ columnName: 'VLTCODHIS_0' })
  declare methodeValorisation: string | null

  @column({ columnName: 'WGRACS_0' })
  declare codeAcces1: string | null

  @column({ columnName: 'WIPPRO_0' })
  declare protectionWip: string | null

  @column({ columnName: 'X1CLAAFF_0' })
  declare classeDaffectation: string | null

  @column({ columnName: 'X1CLAROT_0' })
  declare classeDeRotation: string | null

  @column({ columnName: 'X1CNI_0' })
  declare contrainteObligatoire: string | null

  @column({ columnName: 'X1INVFLG_0' })
  declare inventaire: string | null

  @column({ columnName: 'X1INVSSSNUM_0' })
  declare sessionInventaire: string | null

  @column({ columnName: 'X1PLNCODE_0' })
  declare planDeStabilite: string | null

  @column({ columnName: 'X1RULQCODE_0' })
  declare codeRegle: string | null

  @column({ columnName: 'X1TOLFEFIFO_0' })
  declare tolerenceFifofefoEnJ: string | null

  @column({ columnName: 'X1ZPREP_0' })
  declare zoneDePreparation: string | null

  @column({ columnName: 'X4CMJCLC_0' })
  declare calculCmj: string | null

  @column({ columnName: 'X4EXCLRFA_0' })
  declare exclusionRfa: string | null

  @column({ columnName: 'X4EXTDOSLOT_0' })
  declare formatDeFichier: string | null

  @column({ columnName: 'X4FTSCODLTI_0' })
  declare ftRecontrole: string | null

  @column({ columnName: 'X4GESFAB_0' })
  declare gestionFabricant: string | null

  @column({ columnName: 'X4RFASTUCOE_0' })
  declare coefficientRfaus: string | null

  @column({ columnName: 'X4SPLITPRH_0' })
  declare splitLignePrepa: string | null

  @column({ columnName: 'X4TOTSUGPER_0' })
  declare tolSugPerte: string | null

  @column({ columnName: 'X4TYPOFAUT_0' })
  declare typeOfAuto: string | null

  @column({ columnName: 'X4TYPOFITM_0' })
  declare avecArticle: string | null

  @column({ columnName: 'X4TYPOFUSR_0' })
  declare avecUtilisateur: string | null

  @column({ columnName: 'X4UOMRFA_0' })
  declare uniteRfa: string | null

  @column({ columnName: 'XAQP_0' })
  declare aqpaqf: string | null

  @column({ columnName: 'XARTSEC_0' })
  declare articleSecurite: string | null

  @column({ columnName: 'XFTSCOD_0' })
  declare codeFicheTechniqueSpeciale: string | null

  @column({ columnName: 'XGESTPAL_0' })
  declare paletteStockee: string | null

  @column({ columnName: 'XGRANULE_0' })
  declare granule: string | null

  @column({ columnName: 'XINCOMPLET_0' })
  declare incomplet: string | null

  @column({ columnName: 'XMAIDUR_0' })
  declare preparationCdeFrance: string | null

  @column({ columnName: 'XMAIQTY_0' })
  declare listeDesDevisClirepetat: string | null

  @column({ columnName: 'XMODDOSLOT_0' })
  declare modeleDossierLot: string | null

  @column({ columnName: 'XNIVSTOCK_0' })
  declare nivLiberationStock: string | null

  @column({ columnName: 'XPERECO_0' })
  declare periodeEconomique: string | null

  @column({ columnName: 'XPROCTN_0' })
  declare productionContinue: string | null

  @column({ columnName: 'XSTOLOCDEF_0' })
  declare emplacementDeStockageParDefaut: string | null

  @column({ columnName: 'XTYPOF_0' })
  declare typeOf: string | null

  @column({ columnName: 'XUCCOMPL_0' })
  declare ucComplementaire: string | null

  @column({ columnName: 'YEAPROYEA_0' })
  declare dernierTraitementAnnuel: string | null

  @column({ columnName: 'ZBSM_0' })
  declare pasDimpressionBsm: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'article', localKey: 'article' })
  declare ficheArticle: BelongsTo<typeof ItemMaster>

}
