import db from '@adonisjs/lucid/services/db'

/**
 * Lecture read-only d'`operations_trk_replica` (#119, lot 1).
 *
 * Miroir de `X3OperationsTrkRepository.getPointages(from, to)`, sur la fenêtre
 * ingérée (6 mois glissants, cf. `operationsTrkWindow`).
 *
 * ## Ce qui n'est PAS exposé
 *
 * Les colonnes ingérées hors périmètre v1 — `empnum` (matricule, donnée
 * nominative), `x4panflg`/`x4arretprod` (panne/arrêt, jamais alimentés),
 * `xequipe` (champ mort probable), `itmref` (documenté « Gamme », pas l'article
 * produit) — ne sont PAS sélectionnées ici. Les exposer un jour coûte une
 * colonne dans ce SELECT, pas une ré-ingestion.
 *
 * Le rebut : la VALEUR (`rejcplqty`) reste interne ; le booléen signal est
 * exposé pour traçabilité, mais n'exclut plus le pointage de la production
 * réalisée (revue #119 — compter `CPLQTY` + heures, ne rien afficher du rebut).
 *
 * N'effectue AUCUNE vérification de fraîcheur elle-même : appelant responsable
 * de passer par `replicaGate.canRead('operations_trk_replica')` en amont.
 */

export interface OperationsTrkReplicaRow {
  numOf: string
  openum: number
  /** ISO YYYY-MM-DD (maille du graphe). */
  iptdat: string
  /** Poste réalisé — code brut, jamais réécrit. */
  cplwst: string
  cplqty: number
  /** Temps opératoire pointé, heures. */
  opetim: number
  /** Temps de réglage pointé, heures. */
  settim: number
  /** Signal rebut — valeur non exposée ; n'exclut plus le pointage. */
  rebut: boolean
  /** Article produit (MFGITM), null si l'OF n'a pas de détail. */
  itmrefOf: string | null
}

type ReplicaRow = {
  num_of: string
  openum: number
  iptdat: string
  cplwst: string
  cplqty: number
  opetim: number
  settim: number
  rebut: number
  itmref_of: string | null
}

const SELECTED_COLUMNS = [
  'num_of',
  'openum',
  'iptdat',
  'cplwst',
  'cplqty',
  'opetim',
  'settim',
  'itmref_of',
] as const

function toRow(r: ReplicaRow): OperationsTrkReplicaRow {
  return {
    numOf: r.num_of,
    openum: r.openum,
    iptdat: r.iptdat,
    cplwst: r.cplwst,
    cplqty: r.cplqty,
    opetim: r.opetim,
    settim: r.settim,
    rebut: r.rebut === 1,
    itmrefOf: r.itmref_of,
  }
}

export class OperationsTrkReplicaRepository {
  private get conn() {
    return db.connection('replica')
  }

  /**
   * Pointages sur `[fromIso, toIso)` — borne haute EXCLUSIVE.
   * `cplwst` optionnel : ÉGALITÉ STRICTE. Aucun regroupement, aucun repli d'un
   * autre code — `PP_093` ne ramène jamais les pointages de `PP_093S` (#119).
   */
  async getPointages(
    fromIso: string,
    toIso: string,
    cplwst?: string
  ): Promise<OperationsTrkReplicaRow[]> {
    const q = this.conn
      .from('operations_trk_replica')
      .where('iptdat', '>=', fromIso)
      .where('iptdat', '<', toIso)
      .select(...SELECTED_COLUMNS, this.conn.raw('rejcplqty > 0 AS rebut'))
    if (cplwst) q.where('cplwst', cplwst.trim())
    const rows = (await q) as ReplicaRow[]
    return rows.map(toRow)
  }

  /**
   * Date (ISO) du dernier pointage du poste sur `[fromIso, toIso)`, null si
   * aucun. Égalité stricte — même convention que `getPointages`.
   */
  async getDernierPointageIso(
    cplwst: string,
    fromIso: string,
    toIso: string
  ): Promise<string | null> {
    const rows = (await this.conn
      .from('operations_trk_replica')
      .where('cplwst', cplwst.trim())
      .where('iptdat', '>=', fromIso)
      .where('iptdat', '<', toIso)
      .max('iptdat as dernier')) as { dernier: string | null }[]
    return rows[0]?.dernier ?? null
  }

  /** Postes distincts ayant pointé sur `[fromIso, toIso)` — codes bruts.
   *  L'exclusion des codes non numériques est une règle domaine
   *  (`estPosteProduction`), pas un silence de requête. */
  async getDistinctWorkstations(fromIso: string, toIso: string): Promise<string[]> {
    const rows = await this.conn
      .from('operations_trk_replica')
      .where('iptdat', '>=', fromIso)
      .where('iptdat', '<', toIso)
      .distinct('cplwst')
      .select('cplwst')
    return (rows as { cplwst: string }[]).map((r) => r.cplwst)
  }
}

const operationsTrkReplicaRepository = new OperationsTrkReplicaRepository()
export default operationsTrkReplicaRepository
