import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, belongsTo } from '@adonisjs/lucid/orm'
import type { HasMany, BelongsTo } from '@adonisjs/lucid/types/relations'
import Bom from '#models/x3/bom'
import BomDetail from '#models/x3/bomd'
import ItemFacility from '#models/x3/itmfacilit'
import ItemMovement from '#models/x3/itmmvt'
import MfgItem from '#models/x3/mfgitm'
import MfgMat from '#models/x3/mfgmat'
import Orders from '#models/x3/orders'
import PurchaseOrderLine from '#models/x3/porderq'
import SalesOrderLine from '#models/x3/sorderq'
import Stock from '#models/x3/stock'
import StockAlloc from '#models/x3/stoall'
import RoutingOp from '#models/x3/rouope'
import StockJournal from '#models/x3/stojou'
import LocalMenu from '#models/local_menu'

export default class ItemMaster extends BaseModel {
  static table = 'ITMMASTER'
  static connection = 'x3'
  static primaryKey = 'article'

  @column({ columnName: 'ACCCOD_0' })
  declare codeComptable: string | null

  @column({ columnName: 'ALG_0' })
  declare allergenes: string | null

  @column({ columnName: 'ALGBOM_0' })
  declare codeNomenAllergene: string | null

  @column.date({ columnName: 'ALGDAT_0' })
  declare dateChgAllergene: DateTime | null

  @column({ columnName: 'ALTBOMHDK_0' })
  declare alternative: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BRDCOD_0' })
  declare familleCouts: string | null

  @column({ columnName: 'BUY_0' })
  declare acheteur: string | null

  @column({ columnName: 'CCE_0' })
  declare sectionAnalytique: string | null

  @column({ columnName: 'CFGBPRNUM_0' })
  declare tiers: string | null

  @column({ columnName: 'CFGBPRREF_0' })
  declare referenceTiers: string | null

  @column.date({ columnName: 'CFGDELDAT_0' })
  declare datePurgeConfig: DateTime | null

  @column({ columnName: 'CFGFLDALP1_0' })
  declare champAlp1: string | null

  @column({ columnName: 'CFGFLDALP2_0' })
  declare champAlp2: string | null

  @column({ columnName: 'CFGFLDALP3_0' })
  declare champAlp3: string | null

  @column({ columnName: 'CFGFLDALP4_0' })
  declare champAlp4: string | null

  @column({ columnName: 'CFGFLDALP5_0' })
  declare champAlp5: string | null

  @column({ columnName: 'CFGFLDALP6_0' })
  declare champAlp6: string | null

  @column({ columnName: 'CFGFLDNUM1_0' })
  declare champNum1: string | null

  @column({ columnName: 'CFGFLDNUM2_0' })
  declare champNum2: string | null

  @column({ columnName: 'CFGFLDNUM3_0' })
  declare champNum3: string | null

  @column({ columnName: 'CFGFLDNUM4_0' })
  declare champNum4: string | null

  @column({ columnName: 'CFGFLDNUM5_0' })
  declare champNum5: string | null

  @column({ columnName: 'CFGFLDNUM6_0' })
  declare champNum6: string | null

  @column({ columnName: 'CFGITMREF_0' })
  declare articleDeReference: string | null

  @column({ columnName: 'CFGLIN_0' })
  declare ligneDeProduit: string | null

  @column({ columnName: 'CFGVCRNUM_0' })
  declare npieceConfig: string | null

  @column({ columnName: 'CPRAMT_0' })
  declare coutAchatForfaitaire: string | null

  @column({ columnName: 'CPRCOE_0' })
  declare coefficientFraisApproche: string | null

