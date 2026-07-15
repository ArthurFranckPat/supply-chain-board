import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'

export default class StockJournal extends BaseModel {
  static table = 'STOJOU'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column.date({ columnName: 'ACCDAT_0' })
  declare dateComptable: DateTime | null

  @column({ columnName: 'ACT_0' })
  declare titreEnUnitesInternationales: string | null

  @column({ columnName: 'ACTQTY_0' })
  declare quantiteActive: string | null

  @column({ columnName: 'AGGIFAFLG_0' })
  declare mvtAgregeInterface: string | null

  @column({ columnName: 'AMTDEV_0' })
  declare ecartNonAbsorbe: string | null

  @column({ columnName: 'AMTDEV2_0' })
  declare ecartNonAbsorbe1: string | null

  @column({ columnName: 'AMTORD_0' })
  declare montantOrdre: string | null

  @column({ columnName: 'AMTVAL_0' })
  declare montantMouvement: string | null

  @column({ columnName: 'AMTVAL2_0' })
  declare montantMouvement1: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BETCPY_0' })
  declare intersocietes: string | null

  @column({ columnName: 'BPRNUM_0' })
  declare numeroTiers: string | null

  @column({ columnName: 'BPSLOT_0' })
  declare lotFournisseur: string | null

  @column({ columnName: 'CCE_0' })
  declare sectionAnalytique: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column.date({ columnName: 'CREMVTDAT_0' })
  declare dateCreation1: DateTime | null

  @column({ columnName: 'CREMVTSEQ_0' })
  declare sequenceOrigine: string | null

  @column({ columnName: 'CREMVTTIM_0' })
  declare heure: string | null

