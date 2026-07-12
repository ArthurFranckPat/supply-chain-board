import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Orders from '#models/x3/orders'
import SalesOrderLine from '#models/x3/sorderq'

export default class SalesOrder extends BaseModel {
  static table = 'SORDER'
  static connection = 'x3'
  static primaryKey = 'noCommande'

  @column({ columnName: 'ADRVAL_0' })
  declare valide: string | null

  @column({ columnName: 'ALLLINNBR_0' })
  declare nombreLignesAAllouer: string | null

  @column({ columnName: 'ALLSTA_0' })
  declare statutAllocation: string | null

  @column({ columnName: 'ALLTYP_0' })
  declare typeAllocation: string | null

  @column({ columnName: 'AMTTAX_0' })
  declare montantTaxe: string | null

  @column({ columnName: 'APPFLG_0' })
  declare signee: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BASTAX_0' })
  declare baseTaxe: string | null

  @column({ columnName: 'BETCPY_0' })
  declare intersocietes: string | null

  @column({ columnName: 'BETFCY_0' })
  declare intersite: string | null

  @column({ columnName: 'BPAADD_0' })
  declare adresseLivraison: string | null

  @column({ columnName: 'BPAINV_0' })
  declare codeAdresseFacture: string | null

  @column({ columnName: 'BPAORD_0' })
  declare codeAdresseCommande: string | null

  @column({ columnName: 'BPAPYR_0' })
  declare adressePayeur: string | null

  @column({ columnName: 'BPCADDLIG_0' })
  declare adresseCommande: string | null

  @column({ columnName: 'BPCCRY_0' })
  declare paysCommande: string | null

  @column({ columnName: 'BPCCRYNAM_0' })
  declare nomPaysCommande: string | null

  @column({ columnName: 'BPCCTY_0' })
  declare villeCommande: string | null

  @column({ columnName: 'BPCGRU_0' })
  declare clientGroupe: string | null

  @column({ columnName: 'BPCINV_0' })
  declare clientFacture: string | null

  @column({ columnName: 'BPCNAM_0' })
  declare nomClientCommande: string | null

  @column({ columnName: 'BPCORD_0' })
  declare clientCommande: string | null

  @column({ columnName: 'BPCPOSCOD_0' })
  declare codePostalCommande: string | null

  @column({ columnName: 'BPCPYR_0' })
  declare tiersPayeur: string | null

  @column({ columnName: 'BPCSAT_0' })
  declare etatCommande: string | null

  @column({ columnName: 'BPDADDLIG_0' })
  declare adresseLivraison1: string | null

  @column({ columnName: 'BPDCRY_0' })
  declare paysLivraison: string | null

  @column({ columnName: 'BPDCRYNAM_0' })
  declare nomPaysLivraison: string | null

  @column({ columnName: 'BPDCTY_0' })
  declare villeLivraison: string | null

  @column({ columnName: 'BPDNAM_0' })
  declare nomClientLivre: string | null

  @column({ columnName: 'BPDPOSCOD_0' })
  declare codePostalLivraison: string | null

  @column({ columnName: 'BPDSAT_0' })
  declare etatLivraison: string | null

  @column({ columnName: 'BPIADDLIG_0' })
  declare adresseFacture: string | null

  @column({ columnName: 'BPICRY_0' })
  declare paysFacture: string | null

  @column({ columnName: 'BPICRYNAM_0' })
  declare nomPaysFacture: string | null

  @column({ columnName: 'BPICTY_0' })
  declare villeFacture: string | null

  @column({ columnName: 'BPIEECNUM_0' })
  declare identificationUe: string | null

  @column({ columnName: 'BPINAM_0' })
  declare nomClientFacture: string | null

  @column({ columnName: 'BPIPOSCOD_0' })
  declare codePostalFacture: string | null

  @column({ columnName: 'BPISAT_0' })
  declare etatFacture: string | null

  @column({ columnName: 'BPTNUM_0' })
  declare transporteur: string | null

  @column({ columnName: 'CCE_0' })
  declare section: string | null

  @column.date({ columnName: 'CCLDAT_0' })
  declare dateSolde: DateTime | null

  @column({ columnName: 'CCLREN_0' })
  declare motifSolde: string | null

  @column({ columnName: 'CDTSTA_0' })
  declare etatCredit: string | null

  @column({ columnName: 'CDTSTAP_0' })
  declare etatEncoursPrecedent: string | null

  @column({ columnName: 'CHGRAT_0' })
  declare coursDevise: string | null

  @column({ columnName: 'CHGTYP_0' })
  declare typeCoursDevise: string | null

  @column({ columnName: 'CLELINNBR_0' })
  declare nombreLignesSoldees: string | null

  @column({ columnName: 'CMGNUM_0' })
  declare campagneMarketing: string | null

