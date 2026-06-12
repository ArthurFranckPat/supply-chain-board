import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'

export default class ItemMovement extends BaseModel {
  static table = 'ITMMVT'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'AINVDTAAVC_0' })
  declare elementFacturation: string | null

  @column({ columnName: 'AINVDTACST_0' })
  declare elementFacturation1: string | null

  @column({ columnName: 'ALABAVC_0' })
  declare coutMoPmp: string | null

  @column({ columnName: 'ALABCST_0' })
  declare coutMoPmp1: string | null

  @column({ columnName: 'AMACAVC_0' })
  declare coutMachinePmp: string | null

  @column({ columnName: 'AMACCST_0' })
  declare coutMachinePmp1: string | null

  @column({ columnName: 'AMATAVC_0' })
  declare coutMatierePmp: string | null

  @column({ columnName: 'AMATCST_0' })
  declare coutMatierePmp1: string | null

  @column({ columnName: 'AOVELABAVC_0' })
  declare fgMoPmp: string | null

  @column({ columnName: 'AOVELABCST_0' })
  declare fgMoPmp1: string | null

  @column({ columnName: 'AOVEMACAVC_0' })
  declare fgMachinePmp: string | null

  @column({ columnName: 'AOVEMACCST_0' })
  declare fgMachinePmp1: string | null

  @column({ columnName: 'AOVEMATAVC_0' })
  declare fgMatierePmp: string | null

  @column({ columnName: 'AOVEMATCST_0' })
  declare fgMatierePmp1: string | null

  @column({ columnName: 'AOVESCOAVC_0' })
  declare fgStPmp: string | null

  @column({ columnName: 'AOVESCOCST_0' })
  declare fgStPmp1: string | null

  @column({ columnName: 'ASCOAVC_0' })
  declare coutStPmp: string | null

  @column({ columnName: 'ASCOCST_0' })
  declare coutStPmp1: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'AVC_0' })
  declare prixMoyenPondere: string | null

  @column({ columnName: 'AVCBASAMT_0' })
  declare baseMontantPourCalculPmp: string | null

  @column({ columnName: 'AVCBASQTY_0' })
  declare baseQuantitePourCalculPmp: string | null

  @column({ columnName: 'BESSTO_0' })
  declare cumulBesoin: string | null

  @column({ columnName: 'BPRCTLSTO_0' })
  declare stockPreteQ: string | null

  @column({ columnName: 'BPRPHYSTO_0' })
  declare stockPreteA: string | null

  @column({ columnName: 'BPRREJSTO_0' })
  declare stockPreteR: string | null

  @column({ columnName: 'CFGVCRNUM_0' })
  declare npieceConfig: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'CTLALL_0' })
  declare alloueInterneQ: string | null

  @column({ columnName: 'CTLSTO_0' })
  declare stockInterneQ: string | null

  @column.date({ columnName: 'CUNDAT_0' })
  declare dateInventaire: DateTime | null

  @column({ columnName: 'CUNDIM_0' })
  declare nombreLignes: string | null

  @column({ columnName: 'CUNISSMVT_0' })
  declare nbSortiesDepuisInventaire: string | null

  @column({ columnName: 'CUNNBR_0' })
  declare nbreInventaires: string | null

  @column({ columnName: 'CUNNBREQU_0' })
  declare nbreInventJustes: string | null

  @column({ columnName: 'CUNQTYCLC_0' })
  declare qtesInvCalculees: string | null

  @column({ columnName: 'CUNQTYNEW_0' })
  declare qtesInvComptees: string | null

  @column({ columnName: 'CUNRCPMVT_0' })
  declare nbEntreesDepuisInventaire: string | null

  @column({ columnName: 'CUNSTO_0' })
  declare stockDernierInventaire: string | null

  @column({ columnName: 'DETSHT_0' })
  declare manquantDetail: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'GLOALL_0' })
  declare alloueGlobal: string | null

  @column({ columnName: 'GLOSHT_0' })
  declare manquantGlobal: string | null

  @column({ columnName: 'ITMREF_0' })
  declare article: string | null

  @column.date({ columnName: 'LASCUNDAT_0' })
  declare dateDernierInventaire: DateTime | null

  @column({ columnName: 'LASCUNLIS_0' })
  declare derniereListeGlobale: string | null

  @column.date({ columnName: 'LASISSDAT_0' })
  declare dateDerniereSortie: DateTime | null

  @column.date({ columnName: 'LASPURDAT_0' })
  declare dateDernierAchat: DateTime | null

  @column({ columnName: 'LASPURPRI_0' })
  declare dernierPrixDachat: string | null

  @column.date({ columnName: 'LASRCPDAT_0' })
  declare dateDerniereEntree: DateTime | null

  @column({ columnName: 'LASRCPPRI_0' })
  declare prixDerniereEntree: string | null

  @column.date({ columnName: 'LASREODAT_0' })
  declare dateDernierReaprovisionnement: DateTime | null

  @column({ columnName: 'LINVDTACST_0' })
  declare elementFacturation2: string | null

  @column({ columnName: 'LLABCST_0' })
  declare coutMoDernPrix: string | null

  @column({ columnName: 'LMACCST_0' })
  declare coutMacDernPrix: string | null

  @column({ columnName: 'LMATCST_0' })
  declare coutMatDernPrix: string | null

  @column({ columnName: 'LOVELABCST_0' })
  declare fgMoDernPrix: string | null

  @column({ columnName: 'LOVEMACCST_0' })
  declare fgMacDernPrix: string | null

  @column({ columnName: 'LOVEMATCST_0' })
  declare fgMatDernPrix: string | null

  @column({ columnName: 'LOVESCOCST_0' })
  declare fgStDernPrix: string | null

  @column({ columnName: 'LSCOCST_0' })
  declare coutStDernPrix: string | null

  @column.date({ columnName: 'NEXCUNDAT_0' })
  declare prochainInventaire: DateTime | null

  @column({ columnName: 'ORDSTO_0' })
  declare enReappro: string | null

  @column({ columnName: 'PHYALL_0' })
  declare alloueInterneA: string | null

  @column({ columnName: 'PHYSTO_0' })
  declare stockInterneA: string | null

  @column({ columnName: 'PLFCTLSTO_0' })
  declare quaiQ: string | null

  @column({ columnName: 'PLFPHYSTO_0' })
  declare quaiA: string | null

  @column({ columnName: 'PLFREJSTO_0' })
  declare quaiR: string | null

  @column({ columnName: 'REJALL_0' })
  declare alloueInterneR: string | null

  @column({ columnName: 'REJSTO_0' })
  declare stockInterneR: string | null

  @column({ columnName: 'SALSTO_0' })
  declare enCdeClient: string | null

  @column({ columnName: 'SCCALL_0' })
  declare alloue: string | null

  @column({ columnName: 'SCCLNDSTO_0' })
  declare stock: string | null

  @column({ columnName: 'SCOCTLALL_0' })
  declare alloueSstraitQ: string | null

  @column({ columnName: 'SCOCTLSTO_0' })
  declare stockSoustraitQ: string | null

  @column({ columnName: 'SCOPHYALL_0' })
  declare alloueSstraitA: string | null

  @column({ columnName: 'SCOPHYSTO_0' })
  declare stockSoustraitA: string | null

  @column({ columnName: 'SCOREJALL_0' })
  declare alloueSstraitR: string | null

  @column({ columnName: 'SCOREJSTO_0' })
  declare stockSoustraitR: string | null

  @column({ columnName: 'STOFCY_0' })
  declare siteStockage: string | null

  @column({ columnName: 'TRAAMT_0' })
  declare montantTransfere: string | null

  @column({ columnName: 'TRASTO_0' })
  declare stockTransfere: string | null

  @column({ columnName: 'TRFSTO_0' })
  declare stockTransit: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModif: string | null

  @column({ columnName: 'VCRLIN_0' })
  declare noLignePiece: string | null

  @column({ columnName: 'VCRNUM_0' })
  declare noPieceNoRecNoLivOuNoOf: string | null

  @column({ columnName: 'VCRTYP_0' })
  declare typePiece: string | null

  @column({ columnName: 'WAISTO_0' })
  declare sortiesEnAttente: string | null

  @column({ columnName: 'X4CMJ_0' })
  declare consommationMoyenneJournaliere: string | null

  @column({ columnName: 'X4CUM_0' })
  declare quantiteConsommee: string | null

  @column.date({ columnName: 'X4ENDCMJ_0' })
  declare finDePeriodeCmj: DateTime | null

  @column({ columnName: 'X4MAXSTOCMJ_0' })
  declare stockMaximum: string | null

  @column({ columnName: 'X4REOTSDCMJ_0' })
  declare seuilReappro: string | null

  @column({ columnName: 'X4SAFSTOCMJ_0' })
  declare stockSecurite: string | null

  @column({ columnName: 'X4STODISCMJ_0' })
  declare stockDisponible: string | null

  @column({ columnName: 'XAVCLABCST_0' })
  declare coutMaindoeuvre: string | null

  @column({ columnName: 'XAVCMACCST_0' })
  declare coutMachine: string | null

  @column({ columnName: 'XAVCMATCST_0' })
  declare coutMatiere: string | null

  @column({ columnName: 'XAVCOVELAB_0' })
  declare coutFraisGenerauxMaindoeuvre: string | null

  @column({ columnName: 'XAVCOVEMAC_0' })
  declare coutFraisGenerauxMachine: string | null

  @column({ columnName: 'XAVCOVEMAT_0' })
  declare coutFraisGenerauxMatiere: string | null

  @column({ columnName: 'XAVCOVESCO_0' })
  declare coutFraisGenerauxSoustraitance: string | null

  @column({ columnName: 'XAVCSCOCST_0' })
  declare coutSoustraitance: string | null

  @column({ columnName: 'XBAMLABCST_0' })
  declare coutMaindoeuvre1: string | null

  @column({ columnName: 'XBAMMACCST_0' })
  declare coutMachine1: string | null

  @column({ columnName: 'XBAMMATCST_0' })
  declare coutMatiere1: string | null

  @column({ columnName: 'XBAMOVELAB_0' })
  declare coutMaindoeuvre2: string | null

  @column({ columnName: 'XBAMOVEMAC_0' })
  declare coutMachine2: string | null

  @column({ columnName: 'XBAMOVEMAT_0' })
  declare coutMatiere2: string | null

  @column({ columnName: 'XBAMOVESCO_0' })
  declare coutSoustraitance1: string | null

  @column({ columnName: 'XBAMSCOCST_0' })
  declare coutSoustraitance2: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'article', localKey: 'article' })
  declare ficheArticle: BelongsTo<typeof ItemMaster>
}
