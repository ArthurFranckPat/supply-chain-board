import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'
import MfgHead from '#models/x3/mfghead'
import MfgItem from '#models/x3/mfgitm'
import MfgMat from '#models/x3/mfgmat'
import PurchaseOrder from '#models/x3/porder'
import SalesOrder from '#models/x3/sorder'

export default class Orders extends BaseModel {
  static table = 'ORDERS'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'ABBFIL_0' })
  declare abreviationFichier: string | null

  @column({ columnName: 'ALLQTY_0' })
  declare qteAllouee: string | null

  @column({ columnName: 'ATECORI_0' })
  declare origine: string | null

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BOMALT_0' })
  declare alternativeNomenclature: string | null

  @column({ columnName: 'BOMALTTYP_0' })
  declare typeAlternativeNomenclature: string | null

  @column({ columnName: 'BOMOFS_0' })
  declare delaiOperation: string | null

  @column({ columnName: 'BOMOPE_0' })
  declare numeroOperation: string | null

  @column({ columnName: 'BPRNUM_0' })
  declare numeroTiers: string | null

  @column({ columnName: 'CCMRID_0' })
  declare idDemande: string | null

  @column({ columnName: 'CCMSTA_0' })
  declare statutDemande: string | null

  @column({ columnName: 'CPLQTY_0' })
  declare qteRealiseeTot: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'ECCVALMAJ_0' })
  declare versionMajeure: string | null

  @column({ columnName: 'ECCVALMIN_0' })
  declare versionMineure: string | null

  @column.date({ columnName: 'ENDDAT_0' })
  declare dateFin: DateTime | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'EXTQTY_0' })
  declare qtePlanifiee: string | null

  @column({ columnName: 'FMI_0' })
  declare origineArticle: string | null

  @column({ columnName: 'GFSPUBTIM_0' })
  declare dateheureOptimise: string | null

  @column({ columnName: 'ITMREF_0' })
  declare article: string | null

  @column({ columnName: 'ITMREFORI_0' })
  declare articleOrigine: string | null

  @column.date({ columnName: 'MRPDAT_0' })
  declare dateMrp: DateTime | null

  @column({ columnName: 'MRPMES_0' })
  declare messageMrp: string | null

  @column({ columnName: 'MRPQTY_0' })
  declare qteCbn: string | null

  @column({ columnName: 'MTOQTY_0' })
  declare qteAffectee: string | null

  @column({ columnName: 'MTOREF_0' })
  declare reseauMto: string | null

  @column({ columnName: 'OPTFLG_0' })
  declare flagOptimisation: string | null

  @column({ columnName: 'ORI_0' })
  declare origine1: string | null

  @column({ columnName: 'ORIFCY_0' })
  declare siteOrigineemetteur: string | null

  @column({ columnName: 'PIO_0' })
  declare priorite: string | null

  @column({ columnName: 'PJT_0' })
  declare affaire: string | null

  @column({ columnName: 'RMNEXTQTY_0' })
  declare qteRestante: string | null

  @column({ columnName: 'SHTQTY_0' })
  declare quantiteEnRupture: string | null

  @column({ columnName: 'STOFCY_0' })
  declare siteStock: string | null

  @column.date({ columnName: 'STRDAT_0' })
  declare dateDebut: DateTime | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModification: string | null

  @column({ columnName: 'VCRLIN_0' })
  declare noLignePiece: string | null

  @column({ columnName: 'VCRLINORI_0' })
  declare noLignePieceOrigine: string | null

  @column({ columnName: 'VCRNUM_0' })
  declare daOrdreSst: string | null

  @column({ columnName: 'VCRNUMORI_0' })
  declare noPieceOrigineNoRecOuNoOf: string | null

  @column({ columnName: 'VCRSEQ_0' })
  declare noSequencePiece: string | null

  @column({ columnName: 'VCRSEQORI_0' })
  declare seqOrigine: string | null

  @column({ columnName: 'VCRTYP_0' })
  declare typePiece: string | null

  @column({ columnName: 'VCRTYPORI_0' })
  declare typePieceOrigine: string | null

  @column({ columnName: 'WIPNUM_0' })
  declare numeroOrdre: string | null

  @column({ columnName: 'WIPSTA_0' })
  declare statutEncours: string | null

  @column({ columnName: 'WIPTYP_0' })
  declare typeOrdre: string | null

  @column({ columnName: 'XQTEMANQ_0' })
  declare qteManquante: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'article', localKey: 'article' })
  declare ficheArticle: BelongsTo<typeof ItemMaster>

  // VCRNUM_0 est polymorphe : la pièce référencée dépend de VCRTYP_0
  // (10 = OF → MFGHEAD, 2 = commande vente → SORDER, 14 = commande achat → PORDER).
  // Les numérotations étant disjointes, chaque belongsTo ne matche que pour son type.
  @belongsTo(() => MfgHead, { foreignKey: 'daOrdreSst', localKey: 'numeroOrdreDeFabrication' })
  declare ordreFabrication: BelongsTo<typeof MfgHead>

  @belongsTo(() => SalesOrder, { foreignKey: 'daOrdreSst', localKey: 'noCommande' })
  declare commandeVente: BelongsTo<typeof SalesOrder>

  @belongsTo(() => PurchaseOrder, { foreignKey: 'daOrdreSst', localKey: 'noCommande' })
  declare commandeAchat: BelongsTo<typeof PurchaseOrder>

  // WIPTYP_0 = 5 → ligne article OF (VCRNUM → MFGNUM)
  @belongsTo(() => MfgItem, { foreignKey: 'daOrdreSst', localKey: 'numeroOrdreDeFabrication' })
  declare ligneFabricationArticle: BelongsTo<typeof MfgItem>

  // WIPTYP_0 = 6 → ligne matière OF (VCRNUM → MFGNUM)
  @belongsTo(() => MfgMat, { foreignKey: 'daOrdreSst', localKey: 'numeroOrdreDeFabrication' })
  declare ligneFabricationMatiere: BelongsTo<typeof MfgMat>
}