  @column({ columnName: 'CNDNAM_0' })
  declare contactLivraison: string | null

  @column({ columnName: 'CNINAM_0' })
  declare contactFacture: string | null

  @column({ columnName: 'CNTNAM_0' })
  declare personneAContacter: string | null

  @column({ columnName: 'COPNBR_0' })
  declare nombreExemplairesArc: string | null

  @column({ columnName: 'CPY_0' })
  declare societe: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'CUR_0' })
  declare devise: string | null

  @column({ columnName: 'CUSORDREF_0' })
  declare referenceCommandeClient: string | null

  @column({ columnName: 'DAYLTI_0' })
  declare delaiLivraison: string | null

  @column.date({ columnName: 'DEMDLVDAT_0' })
  declare dateLivraisonAcceptee: DateTime | null

  @column({ columnName: 'DEMDLVHOU_0' })
  declare heureLivraisonPrevue: string | null

  @column({ columnName: 'DEP_0' })
  declare escompte: string | null

  @column({ columnName: 'DIE_0' })
  declare codeAxe: string | null

  @column({ columnName: 'DISCRGTYP_0' })
  declare typeDeValeurRemisefrais: string | null

  @column({ columnName: 'DLRATI_0' })
  declare montantRestantALivrerTtc: string | null

  @column({ columnName: 'DLRNOT_0' })
  declare montantRestantALivrerHt: string | null

  @column({ columnName: 'DLVLINNBR_0' })
  declare nombreLignesLivrees: string | null

  @column({ columnName: 'DLVPIO_0' })
  declare prioriteLivraison: string | null

  @column({ columnName: 'DLVSTA_0' })
  declare etatLiv: string | null

  @column({ columnName: 'DME_0' })
  declare livraisonPartielle: string | null

  @column({ columnName: 'DRAFTREJ_0' })
  declare rejetBrouillon: string | null

  @column({ columnName: 'DRAFTREJREN_0' })
  declare motifRejetBrouillon: string | null

  @column({ columnName: 'DRAFTSTATUS_0' })
  declare brouillon: string | null

  @column({ columnName: 'DRN_0' })
  declare noTournee: string | null

  @column({ columnName: 'DSPTOTQTY_0' })
  declare cumulQuantite: string | null

  @column({ columnName: 'DSPTOTVOL_0' })
  declare cumulVolume: string | null

  @column({ columnName: 'DSPTOTWEI_0' })
  declare cumulPoids: string | null

  @column({ columnName: 'DSPVOU_0' })
  declare uniteVolume: string | null

  @column({ columnName: 'DSPWEU_0' })
  declare unitePoids: string | null

  @column({ columnName: 'EECICT_0' })
  declare incoterm: string | null

  @column({ columnName: 'EECLOC_0' })
  declare lieuTransportDeb: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'FFWADD_0' })
  declare adresseTransitaire: string | null

  @column({ columnName: 'FFWNUM_0' })
  declare numeroTransitaire: string | null

  @column({ columnName: 'GEOCOD_0' })
  declare geoCode: string | null

  @column({ columnName: 'HLDCOD_0' })
  declare codeVerrouillage: string | null

  @column({ columnName: 'HLDCODP_0' })
  declare codeVerrouillagePrecedent: string | null

  @column.date({ columnName: 'HLDDAT_0' })
  declare dateDeverrouillage: DateTime | null

  @column.date({ columnName: 'HLDDATP_0' })
  declare dateVerrouillagePrecedente: DateTime | null

  @column({ columnName: 'HLDSTA_0' })
  declare statutVerrouillage: string | null

  @column({ columnName: 'HLDTIM_0' })
  declare heureDeverrouillage: string | null

  @column({ columnName: 'HLDTIMP_0' })
  declare heureVerrouillagePrecedente: string | null

  @column({ columnName: 'HLDUSR_0' })
  declare utilisateurDeverrouillage: string | null

  @column({ columnName: 'HLDUSRP_0' })
  declare utilisateurVerrouPrecedent: string | null

  @column({ columnName: 'ICTCTY_0' })
  declare villeIncoterm: string | null

  @column({ columnName: 'IME_0' })
  declare modeFacturation: string | null

  @column({ columnName: 'INRATI_0' })
  declare aFacturerTtc: string | null

  @column({ columnName: 'INRNOT_0' })
  declare aFacturerHt: string | null

  @column({ columnName: 'INRSCHATI_0' })
  declare echeanceFacturationTtc: string | null

  @column({ columnName: 'INRSCHNOT_0' })
  declare echeanceFacturationHt: string | null

  @column({ columnName: 'INSCTYFLG_0' })
  declare flagInterieurVille: string | null

  @column({ columnName: 'INVCND_0' })
  declare conditionDeFacturation: string | null

  @column({ columnName: 'INVDTA_0' })
  declare elementDeFacturation: string | null

  @column({ columnName: 'INVDTAAMT_0' })
  declare ouMontantElementDeFacturation: string | null

  @column({ columnName: 'INVDTADSP_0' })
  declare cleRepart: string | null

  @column({ columnName: 'INVDTALIN_0' })
  declare eltFactLigTarif: string | null

  @column({ columnName: 'INVDTATYP_0' })
  declare typeDeValeur: string | null

  @column({ columnName: 'INVLINNBR_0' })
  declare nombreLignesFacturees: string | null

  @column({ columnName: 'INVSTA_0' })
  declare etatFacture1: string | null

  @column({ columnName: 'LAN_0' })
  declare langue: string | null

  @column.date({ columnName: 'LASDLVDAT_0' })
  declare dateDerniereLivraison: DateTime | null

  @column({ columnName: 'LASDLVNUM_0' })
  declare noDerniereLivraison: string | null

  @column.date({ columnName: 'LASINVDAT_0' })
  declare dateDerniereFacture: DateTime | null

  @column({ columnName: 'LASINVNUM_0' })
  declare noDerniereFacture: string | null

  @column({ columnName: 'LINNBR_0' })
  declare nombreLignes: string | null

  @column.date({ columnName: 'LNDRTNDAT_0' })
  declare dateRetourPret: DateTime | null

  @column({ columnName: 'MDL_0' })
  declare modeLivraison: string | null

  @column({ columnName: 'OCNFLG_0' })
  declare impressionArc: string | null

  @column({ columnName: 'OCNPRN_0' })
  declare arcImprime: string | null

  @column({ columnName: 'ODL_0' })
  declare uneCommandeParLivraison: string | null

  @column({ columnName: 'OPGNUM_0' })
  declare operationMarketing: string | null

  @column({ columnName: 'OPGTYP_0' })
  declare typeOperation: string | null

  @column({ columnName: 'ORDATI_0' })
  declare mtLignesTtc: string | null

  @column({ columnName: 'ORDATIL_0' })
  declare mtLignesTtcSoc: string | null

  @column({ columnName: 'ORDCLE_0' })
  declare autorisationSoldeCommande: string | null

  @column.date({ columnName: 'ORDDAT_0' })
  declare dateCommande: DateTime | null

  @column({ columnName: 'ORDINVATI_0' })
  declare valorisationTtc: string | null

  @column({ columnName: 'ORDINVATIL_0' })
  declare valorisationTtcSoc: string | null

  @column({ columnName: 'ORDINVNOT_0' })
  declare valorisationHt: string | null

  @column({ columnName: 'ORDINVNOTL_0' })
  declare valorisationHtSoc: string | null

  @column({ columnName: 'ORDNOT_0' })
  declare mtLignesHt: string | null

  @column({ columnName: 'ORDNOTL_0' })
  declare mtLignesHtSoc: string | null

  @column({ columnName: 'ORDSTA_0' })
  declare etatCommande1: string | null

  @column({ columnName: 'ORIFCY_0' })
  declare siteOrigineemetteur: string | null

  @column({ columnName: 'PFMTOT_0' })
  declare margeTotale: string | null

  @column({ columnName: 'PJT_0' })
  declare affaire: string | null

  @column({ columnName: 'PLISTC_0' })
  declare codeStructure: string | null

  @column({ columnName: 'PRFNUM_0' })
  declare noFactureProforma: string | null

  @column({ columnName: 'PRITYP_0' })
  declare prixHtttc: string | null

  @column({ columnName: 'PTE_0' })
  declare conditionPaiement: string | null

  @column({ columnName: 'REP_0' })
  declare representant: string | null

  @column({ columnName: 'REVNUM_0' })
  declare noAvenant: string | null

  @column({ columnName: 'SALFCY_0' })
  declare siteVente: string | null

  @column({ columnName: 'SDHTYP_0' })
  declare typeLivraison: string | null

  @column({ columnName: 'SFISSTCOD_0' })
  declare codeTaxeSst: string | null

  @column({ columnName: 'SHIADECOD_0' })
  declare codeExpeditdestin: string | null

  @column.date({ columnName: 'SHIDAT_0' })
  declare dateExpedition: DateTime | null

  @column({ columnName: 'SINUM_0' })
  declare noPieceIntegrale: string | null

  @column({ columnName: 'SOHCAT_0' })
  declare categorieCommande: string | null

  @column({ columnName: 'SOHCFMFLG_0' })
  declare signatureElectronique: string | null

  @column({ columnName: 'SOHNUM_0' })
  declare noCommande: string | null

  @column({ columnName: 'SOHNUMEND_0' })
  declare numeroDefinitif: string | null

  @column({ columnName: 'SOHTEX1_0' })
  declare texteEnteteCde: string | null

  @column({ columnName: 'SOHTEX2_0' })
  declare textePiedCde: string | null

  @column({ columnName: 'SOHTYP_0' })
  declare typeCommande: string | null

  @column.date({ columnName: 'SOHVALDAT_0' })
  declare dateDeValidation: DateTime | null

  @column({ columnName: 'SQHNUM_0' })
  declare noDevis: string | null

  @column({ columnName: 'SRENUM_0' })
  declare demandeDeService: string | null

  @column({ columnName: 'SSTENTCOD_0' })
  declare codeExonerationNa: string | null

  @column({ columnName: 'STOFCY_0' })
  declare siteExpedition: string | null

  @column({ columnName: 'TSCCOD_0' })
  declare familleStatistique: string | null

  @column({ columnName: 'UNL_0' })
  declare deverrouillage: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModif: string | null

  @column({ columnName: 'VACBPR_0' })
  declare regimeTaxe: string | null

  @column.date({ columnName: 'VCRINVCNDDAT_0' })
  declare dateDepartEcheance: DateTime | null

  @column.date({ columnName: 'VLYDATCON_0' })
  declare dateValidite: DateTime | null

  @column({ columnName: 'VTT_0' })
  declare typeTransactvertex: string | null

  @column({ columnName: 'X1PRECODMAN_0' })
  declare codePrepaForce: string | null

  @column({ columnName: 'X1TYPPREPA_0' })
  declare typePrepa: string | null

  @column({ columnName: 'X1TYPPREPMAN_0' })
  declare typePrepaForce: string | null

  @column({ columnName: 'X4AVMOTCOM_0' })
  declare transEntreeDivers: string | null

  @column({ columnName: 'X4DEBCTLCON_0' })
  declare deblCtrlArtcond: string | null

  @column({ columnName: 'X4EXCLRFA_0' })
  declare exclusionRfa: string | null

  @column({ columnName: 'X4FORREL_0' })
  declare forcerReliquats: string | null

  @column({ columnName: 'X4NUMDEMAND_0' })
  declare demandeDeService1: string | null

  @column({ columnName: 'X4NUMINT_0' })
  declare intervention: string | null

  @column({ columnName: 'X4REGREL_0' })
  declare regleReliquats: string | null

  @column({ columnName: 'X4RGOP_0' })
  declare optionsTransport: string | null

  @column({ columnName: 'X4SOHDEST_0' })
  declare destinataire: string | null

  @column({ columnName: 'X4SOHEXP_0' })
  declare expediteur: string | null

  @column({ columnName: 'X4TRTREL_0' })
  declare traitementReliquats: string | null

  @column({ columnName: 'XCMQINT_0' })
  declare contremarqueInterne: string | null

  @column({ columnName: 'XCOLSOUPLE_0' })
  declare colisageSouple: string | null

  @column({ columnName: 'XMODGFI_0' })
  declare modeGenFactInterc: string | null

  @column({ columnName: 'XNBEDT_0' })
  declare nombreDimpressions: string | null

  @column({ columnName: 'Z01STATUT_0' })
  declare statut: string | null

  @column({ columnName: 'ZBYEDI_0' })
  declare acheteurEdi: string | null

  @column({ columnName: 'ZCDECLIFIN_0' })
  declare cdeClientFinAldes: string | null

  @column({ columnName: 'ZCODLIVEDI_0' })
  declare codeLivraisonEdi: string | null

  @column({ columnName: 'ZCTAEDI_0' })
  declare contactEdi: string | null

  @column.date({ columnName: 'ZDATOK_0' })
  declare dateLivAcceptee: DateTime | null

  @column({ columnName: 'ZFLGEDI_0' })
  declare arcEdiEnvoye: string | null

  @column({ columnName: 'ZLIEUEXP_0' })
  declare lieuDexpedition: string | null

  @column({ columnName: 'ZN1CLIFIN_0' })
  declare nom1CliFinAldes: string | null

  @column({ columnName: 'ZN2CLIFIN_0' })
  declare nom2CliFinAldes: string | null

  @column({ columnName: 'ZSUEDI_0' })
  declare fournisseurEdi: string | null

  @hasMany(() => SalesOrderLine, { foreignKey: 'noCommande1', localKey: 'noCommande' })
  declare salesOrderLineList: HasMany<typeof SalesOrderLine>

  // ORDERS.VCRNUM_0 polymorphe — filtre VCRTYP_0 = 2 (commande vente)
  @hasMany(() => Orders, {
    foreignKey: 'daOrdreSst',
    localKey: 'noCommande',
    onQuery: (query) => query.where('typePiece', 2),
  })
  declare encoursList: HasMany<typeof Orders>
}
