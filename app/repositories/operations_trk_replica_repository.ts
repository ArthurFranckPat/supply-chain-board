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
 * Le rebut fait exception partielle : la VALEUR (`rejcplqty`) reste interne,
 * mais le fait qu'il y en ait est exposé en booléen — les pointages avec rebut
 * ne participent pas à la production réalisée, et cette règle d'exclusion
 * (#119) a besoin du signal.
 *
 * N'effectue AUCUNE vérification de fraîcheur elle-même : appelant responsable
 * de passer par `replicaGate.canRead('operations_trk_replica')` en amont.
 */

export interface OperationsTrkReplicaRow {
  numOf: string
  openum: number
  /** ISO YYYY-MM-DD (maille du graphe). */
  iptdat: string
  /** Poste réalisé — égalité stricte au filtre, jamais sommé. */
  cplwst: string
  cplqty: number
  /** Temps opératoire pointé, heures. */
  opetim: number
  /** Temps de réglage pointé, heures. */
  settim: number
  /** Le pointage déclare du rebut — exclu de la production réalisée (#119). */
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
   * Pointages sur `[fromIso, toIso)` — borne haute EXCLUSIVE, comme le codage
   * ISO du repo. `cplwst` optionnel : égalité stricte, aucun regroupement
   * d'autres codes sur celui-ci (règle d'identité du poste, #119).
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
      // La valeur du rebut reste interne : seul le fait qu'il y en ait sort.
      .select(...SELECTED_COLUMNS, this.conn.raw('rejcplqty > 0 AS rebut'))
    if (cplwst) q.where('cplwst', cplwst)
    const rows = (await q) as ReplicaRow[]
    return rows.map(toRow)
  }

  /**
   * Date (ISO) du dernier pointage du poste sur `[fromIso, toIso)`, null si
   * aucun. Sert l'identité du cockpit : le passé du poste commence là, et
   * « dernier pointage » répond à « l'atelier déclare-t-il encore ici ? ».
   */
  async getDernierPointageIso(
    cplwst: string,
    fromIso: string,
    toIso: string
  ): Promise<string | null> {
    const rows = (await this.conn
      .from('operations_trk_replica')
      .where('cplwst', cplwst)
      .where('iptdat', '>=', fromIso)
      .where('iptdat', '<', toIso)
      .max('iptdat as dernier')) as { dernier: string | null }[]
    return rows[0]?.dernier ?? null
  }

  /** Postes distincts ayant pointé sur `[fromIso, toIso)` — brut, sans filtre sur
   *  la forme du code : l'exclusion des codes alphabétiques est une règle domaine
   *  (`production_realisee`), pas un silence de requête. */
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
