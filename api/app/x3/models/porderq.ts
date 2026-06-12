import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'
import PurchaseOrder from '#models/x3/porder'
import SalesOrder from '#models/x3/sorder'

export default class PurchaseOrderLine extends BaseModel {
  static table = 'PORDERQ'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'AMTTAXISS_0' })
  declare montantTaxeSortie: string | null

  @column({ columnName: 'AMTTAXLIN1_0' })
  declare montantTaxe1: string | null

  @column({ columnName: 'AMTTAXLIN2_0' })
  declare montantTaxe2: string | null

  @column({ columnName: 'AMTTAXLIN3_0' })
  declare montantTaxe3: string | null

  @column({ columnName: 'AMTTAXOTH1_0' })
  declare montantAutreTaxe1: string | null

  @column({ columnName: 'AMTTAXOTH2_0' })
  declare montantAutreTaxe2: string | null

  @column({ columnName: 'AMTTAXRCP_0' })
  declare montantTaxeEntree: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BASTAXLIN1_0' })
  declare baseTaxe1: string | null

  @column({ columnName: 'BPAINV_0' })
  declare adresseFacture: string | null

  @column({ columnName: 'BPSINV_0' })
  declare tiersFacturant: string | null

  @column({ columnName: 'BPSNUM_0' })
  declare fournisseur: string | null

  @column({ columnName: 'CAD_0' })
  declare cadencement: string | null

  @column({ columnName: 'CLCAMT1_0' })
  declare baseDeCalculNumero1PourTaxe: string | null

  @column({ columnName: 'CLCAMT2_0' })
  declare baseDeCalculNumero2PourTaxe: string | null

  @column({ columnName: 'CLCAMT3_0' })
  declare baseDeCalculNumero3PourTaxe: string | null

  @column({ columnName: 'CLCAMT4_0' })
  declare baseDeCalculNumero4PourTaxe: string | null

  @column({ columnName: 'CLCAMT5_0' })
  declare baseDeCalculNumero5PourTaxe: string | null

  @column({ columnName: 'CLCAMT6_0' })
  declare baseDeCalculNumero6PourTaxe: string | null

  @column({ columnName: 'CLCAMT7_0' })
  declare baseDeCalculNumero7PourTaxe: string | null

  @column({ columnName: 'CMMFLG_0' })
  declare indicateurDengagement: string | null

  @column({ columnName: 'CMMNUM_0' })
  declare noEngagement: string | null

  @column({ columnName: 'CMMTAX_0' })
  declare typeDengagement: string | null

  @column({ columnName: 'CPR_0' })
  declare coutStockUnitaire: string | null

  @column({ columnName: 'CPRAMT_0' })
  declare coutFixeUnitaire: string | null

  @column({ columnName: 'CPRCOE_0' })
  declare coefficientFraisApproche: string | null

  @column({ columnName: 'CPRCUR_0' })
  declare deviseSociete: string | null

  @column({ columnName: 'CPRPRI_0' })
  declare prixRevientSansFraisDapproche: string | null

  @column({ columnName: 'CPY_0' })
  declare societe: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'CSTPUR_0' })
  declare coutAchatUnitaire: string | null

  @column({ columnName: 'DEDTAXISS_0' })
  declare taxeDeductible: string | null

  @column({ columnName: 'DEDTAXLIN1_0' })
  declare taxeDeductible1: string | null

  @column({ columnName: 'DEDTAXLIN2_0' })
  declare taxeDeductible2: string | null

  @column({ columnName: 'DEDTAXLIN3_0' })
  declare taxeDeductible3: string | null

  @column({ columnName: 'DEDTAXOTH1_0' })
  declare taxeDeductible4: string | null

  @column({ columnName: 'DEDTAXOTH2_0' })
  declare taxeDeductible5: string | null

  @column({ columnName: 'DEDTAXRCP_0' })
  declare taxeDeductible6: string | null

  @column.date({ columnName: 'DEMENDDAT_0' })
  declare dateFinDemandee: DateTime | null

  @column({ columnName: 'DEMENDHOU_0' })
  declare heureFinDemandee: string | null

  @column.date({ columnName: 'DEMRCPDAT_0' })
  declare dateRecepDemandee: DateTime | null

  @column({ columnName: 'DEMRCPHOU_0' })
  declare heureRecepDemandee: string | null

  @column({ columnName: 'DISBASLIN1_0' })
  declare remiseBaseTaxe1: string | null

  @column({ columnName: 'DISCRGAMT1_0' })
  declare remisefrais1: string | null

  @column({ columnName: 'DISCRGAMT2_0' })
  declare remisefrais2: string | null

  @column({ columnName: 'DISCRGAMT3_0' })
  declare remisefrais3: string | null

  @column({ columnName: 'DISCRGAMT4_0' })
  declare remisefrais4: string | null

  @column({ columnName: 'DISCRGAMT5_0' })
  declare remisefrais5: string | null

  @column({ columnName: 'DISCRGAMT6_0' })
  declare remisefrais6: string | null

  @column({ columnName: 'DISCRGAMT7_0' })
  declare remisefrais7: string | null

  @column({ columnName: 'DISCRGAMT8_0' })
  declare remisefrais8: string | null

  @column({ columnName: 'DISCRGAMT9_0' })
  declare remisefrais9: string | null

  @column({ columnName: 'ECCVALMAJ_0' })
  declare versionMajeure: string | null

  @column({ columnName: 'ECCVALMIN_0' })
  declare versionMineure: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column.date({ columnName: 'EXTRCPDAT_0' })
  declare dateReceptionPrevue: DateTime | null

  @column({ columnName: 'FBUFLG_0' })
  declare depassementDeBudget: string | null

  @column({ columnName: 'FCSCPR_0' })
  declare totalChargesStock: string | null

  @column({ columnName: 'FCSCSTPUR_0' })
  declare totalChargesAchat: string | null

  @column({ columnName: 'FCYADD_0' })
  declare adresseReception: string | null

  @column({ columnName: 'INVQTYPUU_0' })
  declare quantiteFactureeUa: string | null

  @column({ columnName: 'INVQTYSTU_0' })
  declare quantiteFactureeUs: string | null

  @column({ columnName: 'INVRCPNBR_0' })
  declare nombreDeReceptionFacturees: string | null

  @column({ columnName: 'ITMKND_0' })
  declare typeDarticle: string | null

  @column({ columnName: 'ITMREF_0' })
  declare article: string | null

  @column({ columnName: 'ITMREFBPS_0' })
  declare articleFournisseur: string | null

  @column({ columnName: 'ITMREFORI_0' })
  declare articleLance: string | null

  @column.date({ columnName: 'LASINVDAT_0' })
  declare dateDerniereFacture: DateTime | null

  @column.date({ columnName: 'LASRCPDAT_0' })
  declare dateDerniereEntree: DateTime | null

  @column({ columnName: 'LIKQTYCOE_0' })
  declare coefficientQuantiteLien: string | null

  @column({ columnName: 'LINAMT_0' })
  declare montantLigneHt: string | null

  @column({ columnName: 'LINAMTCPR_0' })
  declare coutStock: string | null

  @column({ columnName: 'LINATI_0' })
  declare montantLigneTtc: string | null

  @column({ columnName: 'LINATIAMT_0' })
  declare montantLigneTtc1: string | null

  @column({ columnName: 'LINCLEFLG_0' })
  declare ligneSoldee: string | null

  @column({ columnName: 'LINCSTPUR_0' })
  declare coutAchat: string | null

  @column({ columnName: 'LININVFLG_0' })
  declare ligneFacturee: string | null

  @column({ columnName: 'LININVNBR_0' })
  declare nombreDeFactures: string | null

  @column.date({ columnName: 'LINOCNDAT_0' })
  declare dateArc: DateTime | null

  @column({ columnName: 'LINOCNFLG_0' })
  declare indicateurArc: string | null

  @column({ columnName: 'LINOCNNUM_0' })
  declare numeroArc: string | null

  @column({ columnName: 'LINPRNFLG_0' })
  declare ligneImprimee: string | null

  @column({ columnName: 'LINPURTYP_0' })
  declare typeAchat: string | null

  @column({ columnName: 'LINRCPNBR_0' })
  declare nombreDeReceptions: string | null

  @column({ columnName: 'LINREVNUM_0' })
  declare noAvenant: string | null

  @column({ columnName: 'LINSTA_0' })
  declare etatLigne: string | null

  @column({ columnName: 'LINSTOFCY_0' })
  declare siteExpedition: string | null

  @column({ columnName: 'LINTEX_0' })
  declare numeroTexte: string | null

  @column({ columnName: 'LINTYP_0' })
  declare typeLigne: string | null

  @column({ columnName: 'LINVOU_0' })
  declare uniteDeVolume: string | null

  @column({ columnName: 'LINWEU_0' })
  declare unitePoids: string | null

  @column({ columnName: 'MON_0' })
  declare mois: string | null

  @column({ columnName: 'NETCUR_0' })
  declare devise: string | null

  @column({ columnName: 'OCNLIN_0' })
  declare ligneVteIntersoc: string | null

  @column({ columnName: 'OCNSEQ_0' })
  declare seqVteIntersoc: string | null

  @column({ columnName: 'OFS_0' })
  declare delaiReapprovisionnement: string | null

  @column.date({ columnName: 'ORDDAT_0' })
  declare dateCommande: DateTime | null

  @column({ columnName: 'ORI_0' })
  declare origineDemande: string | null

  @column({ columnName: 'PCK_0' })
  declare emballage: string | null

  @column({ columnName: 'POHFCY_0' })
  declare siteCommande: string | null

  @column({ columnName: 'POHNUM_0' })
  declare noCommande: string | null

  @column({ columnName: 'POHTYP_0' })
  declare typeCommande: string | null

  @column({ columnName: 'POPLIN_0' })
  declare ligneCommande: string | null

  @column({ columnName: 'POQLNK_0' })
  declare lignesequencePourLink: string | null

  @column({ columnName: 'POQSEQ_0' })
  declare numeroSequence: string | null

  @column({ columnName: 'PPDLIN_0' })
  declare ligneReponse: string | null

  @column({ columnName: 'PQHNUM_0' })
  declare numeroAppelOffres: string | null

  @column({ columnName: 'PRHFCY_0' })
  declare siteReception: string | null

  @column({ columnName: 'PTDLIN_0' })
  declare ligne: string | null

  @column({ columnName: 'PTHNUM_0' })
  declare noReception: string | null

  @column({ columnName: 'PUU_0' })
  declare uniteAchat: string | null

  @column({ columnName: 'QTYPUU_0' })
  declare quantiteUa: string | null

  @column({ columnName: 'QTYSTU_0' })
  declare quantiteUs: string | null

  @column({ columnName: 'QTYUOM_0' })
  declare quantiteCommandee: string | null

  @column({ columnName: 'QTYVOU_0' })
  declare volume: string | null

  @column({ columnName: 'QTYWEU_0' })
  declare poids: string | null

  @column({ columnName: 'RCPCLEFLG_0' })
  declare soldeeParReception: string | null

  @column({ columnName: 'RCPQTYPUU_0' })
  declare quantiteReceptionneeUa: string | null

  @column({ columnName: 'RCPQTYSTU_0' })
  declare quantiteReceptionneeUs: string | null

  @column({ columnName: 'REACSTPUR_0' })
  declare coutAchatRealise: string | null

  @column({ columnName: 'RETQTYPUU_0' })
  declare quantiteBesoinsPrisUa: string | null

  @column({ columnName: 'RETQTYSTU_0' })
  declare quantiteBesoinsPrisUs: string | null

  @column.date({ columnName: 'RETRCPDAT_0' })
  declare dateBesoin: DateTime | null

  @column({ columnName: 'SCOADD_0' })
  declare adresseSoustraitant: string | null

  @column({ columnName: 'SDDLIN_0' })
  declare ligneLivraison: string | null

  @column({ columnName: 'SDHNUM_0' })
  declare noLivraison: string | null

  @column({ columnName: 'SHIQTYPUU_0' })
  declare qteEnExpeUa: string | null

  @column({ columnName: 'SHIQTYSTU_0' })
  declare qteEnExpeUs: string | null

  @column({ columnName: 'SOHNUM_0' })
  declare numeroCommandeVente: string | null

  @column({ columnName: 'SOPLIN_0' })
  declare ligneCommande1: string | null

  @column({ columnName: 'SOQSEQ_0' })
  declare numeroSequence1: string | null

  @column({ columnName: 'STCNUM_0' })
  declare structureDeCouts: string | null

  @column({ columnName: 'STU_0' })
  declare uniteStock: string | null

  @column({ columnName: 'UOM_0' })
  declare uniteCommande: string | null

  @column({ columnName: 'UOMFLG_0' })
  declare commandeEnUc: string | null

  @column({ columnName: 'UOMPUUCOE_0' })
  declare coefficientUomua: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModification: string | null

  @column({ columnName: 'USEPLC_0' })
  declare lieuConsommation: string | null

  @column({ columnName: 'VCRLINORI_0' })
  declare noLignePieceOrigine: string | null

  @column({ columnName: 'VCRNUMORI_0' })
  declare noPieceOrigineNoRecOuNoOf: string | null

  @column({ columnName: 'VCRSEQORI_0' })
  declare noSequencePieceOrigine: string | null

  @column({ columnName: 'VCRTYPORI_0' })
  declare typePieceOrigine: string | null

  @column({ columnName: 'WEE_0' })
  declare noSemaine: string | null

  @column({ columnName: 'WIPNUM_0' })
  declare numeroOrdre: string | null

  @column({ columnName: 'WIPSTA_0' })
  declare statutEncours: string | null

  @column({ columnName: 'WIPTYP_0' })
  declare typeOrdre: string | null

  @column({ columnName: 'X4AVMOTCOMD_0' })
  declare transEntreeDivers: string | null

  @column({ columnName: 'X4EXCLRFAD_0' })
  declare exclusionRfa: string | null

  @column({ columnName: 'X4FLGBLC_0' })
  declare blocage: string | null

  @column({ columnName: 'X4HCAD_0' })
  declare stockNegatif: string | null

  @column.date({ columnName: 'X4HEXTRCPD_0' })
  declare depotCible: DateTime | null

  @column({ columnName: 'X4POHAGR_0' })
  declare numeroDagrement: string | null

  @column({ columnName: 'X4POHBPA_0' })
  declare adresseFabricant: string | null

  @column({ columnName: 'X4POHFAB_0' })
  declare fabricant: string | null

  @column({ columnName: 'XALERTE_0' })
  declare alerteVariation: string | null

  @column({ columnName: 'XDLVTIMDEB_0' })
  declare heureDebutRecepti: string | null

  @column({ columnName: 'XDLVTIMFIN_0' })
  declare heureFinReception: string | null

  @column({ columnName: 'XEXPORT_0' })
  declare exporteEdi: string | null

  @column({ columnName: 'XOBJ1_0' })
  declare objetPartie1: string | null

  @column({ columnName: 'XOBJ2_0' })
  declare objetPartie2: string | null

  @column({ columnName: 'XQTY_0' })
  declare quantiteVendueUv: string | null

  @column({ columnName: 'XQTYSTU_0' })
  declare qteCommandeeUs: string | null

  @column({ columnName: 'XSOHNUM_0' })
  declare noCommande1: string | null

  @column({ columnName: 'XSOPLIN_0' })
  declare ligne1: string | null

  @column({ columnName: 'XSOQSEQ_0' })
  declare numeroSequence2: string | null

  @column({ columnName: 'XTYPOBJ_0' })
  declare typeObjet: string | null

  @column({ columnName: 'XVERSION_0' })
  declare version: string | null

  @column({ columnName: 'YADDLIV_0' })
  declare adrLiv: string | null

  @column({ columnName: 'YBPRLIV_0' })
  declare tiersLivre: string | null

  @column({ columnName: 'YEA_0' })
  declare annee: string | null

  @column.date({ columnName: 'ZDATCOF_0' })
  declare dateConfirmeeFournisseur: DateTime | null

  @column({ columnName: 'ZFABNUM_0' })
  declare codeDuFabricant: string | null

  @column({ columnName: 'ZFLAG_0' })
  declare wfReception: string | null

  @column({ columnName: 'ZITMREFFAB_0' })
  declare referenceFabricant: string | null

  @column({ columnName: 'ZSIGFAB_0' })
  declare sigleFabricant: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'article', localKey: 'article' })
  declare ficheArticle: BelongsTo<typeof ItemMaster>

  @belongsTo(() => PurchaseOrder, { foreignKey: 'noCommande', localKey: 'noCommande' })
  declare commandeAchat: BelongsTo<typeof PurchaseOrder>

  @belongsTo(() => SalesOrder, { foreignKey: 'numeroCommandeVente', localKey: 'noCommande' })
  declare commandeVente: BelongsTo<typeof SalesOrder>

}
