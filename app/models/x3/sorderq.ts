import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'
import PurchaseOrder from '#models/x3/porder'
import SalesOrder from '#models/x3/sorder'
import LocalMenu from '#models/local_menu'

export default class SalesOrderLine extends BaseModel {
  static table = 'SORDERQ'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'ALLQTY_0' })
  declare quantiteAllouee: string | null

  @column({ columnName: 'ALLQTYSTU_0' })
  declare quantiteAlloueeUs: string | null

  @column({ columnName: 'ALLTYP_0' })
  declare typeAllocation: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BASTAXLIN_0' })
  declare montantTaxable: string | null

  @column({ columnName: 'BPAADD_0' })
  declare adresseLivraison: string | null

  @column({ columnName: 'BPCORD_0' })
  declare clientCommande: string | null

  @column({ columnName: 'BPTNUM_0' })
  declare transporteur: string | null

  @column({ columnName: 'CAD_0' })
  declare cadencement: string | null

  @column.date({ columnName: 'CCLDAT_0' })
  declare dateSolde: DateTime | null

  @column({ columnName: 'CCLREN_0' })
  declare motifSolde: string | null

  @column({ columnName: 'CPY_0' })
  declare societe: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'DAYLTI_0' })
  declare delaiLivEnJours: string | null

  @column({ columnName: 'DDTANOT_0' })
  declare eltFactLigRepart: string | null

  @column({ columnName: 'DDTANUM_0' })
  declare eltFactLigRepart1: string | null

  @column.date({ columnName: 'DEMDLVDAT_0' })
  declare dateLivraisonAcceptee: DateTime | null

  @column({ columnName: 'DEMDLVHOU_0' })
  declare heureLivDemandee: string | null

  @column({ columnName: 'DEMDLVREF_0' })
  declare refDemLivraison: string | null

  @column({ columnName: 'DEMNUM_0' })
  declare noOrdre: string | null

  @column({ columnName: 'DEMSTA_0' })
  declare statutOrdre: string | null

  @column({ columnName: 'DLVDAY_0' })
  declare jour: string | null

  @column({ columnName: 'DLVFLG_0' })
  declare livrable: string | null

  @column({ columnName: 'DLVPIO_0' })
  declare prioriteLivraison: string | null

  @column({ columnName: 'DLVPIOCMP_0' })
  declare complementPrioriteLivraison: string | null

  @column({ columnName: 'DLVQTY_0' })
  declare quantiteLivree: string | null

  @column({ columnName: 'DLVQTYSTU_0' })
  declare quantiteLivreeUs: string | null

  @column({ columnName: 'DRN_0' })
  declare noTournee: string | null

  @column({ columnName: 'DSPLINFLG_0' })
  declare repartition: string | null

  @column({ columnName: 'DSPLINVOL_0' })
  declare volumeLigne: string | null

  @column({ columnName: 'DSPLINWEI_0' })
  declare poidsLigne: string | null

  @column({ columnName: 'DSPVOU_0' })
  declare uniteVolume: string | null

  @column({ columnName: 'DSPWEU_0' })
  declare unitePoids: string | null

  @column({ columnName: 'ECCVALMAJ_0' })
  declare versionMajeure: string | null

  @column({ columnName: 'ECCVALMIN_0' })
  declare versionMineure: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column.date({ columnName: 'EXTDLVDAT_0' })
  declare dateLivraisonPrevue: DateTime | null

  @column({ columnName: 'FMI_0' })
  declare origineArticle: string | null

  @column({ columnName: 'FMILIN_0' })
  declare ligneContremarque: string | null

  @column({ columnName: 'FMINUM_0' })
  declare noContremarque: string | null

  @column({ columnName: 'FMISEQ_0' })
  declare noSeqContremarque: string | null

  @column({ columnName: 'GEOCOD_0' })
  declare geoCode: string | null

  @column({ columnName: 'IMPNUMLIG_0' })
  declare ligneImport: string | null

  @column({ columnName: 'INSCTYFLG_0' })
  declare flagInterieurVille: string | null

  @column({ columnName: 'INVAMT_0' })
  declare montantFacture: string | null

  @column({ columnName: 'INVFLG_0' })
  declare facturee: string | null

  @column({ columnName: 'INVPRNBOM_0' })
  declare composantImpFac: string | null

  @column({ columnName: 'INVQTY_0' })
  declare quantiteFacturee: string | null

  @column({ columnName: 'INVQTYSTU_0' })
  declare quantiteFactureeUs: string | null

  @column({ columnName: 'ITMREF_0' })
  declare article: string | null

  @column({ columnName: 'LINORDNUM_0' })
  declare ligneOrigine: string | null

  @column({ columnName: 'LOC_0' })
  declare filtreEmplacement: string | null

  @column({ columnName: 'LOT_0' })
  declare filtreLotExclusif: string | null

  @column({ columnName: 'LPRQTY_0' })
  declare quantiteSurListeDePreparation: string | null

  @column({ columnName: 'LPRQTYSTU_0' })
  declare quantiteSurListePreparationUs: string | null

  @column.date({ columnName: 'MAXDLVDAT_0' })
  declare dateMaxLivraison: DateTime | null

  @column({ columnName: 'MAXDLVHOU_0' })
  declare heureMaxLivraison: string | null

  @column({ columnName: 'MDL_0' })
  declare modeLivraison: string | null

  @column({ columnName: 'MON_0' })
  declare mois: string | null

  @column({ columnName: 'NDEPRNBOM_0' })
  declare composantImpBl: string | null

  @column({ columnName: 'OCNPRNBOM_0' })
  declare composantImpArc: string | null

  @column({ columnName: 'ODLQTY_0' })
  declare quantiteEnTraitement: string | null

  @column({ columnName: 'ODLQTYSTU_0' })
  declare quantiteEnTraitementUs: string | null

  @column({ columnName: 'OPRQTY_0' })
  declare quantiteEnPreparation: string | null

  @column({ columnName: 'OPRQTYSTU_0' })
  declare quantiteEnPreparationUs: string | null

  @column.date({ columnName: 'ORDDAT_0' })
  declare dateCommande: DateTime | null

  @column({ columnName: 'ORIQTY_0' })
  declare qteCdeInitiale: string | null

  @column({ columnName: 'PCK_0' })
  declare emballage: string | null

  @column({ columnName: 'PCKCAP_0' })
  declare capaciteEmballage: string | null

  @column.date({ columnName: 'PERENDDAT_0' })
  declare dateFinPeriode: DateTime | null

  @column({ columnName: 'PERNBRDAY_0' })
  declare nombreJoursPeriode: string | null

  @column.date({ columnName: 'PERSTRDAT_0' })
  declare dateDebutPeriode: DateTime | null

  @column({ columnName: 'PITFLG_0' })
  declare gestionDesPoints: string | null

  @column({ columnName: 'PJT_0' })
  declare affaire: string | null

  @column({ columnName: 'POHNUM_0' })
  declare noCommande: string | null

  @column({ columnName: 'POPLIN_0' })
  declare ligneCommande: string | null

  @column({ columnName: 'POQSEQ_0' })
  declare numeroSequence: string | null

  @column({ columnName: 'PRECOD_0' })
  declare codePreparation: string | null

  @column({ columnName: 'PREQTY_0' })
  declare quantitePreparee: string | null

  @column({ columnName: 'PREQTYSTU_0' })
  declare quantitePrepareeUs: string | null

  @column({ columnName: 'PRGBILNUM_0' })
  declare numeroPlanFacturation: string | null

  @column({ columnName: 'QTY_0' })
  declare quantiteComandee: string | null

  @column({ columnName: 'QTYSTU_0' })
  declare quantiteCommandeeUs: string | null

  @column({ columnName: 'RATTAXLIN_0' })
  declare tauxDeTaxe: string | null

  @column({ columnName: 'SALFCY_0' })
  declare siteVente: string | null

  @column({ columnName: 'SDDLIN_0' })
  declare ligneLivraison: string | null

  @column({ columnName: 'SDHNUM_0' })
  declare noLivraison: string | null

  @column.date({ columnName: 'SHIDAT_0' })
  declare dateExpedition: DateTime | null

  @column({ columnName: 'SHIHOU_0' })
  declare heureExpedition: string | null

  @column({ columnName: 'SHTQTY_0' })
  declare quantiteEnRupture: string | null

  @column({ columnName: 'SHTQTYSTU_0' })
  declare quantiteEnRuptureUs: string | null

  @column({ columnName: 'SOHCAT_0' })
  declare categorieCommande: string | null

  @column({ columnName: 'SOHNUM_0' })
  declare noCommande1: string | null

  @column({ columnName: 'SOPLIN_0' })
  declare ligne: string | null

  @column({ columnName: 'SOQPSONUM_0' })
  declare numeroDocAffaire: string | null

  @column({ columnName: 'SOQSEQ_0' })
  declare numeroSequence1: string | null

  @column({ columnName: 'SOQSEQNUM_0' })
  declare ligne1: string | null

  @column({ columnName: 'SOQSTA_0' })
  declare etatLigne: string | null

  @column({ columnName: 'SOQTEX_0' })
  declare texteLigneCommande: string | null

  @column({ columnName: 'STA_0' })
  declare filtreStatutsExclusif: string | null

  @column({ columnName: 'STOFCY_0' })
  declare siteExpedition: string | null

  @column({ columnName: 'STOMGTCOD_0' })
  declare gestionStock: string | null

  @column({ columnName: 'TAXFLG_0' })
  declare flagTaxable: string | null

  @column({ columnName: 'TAXGEOFLG_0' })
  declare flagGeoTaxed: string | null

  @column({ columnName: 'TAXREGFLG_0' })
  declare flagTaxeEnregistre: string | null

  @column({ columnName: 'TDLQTY_0' })
  declare quantiteALivrer: string | null

  @column({ columnName: 'TDLQTYSTU_0' })
  declare quantiteALivrerUs: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModification: string | null

  @column.date({ columnName: 'USELIMDAT_0' })
  declare dateLimiteConsom: DateTime | null

  @column({ columnName: 'USEPLC_0' })
  declare lieuConsommation: string | null

  @column({ columnName: 'VTC_0' })
  declare codeTransacVertex: string | null

  @column({ columnName: 'VTS_0' })
  declare sstypeTransvertex: string | null

  @column({ columnName: 'WEE_0' })
  declare noSemaine: string | null

  @column({ columnName: 'X4AVMOTCOMD_0' })
  declare transEntreeDivers: string | null

  @column({ columnName: 'X4EXCLRFAD_0' })
  declare exclusionRfa: string | null

  @column({ columnName: 'X4FACTURE_0' })
  declare facture: string | null

  @column.date({ columnName: 'X4HDEMDLVD_0' })
  declare arretTempsHorsProduction: DateTime | null

  @column.date({ columnName: 'X4HSHIDAT_0' })
  declare pointageDepart: DateTime | null

  @column({ columnName: 'X4QTYINI_0' })
  declare quantiteInitiale: string | null

  @column({ columnName: 'X4RGOPL_0' })
  declare optionsDeTransport: string | null

  @column({ columnName: 'XALERT_0' })
  declare flgAlertVariation: string | null

  @column({ columnName: 'XCMQINT_0' })
  declare contremarqueInterne: string | null

  @column.date({ columnName: 'XDATMES_0' })
  declare dateMessageEdi: DateTime | null

  @column({ columnName: 'XDESINT_0' })
  declare idExtDestination: string | null

  @column({ columnName: 'XDESTFIN_0' })
  declare destinationFinale: string | null

  @column.date({ columnName: 'XDLVDATDEB_0' })
  declare dateDeBesoin: DateTime | null

  @column.date({ columnName: 'XDLVDATFIN_0' })
  declare dateFinReception: DateTime | null

  @column({ columnName: 'XDLVTIMDEB_0' })
  declare heureDebutRecepti: string | null

  @column({ columnName: 'XDLVTIMFIN_0' })
  declare heureFinReception: string | null

  @column({ columnName: 'XFLGRET_0' })
  declare delai: string | null

  @column({ columnName: 'XKANBAN_0' })
  declare nEtiquetteKanban: string | null

  @column({ columnName: 'XLIGMERORI_0' })
  declare nLigneMereOrigine: string | null

  @column({ columnName: 'XLIGORI_0' })
  declare nLigneDorigine: string | null

  @column({ columnName: 'XNBETIIMP_0' })
  declare nbEtiqImpBouc: string | null

  @column({ columnName: 'XNBETIIMPP_0' })
  declare nbEtiqImpProd: string | null

  @column({ columnName: 'XNIVENG_0' })
  declare niveauDengagement: string | null

  @column({ columnName: 'XNUMMES_0' })
  declare numeroMessageEdi: string | null

  @column({ columnName: 'XPCU1ITM_0' })
  declare codeUc: string | null

  @column({ columnName: 'XPCUSAUC01_0' })
  declare capaciteUc: string | null

  @column({ columnName: 'XPLDELIV_0' })
  declare batiment: string | null

  @column({ columnName: 'XPNTDECHA_0' })
  declare pointDechargement: string | null

  @column({ columnName: 'XPNTMONTE_0' })
  declare pointDeDestination: string | null

  @column({ columnName: 'XQTERET_0' })
  declare qteRetard: string | null

  @column({ columnName: 'XREGROUP_0' })
  declare critereRegroupement: string | null

  @column.date({ columnName: 'XSHIDATDEB_0' })
  declare dateDebEnlevement: DateTime | null

  @column.date({ columnName: 'XSHIDATFIN_0' })
  declare dateFinEnlevement: DateTime | null

  @column({ columnName: 'XSHITIMDEB_0' })
  declare heureDebutEnlev: string | null

  @column({ columnName: 'XSHITIMFIN_0' })
  declare heureFinEnlev: string | null

  @column({ columnName: 'XSSLIGORI_0' })
  declare nSousligneOrigine: string | null

  @column({ columnName: 'XSVCEMET_0' })
  declare serviceEmetteur: string | null

  @column({ columnName: 'XTEXT0_0' })
  declare zonedateheureDist: string | null

  @column({ columnName: 'XTIMMES_0' })
  declare heureMessEdi: string | null

  @column({ columnName: 'XVERSION_0' })
  declare version: string | null

  @column({ columnName: 'YEA_0' })
  declare annee: string | null

  @column({ columnName: 'YNBCOLIS_0' })
  declare nombreDeColis: string | null

  @column({ columnName: 'Z01STATUT_0' })
  declare statut: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'article', localKey: 'article' })
  declare ficheArticle: BelongsTo<typeof ItemMaster>

  @belongsTo(() => SalesOrder, { foreignKey: 'noCommande1', localKey: 'noCommande' })
  declare commandeVente: BelongsTo<typeof SalesOrder>

  @belongsTo(() => PurchaseOrder, { foreignKey: 'noCommande', localKey: 'noCommande' })
  declare commandeAchat: BelongsTo<typeof PurchaseOrder>

  @belongsTo(() => LocalMenu, {
    foreignKey: 'etatLigne',
    localKey: 'value',
    onQuery: (q) => q.where('chapter', 279),
  })
  declare etatLigneMenu: BelongsTo<typeof LocalMenu>

  @belongsTo(() => LocalMenu, {
    foreignKey: 'statutOrdre',
    localKey: 'value',
    onQuery: (q) => q.where('chapter', 317),
  })
  declare statutOrdreMenu: BelongsTo<typeof LocalMenu>
}
