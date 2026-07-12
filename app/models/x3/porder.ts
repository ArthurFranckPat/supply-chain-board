import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Orders from '#models/x3/orders'
import PurchaseOrderLine from '#models/x3/porderq'
import SalesOrderLine from '#models/x3/sorderq'

export default class PurchaseOrder extends BaseModel {
  static table = 'PORDER'
  static connection = 'x3'
  static primaryKey = 'noCommande'

  @column({ columnName: 'APPFLG_0' })
  declare signee: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BETCPY_0' })
  declare intersocietes: string | null

  @column({ columnName: 'BETFCY_0' })
  declare intersite: string | null

  @column({ columnName: 'BPAADD_0' })
  declare adresse: string | null

  @column({ columnName: 'BPAADDLIG_0' })
  declare ligneAdresse: string | null

  @column({ columnName: 'BPAINV_0' })
  declare adresseFacture: string | null

  @column({ columnName: 'BPAPAY_0' })
  declare adresseTiersPaye: string | null

  @column({ columnName: 'BPCORD_0' })
  declare clientCommande: string | null

  @column({ columnName: 'BPOADD_0' })
  declare adresseExpediteur: string | null

  @column({ columnName: 'BPOADDLIG_0' })
  declare ligneAdresse1: string | null

  @column({ columnName: 'BPOCRY_0' })
  declare pays: string | null

  @column({ columnName: 'BPOCRYNAM_0' })
  declare nomPays: string | null

  @column({ columnName: 'BPOCTY_0' })
  declare ville: string | null

  @column({ columnName: 'BPONAM_0' })
  declare raisonSociale: string | null

  @column({ columnName: 'BPOPOSCOD_0' })
  declare codePostal: string | null

  @column({ columnName: 'BPOSAT_0' })
  declare etat: string | null

  @column({ columnName: 'BPRNAM_0' })
  declare raisonSociale1: string | null

  @column({ columnName: 'BPRPAY_0' })
  declare tiersPaye: string | null

  @column({ columnName: 'BPSINV_0' })
  declare tiersFacturant: string | null

  @column({ columnName: 'BPSNUM_0' })
  declare fournisseur: string | null

  @column({ columnName: 'BPTNUM_0' })
  declare transporteur: string | null

  @column({ columnName: 'BUY_0' })
  declare acheteur: string | null

  @column({ columnName: 'CCE_0' })
  declare section: string | null

  @column({ columnName: 'CHGCOE_0' })
  declare cours: string | null

  @column({ columnName: 'CHGTYP_0' })
  declare typeCours: string | null

  @column({ columnName: 'CLEFLG_0' })
  declare soldee: string | null

  @column({ columnName: 'CLELINNBR_0' })
  declare nombreDeLignesSoldees: string | null

  @column({ columnName: 'COPNBR_0' })
  declare nombreExemplairesBonCommande: string | null