  @column({ columnName: 'CRETIM_0' })
  declare heure1: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'CSTCOU_0' })
  declare chronoCoutsFifo: string | null

  @column.date({ columnName: 'CSTDAT_0' })
  declare dateFifo: DateTime | null

  @column({ columnName: 'CSTTIM_0' })
  declare heureFifo: string | null

  @column({ columnName: 'CTRNUM_0' })
  declare identifiant2: string | null

  @column({ columnName: 'DIE_0' })
  declare codeAxe: string | null

  @column.date({ columnName: 'DLUDAT_0' })
  declare dateLimiteUtilisation: DateTime | null

  @column({ columnName: 'ECCVALMAJ_0' })
  declare versionMajeure: string | null

  @column({ columnName: 'ECCVALMIN_0' })
  declare versionMineure: string | null

  @column({ columnName: 'ENTCOD_0' })
  declare codePieceAutomatique: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'FINRSPFCY_0' })
  declare siteResponsableFinancier: string | null

  @column({ columnName: 'GTE_0' })
  declare typeDePiece: string | null

  @column.date({ columnName: 'IPTDAT_0' })
  declare dateImputation: DateTime | null

  @column({ columnName: 'ITMREF_0' })
  declare article: string | null

  @column({ columnName: 'LBEFMT_0' })
  declare formatEtiquette: string | null

  @column({ columnName: 'LBENBR_0' })
  declare nombreEtiquettes: string | null

  @column({ columnName: 'LOC_0' })
  declare emplacement: string | null

  @column({ columnName: 'LOT_0' })
  declare lot: string | null

  @column({ columnName: 'LPNNUM_0' })
  declare numeroContenant: string | null

  @column({ columnName: 'MVTDES_0' })
  declare designationMouvement: string | null

  @column({ columnName: 'MVTIND_0' })
  declare indice: string | null

  @column({ columnName: 'MVTSEQ_0' })
  declare sequence: string | null

  @column.date({ columnName: 'NEWLTIDAT_0' })
  declare dateRecontrole: DateTime | null

  @column({ columnName: 'NUMVCR_0' })
  declare pieceComptable: string | null

  @column({ columnName: 'OWNER_0' })
  declare proprietaire: string | null

  @column({ columnName: 'PALNUM_0' })
  declare identifiant1: string | null

  @column({ columnName: 'PCU_0' })
  declare unite: string | null

  @column({ columnName: 'PCUORI_0' })
  declare ucOrigine: string | null

  @column({ columnName: 'PCUSTUCOE_0' })
  declare coefficient: string | null

  @column({ columnName: 'PCUSTUORI_0' })
  declare coeffOrigine: string | null

  @column({ columnName: 'PITVALFLG_0' })
  declare agrege: string | null

  @column({ columnName: 'PITVALFLG2_0' })
  declare agrege1: string | null

  @column({ columnName: 'PJT_0' })
  declare affaire: string | null

  @column({ columnName: 'POT_0' })
  declare titre: string | null

  @column({ columnName: 'PRINAT_0' })
  declare naturePrixOrigine: string | null

  @column({ columnName: 'PRINAT2_0' })
  declare naturePrixOrigine1: string | null

  @column({ columnName: 'PRIORD_0' })
  declare prixOrdre: string | null

  @column({ columnName: 'PRIREGFLG_0' })
  declare flagRegularisation: string | null

  @column({ columnName: 'PRIVAL_0' })
  declare prixValorise: string | null

  @column({ columnName: 'PRIVAL2_0' })
  declare prixValorise1: string | null

  @column({ columnName: 'PRNFLG_0' })
  declare imprime: string | null

  @column({ columnName: 'PRONUM_0' })
  declare numeroProcess: string | null

  @column({ columnName: 'QLYCTLDEM_0' })
  declare demandeAnalyseQualite: string | null

  @column({ columnName: 'QTYPCU_0' })
  declare quantite: string | null

  @column({ columnName: 'QTYSTU_0' })
  declare quantiteUs: string | null

  @column({ columnName: 'REGFLG_0' })
  declare mouvementRegularise: string | null

  @column({ columnName: 'SERDEB_0' })
  declare serieDebut: string | null

  @column({ columnName: 'SERFIN_0' })
  declare serieFin: string | null

  @column({ columnName: 'SERNUM_0' })
  declare serie: string | null

  @column.date({ columnName: 'SHLDAT_0' })
  declare datePeremption: DateTime | null

  @column({ columnName: 'SLO_0' })
  declare slot: string | null

  @column({ columnName: 'STA_0' })
  declare statut: string | null

  @column({ columnName: 'STOFCY_0' })
  declare siteStockage: string | null

  @column({ columnName: 'STOFLD1_0' })
  declare champPersonnalise1: string | null

  @column({ columnName: 'STOFLD2_0' })
  declare champPersonnalise2: string | null

  @column({ columnName: 'STU_0' })
  declare uniteStock: string | null

  @column({ columnName: 'TRSFAM_0' })
  declare familleMouvement: string | null

  @column({ columnName: 'TRSTYP_0' })
  declare typeTransaction: string | null

  @column({ columnName: 'UPDCOD_0' })
  declare miseAJour: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModif: string | null

  @column({ columnName: 'USRFLD1_0' })
  declare champPersonnaliseStock1: string | null

  @column({ columnName: 'USRFLD2_0' })
  declare champPersonnaliseStock2: string | null

  @column({ columnName: 'USRFLD3_0' })
  declare champPersonnaliseStock3: string | null

  @column.date({ columnName: 'USRFLD4_0' })
  declare champPersonnaliseStock4: DateTime | null

  @column({ columnName: 'VARORD_0' })
  declare variationOrdre: string | null

  @column({ columnName: 'VARVAL_0' })
  declare variationMouvement: string | null

  @column({ columnName: 'VARVAL2_0' })
  declare variationMouvement1: string | null

  @column({ columnName: 'VCRLIN_0' })
  declare noLignePiece: string | null

  @column({ columnName: 'VCRLINORI_0' })
  declare noLignePieceOrigine: string | null

  @column({ columnName: 'VCRLINREG_0' })
  declare noLignePieceRegul: string | null

  @column({ columnName: 'VCRNUM_0' })
  declare noPieceNoRecNoLivOuNoOf: string | null

  @column({ columnName: 'VCRNUMORI_0' })
  declare noPieceOrigineNoRecOuNoOf: string | null

  @column({ columnName: 'VCRNUMREG_0' })
  declare noPieceRegularisation: string | null

  @column({ columnName: 'VCRSEQORI_0' })
  declare noSequencePieceOrigine: string | null

  @column({ columnName: 'VCRTYP_0' })
  declare typePiece: string | null

  @column({ columnName: 'VCRTYPORI_0' })
  declare typePieceOrigine: string | null

  @column({ columnName: 'VCRTYPREG_0' })
  declare typePieceRegul: string | null

  @column({ columnName: 'WRH_0' })
  declare depot: string | null

  @column({ columnName: 'XLABCST_0' })
  declare coutMaindoeuvre: string | null

  @column({ columnName: 'XLABCSTREG_0' })
  declare coutMaindoeuvre1: string | null

  @column({ columnName: 'XMACCST_0' })
  declare coutMachine: string | null

  @column({ columnName: 'XMACCSTREG_0' })
  declare coutMachine1: string | null

  @column({ columnName: 'XMATCST_0' })
  declare coutMatiere: string | null

  @column({ columnName: 'XMATCSTREG_0' })
  declare coutMatiere1: string | null

  @column({ columnName: 'XOVELABCST_0' })
  declare coutFraisGenerauxMaindoeuvre: string | null

  @column({ columnName: 'XOVELABREG_0' })
  declare coutFraisGenerauxMaindoeuvre1: string | null

  @column({ columnName: 'XOVEMACCST_0' })
  declare coutFraisGenerauxMachine: string | null

  @column({ columnName: 'XOVEMACREG_0' })
  declare coutFraisGenerauxMachine1: string | null

  @column({ columnName: 'XOVEMATCST_0' })
  declare coutFraisGenerauxMatiere: string | null

  @column({ columnName: 'XOVEMATREG_0' })
  declare coutFraisGenerauxMatiere1: string | null

  @column({ columnName: 'XOVESCOCST_0' })
  declare coutFraisGenerauxSoustraitance: string | null

  @column({ columnName: 'XOVESCOREG_0' })
  declare coutFraisGenerauxSoustraitance1: string | null

  @column({ columnName: 'XSCOCST_0' })
  declare coutSoustraitance: string | null

  @column({ columnName: 'XSCOCSTREG_0' })
  declare coutSoustraitance1: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'article', localKey: 'article' })
  declare ficheArticle: BelongsTo<typeof ItemMaster>
}