  @column({ columnName: 'CPY_0' })
  declare societe: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREMAC_0' })
  declare creationDeParc: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'CSTGRP_0' })
  declare familleCouts1: string | null

  @column({ columnName: 'CUSREF_0' })
  declare referenceDouaniere: string | null

  @column({ columnName: 'DACPCUCOE_0' })
  declare saisieCoeffUcAutorisee: string | null

  @column({ columnName: 'DACPUUCOE_0' })
  declare saisieCoeffAchatAutorisee: string | null

  @column({ columnName: 'DACSAUCOE_0' })
  declare saisieCoeffVenteAutorisee: string | null

  @column({ columnName: 'DAYUOM_0' })
  declare unitePourLesJours: string | null

  @column({ columnName: 'DEFACT_0' })
  declare titreUiParDefaut: string | null

  @column({ columnName: 'DEFPOT_0' })
  declare titreParDefaut: string | null

  @column({ columnName: 'DES1AXX_0' })
  declare designation1: string | null

  @column({ columnName: 'DES2AXX_0' })
  declare designation2: string | null

  @column({ columnName: 'DES3AXX_0' })
  declare designation3: string | null

  @column({ columnName: 'DIE_0' })
  declare codeAxe: string | null

  @column({ columnName: 'DLU_0' })
  declare coefficientDlu: string | null

  @column({ columnName: 'DLVFLG_0' })
  declare livrable: string | null

  @column({ columnName: 'DTY_0' })
  declare densite: string | null

  @column({ columnName: 'EANCOD_0' })
  declare codeEan: string | null

  @column({ columnName: 'ECCBOMALT2_0' })
  declare alternativeDeNomenclature: string | null

  @column({ columnName: 'ECCBOMALT3_0' })
  declare alternativeDeNomenclature1: string | null

  @column({ columnName: 'ECCFLG_0' })
  declare gestionVersion: string | null

  @column({ columnName: 'ECCMAJ_0' })
  declare compteurMajeur: string | null

  @column({ columnName: 'ECCMIN_0' })
  declare compteurMineur: string | null

  @column({ columnName: 'ECCROUALT_0' })
  declare alternativeDeGamme: string | null

  @column({ columnName: 'ECCROUFLG_0' })
  declare versionGamme: string | null

  @column({ columnName: 'ECCSTO_0' })
  declare versionStock: string | null

  @column({ columnName: 'EECGES_0' })
  declare soumisALaDeb: string | null

  @column({ columnName: 'EEU_0' })
  declare uniteSupplementaireDeb: string | null

  @column({ columnName: 'EEUSTUCOE_0' })
  declare coefUeus: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'EXYMGTCOD_0' })
  declare gestionPeremption: string | null

  @column({ columnName: 'EXYSTA_0' })
  declare statutPeremption: string | null

  @column({ columnName: 'FIMHOR_0' })
  declare horizonFerme: string | null

  @column({ columnName: 'FIMHORUOM_0' })
  declare uniteTempsHorizonFerme: string | null

  @column({ columnName: 'FLGFAS_0' })
  declare immobilisable: string | null

  @column({ columnName: 'FLYCAT_0' })
  declare categorieDeCoupon: string | null

  @column({ columnName: 'FRTHOR_0' })
  declare horizonPlanification: string | null

  @column({ columnName: 'FRTHORUOM_0' })
  declare uniteTempsHorizonPlanification: string | null

  @column({ columnName: 'GENFLG_0' })
  declare generique: string | null

  @column({ columnName: 'HDKITMTYP_0' })
  declare typeDarticle: string | null

  @column({ columnName: 'HOUUOM_0' })
  declare unitePourLheure: string | null

  @column({ columnName: 'INTFLG_0' })
  declare intermediaire: string | null

  @column({ columnName: 'INVPRODTYP_0' })
  declare typeArticle: string | null

  @column({ columnName: 'ITMDES1_0' })
  declare designation11: string | null

  @column({ columnName: 'ITMDES2_0' })
  declare designation21: string | null

  @column({ columnName: 'ITMDES3_0' })
  declare designation31: string | null

  @column({ columnName: 'ITMEXNFLG_0' })
  declare flagDexemption: string | null

  @column({ columnName: 'ITMREF_0' })
  declare article: string | null

  @column({ columnName: 'ITMSFTTYP_0' })
  declare typeArticleSaft: string | null

  @column({ columnName: 'ITMSTA_0' })
  declare statutArticle: string | null

  @column({ columnName: 'ITMSTD_0' })
  declare norme: string | null

  @column({ columnName: 'ITMVOU_0' })
  declare volumeDeLus: string | null

  @column({ columnName: 'ITMWEI_0' })
  declare poidsDeLuniteDeStock: string | null

  @column({ columnName: 'LBEFMT_0' })
  declare formatEtiquette: string | null

  @column.date({ columnName: 'LIFENDDAT_0' })
  declare finVie: DateTime | null

  @column.date({ columnName: 'LIFSTRDAT_0' })
  declare debutVie: DateTime | null

  @column({ columnName: 'LOAECCFLG_0' })
  declare prechargementVersions: string | null

  @column({ columnName: 'LOTCOU_0' })
  declare compteurLot: string | null

  @column({ columnName: 'LOTMGTCOD_0' })
  declare gestionLot: string | null

  @column({ columnName: 'MATTOL_0' })
  declare regleRapprochement: string | null

  @column({ columnName: 'MFGFLG_0' })
  declare fabrique: string | null

  @column({ columnName: 'MFGTEX_0' })
  declare texteProduction: string | null

  @column({ columnName: 'MINRMNPRC_0' })
  declare toleranceReliquat: string | null

  @column({ columnName: 'MNTUOM_0' })
  declare unitePourMinutes: string | null

  @column({ columnName: 'NEGSTO_0' })
  declare stockNegatifAutorise: string | null

  @column({ columnName: 'NEWLTISTA_0' })
  declare statutRecontrole: string | null

  @column({ columnName: 'NPIPRO_0' })
  declare prototype: string | null

  @column({ columnName: 'OFS_0' })
  declare delaiReapprovisionnement: string | null

  @column({ columnName: 'PCCCOD_0' })
  declare natureDeDepense: string | null

  @column({ columnName: 'PCU_0' })
  declare uniteConditionnement: string | null

  @column({ columnName: 'PCURUL_0' })
  declare destockageUc: string | null

  @column({ columnName: 'PCUSTUCOE_0' })
  declare coefficientUcus: string | null

  @column({ columnName: 'PHAFLG_0' })
  declare fantome: string | null

  @column({ columnName: 'PITCDT_0' })
  declare jetonsACrediter: string | null

  @column({ columnName: 'PITCDTUOM_0' })
  declare uniteDeCredit: string | null

  @column({ columnName: 'PLAACS_0' })
  declare accesGestionnaire: string | null

  @column({ columnName: 'PLANNER_0' })
  declare planificateur: string | null

  @column({ columnName: 'PLMATTURL_0' })
  declare documentsLies: string | null

  @column({ columnName: 'PLMHISURL_0' })
  declare historiquePlm: string | null

  @column({ columnName: 'PLMITMREF_0' })
  declare articlePlm: string | null

  @column({ columnName: 'PRQFLG_0' })
  declare daObligatoire: string | null

  @column({ columnName: 'PURBASPRI_0' })
  declare prixDeBase: string | null

  @column({ columnName: 'PURFLG_0' })
  declare achete: string | null

  @column({ columnName: 'PURTEX_0' })
  declare texteAchat: string | null

  @column({ columnName: 'PUU_0' })
  declare uniteAchat: string | null

  @column({ columnName: 'PUUSTUCOE_0' })
  declare coefficientUaus: string | null

  @column({ columnName: 'RCPFLG_0' })
  declare codeReception: string | null

  @column({ columnName: 'RPLITM_0' })
  declare articleRemplacement: string | null

  @column({ columnName: 'SALFLG_0' })
  declare vendu: string | null

  @column({ columnName: 'SAU_0' })
  declare uniteVente: string | null

  @column({ columnName: 'SAUSTUCOE_0' })
  declare coefficientUvus: string | null

  @column({ columnName: 'SCPFLG_0' })
  declare soustraite: string | null

  @column({ columnName: 'SCSFLG_0' })
  declare soustraitance: string | null

  @column({ columnName: 'SEAKEY_0' })
  declare cleRecherche: string | null

  @column({ columnName: 'SERCOU_0' })
  declare compteurSerie: string | null

  @column({ columnName: 'SERMGTCOD_0' })
  declare gestionSerie: string | null

  @column({ columnName: 'SHL_0' })
  declare delaiPeremption: string | null

  @column({ columnName: 'SHLLTI_0' })
  declare delaiRecontrole: string | null

  @column({ columnName: 'SHLLTIUOM_0' })
  declare uniteTpsRecontrole: string | null

  @column({ columnName: 'SHLUOM_0' })
  declare uniteTpsPeremption: string | null

  @column({ columnName: 'SSTCOD_0' })
  declare codeTaxeSst: string | null

  @column({ columnName: 'SSU_0' })
  declare uniteStatistique: string | null

  @column({ columnName: 'SSUSTUCOE_0' })
  declare coefficientUstatus: string | null

  @column({ columnName: 'STAFED_0' })
  declare regionetat: string | null

  @column({ columnName: 'STATAXFLG_0' })
  declare flagTaxabiliteEtatlocal: string | null

  @column({ columnName: 'STCNUM_0' })
  declare structureDeCouts: string | null

  @column({ columnName: 'STDFLG_0' })
  declare modeGestion: string | null

  @column({ columnName: 'STOCRD_0' })
  declare ficheStockage: string | null

  @column({ columnName: 'STOISSDEF_0' })
  declare sortieDeStock: string | null

  @column({ columnName: 'STOMGTCOD_0' })
  declare gestionStock: string | null

  @column({ columnName: 'STU_0' })
  declare uniteStock: string | null

  @column({ columnName: 'STULBEFMT_0' })
  declare formatEtiquettePourUniteStock: string | null

  @column({ columnName: 'TCLCOD_0' })
  declare categorieArticle: string | null

  @column({ columnName: 'TOOFLG_0' })
  declare outillage: string | null

  @column({ columnName: 'TPLCONGUA_0' })
  declare contratDeGarantie: string | null

  @column({ columnName: 'TPLCONLND_0' })
  declare contratDePret: string | null

  @column({ columnName: 'TPLCONSRV_0' })
  declare contratDeService: string | null

  @column({ columnName: 'TRKCOD_0' })
  declare tracabilite: string | null

  @column({ columnName: 'TRKLEV_0' })
  declare niveauTracabilite: string | null

  @column({ columnName: 'TSICOD_0' })
  declare familleStatistique: string | null

  @column({ columnName: 'TSICOD_4' })
  declare familleStatistique4: string | null

  @column({ columnName: 'UNNBR_0' })
  declare numeroOnu: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModif: string | null

  @column({ columnName: 'VACITM_0' })
  declare niveauTaxe: string | null

  @column({ columnName: 'VOU_0' })
  declare uniteVolume: string | null

  @column({ columnName: 'WEU_0' })
  declare unitePoids: string | null

  @column({ columnName: 'X19ADRCDT_0' })
  declare adresseTiersDeConditionnement: string | null

  @column({ columnName: 'X19ADRCTL_0' })
  declare adresseTiersDeControle: string | null

  @column({ columnName: 'X19ADRFAB_0' })
  declare adresseTiersDeFabrication: string | null

  @column({ columnName: 'X19ADRLIB_0' })
  declare adresseTiersDeLiberation: string | null

  @column({ columnName: 'X19BPRCDT_0' })
  declare tiersDeConditionnement: string | null

  @column({ columnName: 'X19BPRCTL_0' })
  declare tiersDeControle: string | null

  @column({ columnName: 'X19BPRFAB_0' })
  declare tiersDeFabrication: string | null

  @column({ columnName: 'X19BPRLIB_0' })
  declare tiersDeLiberation: string | null

  @column({ columnName: 'X1OPNDLY_0' })
  declare conservApOuvJ: string | null

  @column({ columnName: 'X1ULDEF_0' })
  declare ulDefaut: string | null

  @column({ columnName: 'X4ALTBOMSAV_0' })
  declare alternativeNomenclatureSav: string | null

  @column({ columnName: 'X4AUTOALIM_0' })
  declare gmaoAutoalimentation: string | null

  @column({ columnName: 'X4BCALTGAM_0' })
  declare alternativeGamme: string | null

  @column({ columnName: 'X4BCGAM_0' })
  declare gamme: string | null

  @column({ columnName: 'X4BCNOM_0' })
  declare nomenclature: string | null

  @column({ columnName: 'X4BOMALTTYP_0' })
  declare typeAlternativeNomenclature: string | null

  @column({ columnName: 'X4CODPRD_0' })
  declare codeProduit: string | null

  @column({ columnName: 'X4CONFPER_0' })
  declare confPeremption: string | null

  @column({ columnName: 'X4CTRLFLG_0' })
  declare controle: string | null

  @column({ columnName: 'X4DMDLOG_0' })
  declare codeDmdlog: string | null

  @column({ columnName: 'X4INCLUSFCO_0' })
  declare inclusFicheCompo: string | null

  @column({ columnName: 'X4INIREFPER_0' })
  declare initRefPeremption: string | null

  @column({ columnName: 'X4LOGAUTO_0' })
  declare logistiqueAutomotive: string | null

  @column({ columnName: 'X4REFNNSIG_0' })
  declare dateRefPerNonSignificative: string | null

  @column({ columnName: 'X4STUDEF_0' })
  declare uniteParDefaut: string | null

  @column({ columnName: 'X4SUIVFCO_0' })
  declare suiviFicheCompo: string | null

  @column({ columnName: 'XCDT_0' })
  declare conditionnement: string | null

  @column({ columnName: 'XCETIAT_0' })
  declare soumisACetiat: string | null

  @column({ columnName: 'XCODLIG_0' })
  declare codeSousstatut: string | null

  @column({ columnName: 'XCOEFTGAP_0' })
  declare coefficientTgap: string | null

  @column({ columnName: 'XCONPO_0' })
  declare poidsBrutKg: string | null

  @column({ columnName: 'XCONTYP_0' })
  declare typeConditionnement: string | null

  @column({ columnName: 'XCONVOL_0' })
  declare codeVolume: string | null

  @column({ columnName: 'XCOUPLV_0' })
  declare couplageLv: string | null

  @column({ columnName: 'XCRY_0' })
  declare codePays: string | null

  @column({ columnName: 'XDENSITE_0' })
  declare densite1: string | null

  @column({ columnName: 'XECHIFCPNITM_0' })
  declare composantChiffrage: string | null

  @column.date({ columnName: 'XEXPTRANSA_0' })
  declare dateExportDmdlog: DateTime | null

  @column({ columnName: 'XFECOD_0' })
  declare codeFamilleTechnique: string | null

  @column({ columnName: 'XFLGVER_0' })
  declare gestionVersion1: string | null

  @column({ columnName: 'XFTCOD_0' })
  declare codeFicheTechnique: string | null

  @column({ columnName: 'XITMITM_0' })
  declare articleMaitre: string | null

  @column({ columnName: 'XNBETICOMP_0' })
  declare nombreEtiquetteComplementaire: string | null

  @column({ columnName: 'XNIVSTOCK_0' })
  declare nivLiberationStock: string | null

  @column({ columnName: 'XPOHTYPITM_0' })
  declare typeDeCommande: string | null

  @column({ columnName: 'XQCDT_0' })
  declare quantite: string | null

  @column({ columnName: 'XSTUUCDTCO_0' })
  declare coefUcdtus: string | null

  @column({ columnName: 'XTGAPCAT_0' })
  declare categorieTgap: string | null

  @column({ columnName: 'XTGAPSUB_0' })
  declare tgapSurSubstance: string | null

  @column({ columnName: 'XTGAPSUBTA_0' })
  declare tauxTgapSubstance: string | null

  @column({ columnName: 'XUCDT_0' })
  declare uniteDeCondit: string | null

  @column({ columnName: 'XUCDTCOE_0' })
  declare coefUcdtstuMaitre: string | null

  @column({ columnName: 'YCASTU_0' })
  declare uniteParDefaut1: string | null

  @column({ columnName: 'YCODAUTO_0' })
  declare codeAutomate: string | null

  @column({ columnName: 'YFAMSTAT6_0' })
  declare familleStat6: string | null

  @column({ columnName: 'YFAMSTAT7_0' })
  declare familleStat7: string | null

  @column({ columnName: 'YFAMSTAT8_0' })
  declare familleStat8: string | null

  @column({ columnName: 'YQUICK_0' })
  declare ctrQualite: string | null

  @column.date({ columnName: 'ZDATE_0' })
  declare dateDeMiseEnElab: DateTime | null

  @column({ columnName: 'ZDEM_0' })
  declare demandeurChgtSta: string | null

  @column({ columnName: 'ZNBFAB_0' })
  declare nbFabricant: string | null

  @hasMany(() => Bom, { foreignKey: 'articleParent', localKey: 'article' })
  declare bomList: HasMany<typeof Bom>

  @hasMany(() => BomDetail, { foreignKey: 'articleParent', localKey: 'article' })
  declare bomDetailList: HasMany<typeof BomDetail>

  @hasMany(() => ItemFacility, { foreignKey: 'article', localKey: 'article' })
  declare itemFacilityList: HasMany<typeof ItemFacility>

  @hasMany(() => ItemMovement, { foreignKey: 'article', localKey: 'article' })
  declare itemMovementList: HasMany<typeof ItemMovement>

  @hasMany(() => MfgItem, { foreignKey: 'article', localKey: 'article' })
  declare mfgItemList: HasMany<typeof MfgItem>

  @hasMany(() => MfgMat, { foreignKey: 'article', localKey: 'article' })
  declare mfgMatList: HasMany<typeof MfgMat>

  @hasMany(() => Orders, { foreignKey: 'article', localKey: 'article' })
  declare ordersList: HasMany<typeof Orders>

  @hasMany(() => PurchaseOrderLine, { foreignKey: 'article', localKey: 'article' })
  declare purchaseOrderLineList: HasMany<typeof PurchaseOrderLine>

  @hasMany(() => SalesOrderLine, { foreignKey: 'article', localKey: 'article' })
  declare salesOrderLineList: HasMany<typeof SalesOrderLine>

  @hasMany(() => Stock, { foreignKey: 'article', localKey: 'article' })
  declare stockList: HasMany<typeof Stock>

  @hasMany(() => StockAlloc, { foreignKey: 'article', localKey: 'article' })
  declare stockAllocList: HasMany<typeof StockAlloc>

  @hasMany(() => StockJournal, { foreignKey: 'article', localKey: 'article' })
  declare stockJournalList: HasMany<typeof StockJournal>

  @hasMany(() => RoutingOp, { foreignKey: 'gamme', localKey: 'article' })
  declare routingOpList: HasMany<typeof RoutingOp>

  @belongsTo(() => LocalMenu, { foreignKey: 'statutArticle', localKey: 'value', onQuery: (q) => q.where('chapter', 246) })
  declare statutArticleMenu: BelongsTo<typeof LocalMenu>

  @belongsTo(() => LocalMenu, { foreignKey: 'gestionStock', localKey: 'value', onQuery: (q) => q.where('chapter', 215) })
  declare gestionStockMenu: BelongsTo<typeof LocalMenu>

  @belongsTo(() => LocalMenu, { foreignKey: 'modeGestion', localKey: 'value', onQuery: (q) => q.where('chapter', 297) })
  declare modeGestionMenu: BelongsTo<typeof LocalMenu>

}
