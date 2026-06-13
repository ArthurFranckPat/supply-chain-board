import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import ItemMaster from '#models/x3/itmmaster'

export default class BomDetail extends BaseModel {
  static table = 'BOMD'
  static connection = 'x3'
  static primaryKey = 'identifiantUnique'

  @column({ columnName: 'AUUID_0' })
  declare identifiantUnique: string | null

  @column({ columnName: 'BOMALT_0' })
  declare alternativeNomenclature: string | null

  @column({ columnName: 'BOMALTTYP_0' })
  declare typeAlternativeNomenclature: string | null

  @column.date({ columnName: 'BOMENDDAT_0' })
  declare dateFinValidite: DateTime | null

  @column({ columnName: 'BOMENDLOT_0' })
  declare lotFinValidite: string | null

  @column({ columnName: 'BOMOFS_0' })
  declare delaiOperation: string | null

  @column({ columnName: 'BOMQTY_0' })
  declare quantiteLienUm: string | null

  @column({ columnName: 'BOMSEQ_0' })
  declare sequence: string | null

  @column({ columnName: 'BOMSEQNUM_0' })
  declare complementSequence: string | null

  @column({ columnName: 'BOMSHO_0' })
  declare designationLien: string | null

  @column.date({ columnName: 'BOMSTRDAT_0' })
  declare dateDebutValidite: DateTime | null

  @column({ columnName: 'BOMSTRLOT_0' })
  declare lotDebutValidite: string | null

  @column({ columnName: 'BOMSTUCOE_0' })
  declare coefficientUomus: string | null

  @column({ columnName: 'BOMTEXNUM_0' })
  declare texteLienNomenclature: string | null

  @column({ columnName: 'BOMUOM_0' })
  declare uom: string | null

  @column({ columnName: 'CPNITMREF_0' })
  declare articleComposant: string | null

  @column({ columnName: 'CPNOPE_0' })
  declare operationGamme: string | null

  @column({ columnName: 'CPNTYP_0' })
  declare typeComposant: string | null

  @column.date({ columnName: 'CREDAT_0' })
  declare dateCreation: DateTime | null

  @column({ columnName: 'CREDATTIM_0' })
  declare dateHeure: string | null

  @column({ columnName: 'CREUSR_0' })
  declare operateurCreation: string | null

  @column({ columnName: 'CSTFLG_0' })
  declare valorisation: string | null

  @column({ columnName: 'CTN_0' })
  declare container: string | null

  @column({ columnName: 'ECCRLEGRP_0' })
  declare groupeDeRevision: string | null

  @column({ columnName: 'ECCVALMAJ_0' })
  declare versionMajeure: string | null

  @column({ columnName: 'ECCVALMIN_0' })
  declare versionMineure: string | null

  @column({ columnName: 'EXPNUM_0' })
  declare numeroExport: string | null

  @column({ columnName: 'FORQTY_0' })
  declare formuleQte: string | null

  @column({ columnName: 'FORSEL_0' })
  declare formuleSelection: string | null

  @column({ columnName: 'INVPRN_0' })
  declare impressionFacture: string | null

  @column({ columnName: 'ITMREF_0' })
  declare articleParent: string | null

  @column({ columnName: 'ITMTOLNEG_0' })
  declare tolerancePesee: string | null

  @column({ columnName: 'ITMTOLPOS_0' })
  declare tolerancePesee1: string | null

  @column({ columnName: 'LEVSET_0' })
  declare niveauParametrage: string | null

  @column({ columnName: 'LIKQTY_0' })
  declare quantiteLien: string | null

  @column({ columnName: 'LIKQTYCOD_0' })
  declare codeQuantiteLien: string | null

  @column({ columnName: 'LIKRLE_0' })
  declare indiceRevisionLien: string | null

  @column({ columnName: 'NDEPRN_0' })
  declare impressionBonLivraison: string | null

  @column({ columnName: 'OCNPRN_0' })
  declare impressionAccuseReceptionClient: string | null

  @column({ columnName: 'OPENUMLEV_0' })
  declare suffixeOperationGammePmsim: string | null

  @column({ columnName: 'PICPRN_0' })
  declare impressionBonMatieres: string | null

  @column({ columnName: 'PKC_0' })
  declare codeAServir: string | null

  @column({ columnName: 'QTYRND_0' })
  declare arrondiQuantite: string | null

  @column({ columnName: 'SCA_0' })
  declare pourcentageDeRebut: string | null

  @column({ columnName: 'SCOFLG_0' })
  declare typeDapprovisionnement: string | null

  @column.date({ columnName: 'UPDDAT_0' })
  declare dateModification: DateTime | null

  @column({ columnName: 'UPDDATTIM_0' })
  declare dateHeure1: string | null

  @column({ columnName: 'UPDUSR_0' })
  declare operateurModif: string | null

  @column({ columnName: 'X1CNI_0' })
  declare contrainteObligatoire: string | null

  @column({ columnName: 'X1TOPREP_0' })
  declare aPreparer: string | null

  @column({ columnName: 'X4LIMEND_0' })
  declare pieceReellePieceDeSimulation: string | null

  @column({ columnName: 'X4LIMFLG_0' })
  declare versionActive: string | null

  @column({ columnName: 'X4LIMSTR_0' })
  declare versionSaisie: string | null

  @column({ columnName: 'X4LIMTYP_0' })
  declare versionArretee: string | null

  @column({ columnName: 'X4PKC_0' })
  declare codeAServir1: string | null

  @column({ columnName: 'XCOMBOMP_0' })
  declare commentaire: string | null

  @column({ columnName: 'XIFORMULE_0' })
  declare indicateurFormule: string | null

  @column({ columnName: 'XQSP_0' })
  declare qsp: string | null

  @column({ columnName: 'XVERSION_0' })
  declare version: string | null

  @belongsTo(() => ItemMaster, { foreignKey: 'articleParent', localKey: 'article' })
  declare ficheArticleParent: BelongsTo<typeof ItemMaster>

}
