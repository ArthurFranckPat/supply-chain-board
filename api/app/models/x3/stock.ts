import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'

export default class Stock extends BaseModel {
  static table = 'STOCK'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BPSLOT_0' })
  declare lotFournisseur: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'CTRNUM_0' })
  declare identifiant2: string | null

  @column({ columnName: 'CUMALLQTA_0' })
  declare cumulQuantiteActiveAlloueeUs: string | null

  @column({ columnName: 'CUMALLQTY_0' })
  declare cumulQuantiteAlloueeEnUs: string | null

  @column({ columnName: 'CUMWIPQTA_0' })
  declare qteActiveEnTrait: string | null

  @column({ columnName: 'CUMWIPQTY_0' })
  declare qteEnTraitement: string | null

  @column({ columnName: 'CUNLISNUM_0' })
  declare listeInventaire: string | null

  @column({ columnName: 'CUNLOKFLG_0' })
  declare inventaireEnCours: string | null

  @column({ columnName: 'ECCVALMAJ_0' })
  declare versionMajeure: string | null

  @column({ columnName: 'EDTFLG_0' })
  declare flagEdition: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'ITMREF_0' })
  declare article: string | null

  @column.date({ columnName: 'LASCUNDAT_0' })
  declare dateDernierInventaire: DateTime | null

  @column.date({ columnName: 'LASISSDAT_0' })
  declare dateDerniereSortie: DateTime | null

  @column.date({ columnName: 'LASRCPDAT_0' })
  declare dateDerniereEntree: DateTime | null

  @column({ columnName: 'LOC_0' })
  declare emplacement: string | null

  @column({ columnName: 'LOCCAT_0' })
  declare categorieEmplacement: string | null

  @column({ columnName: 'LOCTYP_0' })
  declare typeEmplacement: string | null

  @column({ columnName: 'LOT_0' })
  declare lot: string | null

  @column({ columnName: 'LPNNUM_0' })
  declare numeroContenant: string | null

  @column({ columnName: 'OWNER_0' })
  declare proprietaire: string | null

  @column({ columnName: 'PALNUM_0' })
  declare identifiant1: string | null

  @column({ columnName: 'PCU_0' })
  declare uniteConditionnement: string | null

  @column({ columnName: 'PCUORI_0' })
  declare conditOrigine: string | null

  @column({ columnName: 'PCUSTUCOE_0' })
  declare coefficientUcus: string | null

  @column({ columnName: 'PJT_0' })
  declare affaire: string | null

  @column({ columnName: 'QLYCTLDEM_0' })
  declare demandeAnalyseQualite: string | null

  @column({ columnName: 'QTYPCU_0' })
  declare quantiteUc: string | null

  @column({ columnName: 'QTYPCUORI_0' })
  declare quantiteUcOrigine: string | null

  @column({ columnName: 'QTYSTU_0' })
  declare quantiteUs: string | null

  @column({ columnName: 'QTYSTUACT_0' })
  declare quantiteActiveUs: string | null

  @column({ columnName: 'QTYSTUORI_0' })
  declare quantiteUsOrigine: string | null

  @column.date({ columnName: 'RCPDAT_0' })
  declare dateEntreeSerie: DateTime | null

  @column({ columnName: 'SERNUM_0' })
  declare serie: string | null

  @column({ columnName: 'SLO_0' })
  declare slot: string | null

  @column({ columnName: 'STA_0' })
  declare statut: string | null

  @column({ columnName: 'STOCOU_0' })
  declare chronoStock: string | null

  @column({ columnName: 'STOFCY_0' })
  declare siteStock: string | null

  @column({ columnName: 'STOFLD1_0' })
  declare champPersonnalise1: string | null

  @column({ columnName: 'STOFLD2_0' })
  declare champPersonnalise2: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModif: string | null

  @column({ columnName: 'WRH_0' })
  declare depot: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'article', localKey: 'article' })
  declare ficheArticle: BelongsTo<typeof ItemMaster>
}