  @column({ columnName: 'CPY_0' })
  declare societe: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'CRY_0' })
  declare pays1: string | null

  @column({ columnName: 'CRYNAM_0' })
  declare nomPays1: string | null

  @column({ columnName: 'CTY_0' })
  declare ville1: string | null

  @column({ columnName: 'CUR_0' })
  declare devise: string | null

  @column({ columnName: 'DEP_0' })
  declare codeEscompte: string | null

  @column({ columnName: 'DIE_0' })
  declare codeAxe: string | null

  @column({ columnName: 'DISCRGTYP_0' })
  declare typeDeValeurRemisefrais: string | null

  @column({ columnName: 'DME_0' })
  declare livraisonPartielle: string | null

  @column({ columnName: 'DSPVOU_0' })
  declare uniteVolume: string | null

  @column({ columnName: 'DSPWEU_0' })
  declare unitePoids: string | null

  @column({ columnName: 'EECICT_0' })
  declare incoterm: string | null

  @column({ columnName: 'EECLOC_0' })
  declare lieuTransportDeb: string | null

  @column({ columnName: 'EECNUM_0' })
  declare identificationUe: string | null

  @column.date({ columnName: 'ENDDAT_0' })
  declare dateFinValidite: DateTime | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column.date({ columnName: 'EXTRCPDAT1_0' })
  declare dateReceptPrevue: DateTime | null

  @column({ columnName: 'FBULINNBR_0' })
  declare nombreDeLignesHorsBudget: string | null

  @column({ columnName: 'FFWADD_0' })
  declare adresseTransitaire: string | null

  @column({ columnName: 'FFWNUM_0' })
  declare numeroTransitaire: string | null

  @column({ columnName: 'FUPFLG_0' })
  declare relanceDesLivraisonsEnRetard: string | null

  @column({ columnName: 'GPGCOD_0' })
  declare codeRegroupement: string | null

  @column({ columnName: 'ICTCTY_0' })
  declare villeIncoterm: string | null

  @column({ columnName: 'INVDTALIN1_0' })
  declare eltFactLigTarif: string | null

  @column({ columnName: 'INVDTALIN2_0' })
  declare eltFactLigRepart: string | null

  @column({ columnName: 'INVDTAVAT1_0' })
  declare taxeLigTarif: string | null

  @column({ columnName: 'INVDTAVAT2_0' })
  declare taxeLigRepart: string | null

  @column({ columnName: 'INVFCY_0' })
  declare siteFacturation: string | null

  @column({ columnName: 'INVFLG_0' })
  declare facturee: string | null

  @column({ columnName: 'INVLINNBR_0' })
  declare nombreDeLignesFacturees: string | null

  @column({ columnName: 'INVNBR_0' })
  declare nombreDeFactures: string | null

  @column({ columnName: 'LAN_0' })
  declare langue: string | null

  @column({ columnName: 'LINNBR_0' })
  declare nombreDeLignes: string | null

  @column({ columnName: 'MDL_0' })
  declare modeLivraison: string | null

  @column.date({ columnName: 'OCNDAT_0' })
  declare dateAccuseReception: DateTime | null

  @column({ columnName: 'OCNFLG_0' })
  declare relanceArc: string | null

  @column({ columnName: 'OCNNUM_0' })
  declare numeroArc: string | null

  @column({ columnName: 'OCNREM_0' })
  declare observationsArc: string | null

  @column.date({ columnName: 'ORDDAT_0' })
  declare dateCommande: DateTime | null

  @column({ columnName: 'ORDMAXAMT_0' })
  declare mtMaxiCommande: string | null

  @column({ columnName: 'ORDREF_0' })
  declare referenceInterneOuCommande: string | null

  @column({ columnName: 'ORIFCY_0' })
  declare siteOrigineemetteur: string | null

  @column({ columnName: 'PJTH_0' })
  declare affaire: string | null

  @column({ columnName: 'POHFCY_0' })
  declare siteCommande: string | null

  @column({ columnName: 'POHNUM_0' })
  declare noCommande: string | null

  @column({ columnName: 'POHTYP_0' })
  declare typeCommande: string | null

  @column({ columnName: 'POSCOD_0' })
  declare codePostal1: string | null

  @column({ columnName: 'PRNFLG_0' })
  declare imprimee: string | null

  @column({ columnName: 'PTE_0' })
  declare conditionPaiement: string | null

  @column({ columnName: 'PURTYP_0' })
  declare typeAchat: string | null

  @column({ columnName: 'RCPFCY_0' })
  declare siteReception: string | null

  @column({ columnName: 'RCPFLG_0' })
  declare recue: string | null

  @column({ columnName: 'RCPLINNBR_0' })
  declare nombreDeLignesReceptionnees: string | null

  @column({ columnName: 'RCPNBR_0' })
  declare nombreDeReceptions: string | null

  @column({ columnName: 'REVNUM_0' })
  declare noAvenant: string | null

  @column({ columnName: 'SALFCY_0' })
  declare siteVente: string | null

  @column({ columnName: 'SAT_0' })
  declare etat1: string | null

  @column({ columnName: 'SINUM_0' })
  declare noPieceIntegrale: string | null

  @column({ columnName: 'SOHCAT_0' })
  declare categorieCommande: string | null

  @column({ columnName: 'STOFCY_0' })
  declare siteExpedition: string | null

  @column.date({ columnName: 'STRDAT_0' })
  declare dateDebutValidite: DateTime | null

  @column({ columnName: 'TCTRNUM_0' })
  declare contenant: string | null

  @column({ columnName: 'TCTRQTY_0' })
  declare nbContenants: string | null

  @column({ columnName: 'TEX1_0' })
  declare noTexte: string | null

  @column({ columnName: 'TEX2_0' })
  declare texte: string | null

  @column({ columnName: 'TOTLINAMT_0' })
  declare totalHtLignes: string | null

  @column({ columnName: 'TOTLINATI_0' })
  declare totalTtcLignes: string | null

  @column({ columnName: 'TOTLINQTY_0' })
  declare totalQtesLignes: string | null

  @column({ columnName: 'TOTLINVOU_0' })
  declare totalVolumesLignes: string | null

  @column({ columnName: 'TOTLINWEU_0' })
  declare totalPoidsLignes: string | null

  @column({ columnName: 'TOTORD_0' })
  declare totalHtCommande: string | null

  @column({ columnName: 'TOTORDL_0' })
  declare totalHtCommandeDeviseSociete: string | null

  @column({ columnName: 'TOTTAXAMT_0' })
  declare totalTaxes: string | null

  @column({ columnName: 'TOTVLT_0' })
  declare totalHtPrevu: string | null

  @column({ columnName: 'TSSCOD_0' })
  declare familleStatistique: string | null

  @column({ columnName: 'TTVORD_0' })
  declare totalTtcCommande: string | null

  @column({ columnName: 'TTVORDL_0' })
  declare totalTtcCommandeDeviseSociete: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModification: string | null

  @column({ columnName: 'VACBPR_0' })
  declare regimeTaxe: string | null

  @column({ columnName: 'VACTYP_0' })
  declare typeDeRegimeTaxe: string | null

  @column({ columnName: 'VOLCAP_0' })
  declare volume: string | null

  @column({ columnName: 'WEICAP_0' })
  declare poids: string | null

  @column({ columnName: 'X4AVMOTCOM_0' })
  declare transEntreeDivers: string | null

  @column({ columnName: 'X4CMDBLC_0' })
  declare commandeBloquee: string | null

  @column({ columnName: 'X4EXCLRFA_0' })
  declare exclusionRfa: string | null

  @column({ columnName: 'X4NUMDEMAND_0' })
  declare demandeDeService: string | null

  @column({ columnName: 'X4NUMINT_0' })
  declare intervention: string | null

  @column({ columnName: 'X4POHDEST_0' })
  declare destinataire: string | null

  @column({ columnName: 'X4POHEXP_0' })
  declare expediteur: string | null

  @column({ columnName: 'XCMQINT_0' })
  declare contremarqueInterne: string | null

  @column({ columnName: 'XNBEDT_0' })
  declare nombreDimpressions: string | null

  @column({ columnName: 'XPOHTYP_0' })
  declare typeCommandeAchat: string | null

  @column({ columnName: 'XTYPCDE_0' })
  declare commandeUrgente: string | null

  @column({ columnName: 'YADDLIV_0' })
  declare adrLiv: string | null

  @column({ columnName: 'YBPRLIV_0' })
  declare tiersLivre: string | null

  @hasMany(() => PurchaseOrderLine, { foreignKey: 'noCommande', localKey: 'noCommande' })
  declare purchaseOrderLineList: HasMany<typeof PurchaseOrderLine>

  @hasMany(() => SalesOrderLine, { foreignKey: 'noCommande', localKey: 'noCommande' })
  declare salesOrderLineList: HasMany<typeof SalesOrderLine>

  // ORDERS.VCRNUM_0 polymorphe — filtre VCRTYP_0 = 14 (commande achat)
  @hasMany(() => Orders, {
    foreignKey: 'daOrdreSst',
    localKey: 'noCommande',
    onQuery: (query) => query.where('typePiece', 14),
  })
  declare encoursList: HasMany<typeof Orders>
}
