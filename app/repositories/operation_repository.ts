/**
 * Repository MFGOPE — pointages d'opérations (issue #41, problème 3).
 *
 * Source du proxy d'avancement : les opérations d'une gamme OF ont un `CPLQTY_0`
 * (qté déclarée réalisée) distinct de l'entrée en stock MFGHEAD.CPLQTY_0. Un
 * pointage intermédiaire (> 0 sur une opération hors la dernière) prouve que
 * l'OF est réellement en cours atelier, même si aucune entrée stock n'a encore
 * été déclarée (cas palette 720 pcs déclarée en bloc à la fin).
 *
 * Migré vers le modèle Lucid MfgOpe (pool partagé `x3`, max:4) au lieu d'un pool
 * éphémère `new X3Database()` max:1 + destroy(). Le pattern éphémère était la
 * cause racine de l'erreur « Acquire connection error: aborted » : destroy() sur
 * un pool max:1 aborte toute acquisition encore en attente (tarn). Le pool Lucid
 * partagé gère lui-même le cycle de vie des connexions — jamais de destroy()
 * manuel. Aligné sur mfgmat_repository.ts (même table, même pool, jamais crashé).
 */
import MfgOpe from '#models/x3/mfgope'

export interface OperationRecord {
  /** N° OF (MFGNUM_0). */
  mfgnum: string
  /** N° opération dans la gamme (OPENUM_0). */
  openum: number
  /** Qté déclarée réalisée sur cette opération (CPLQTY_0). */
  cplqty: number
  /** Statut de l'opération (OPESTA_0) — 'A' = actif, 'C' = clôturé, etc. */
  opesta: string
  /** Quantité prévue sur l'opération (EXTQTY_0). */
  extqty: number
}

export class X3OperationRepository {
  /**
   * Récupère les opérations de pointage pour un ensemble d'OFs.
   * Retourne une ligne par opération (plusieurs lignes par OF).
   * Chunké à 1000 pour rester sous la limite IN d'Oracle (cf. mfgmat_repository).
   * Chunks séquentiels : Lucid .whereIn() gère la connexion via le pool partagé,
   * mais on évite de fan-out Promise.all pour ne pas saturer le pool (max:4).
   */
  async getOperations(numOfs: string[]): Promise<OperationRecord[]> {
    const unique = [...new Set(numOfs.filter((n) => n && n.trim()))]
    if (unique.length === 0) return []

    const CHUNK = 1000
    const chunks: string[][] = []
    for (let i = 0; i < unique.length; i += CHUNK) {
      chunks.push(unique.slice(i, i + CHUNK))
    }

    const rows: OperationRecord[] = []
    for (const chunk of chunks) {
      const models = await MfgOpe.query()
        .select('MFGNUM_0', 'OPENUM_0', 'CPLQTY_0', 'OPESTA_0', 'EXTQTY_0')
        .whereIn('MFGNUM_0', chunk)
      for (const row of models) {
        rows.push({
          mfgnum: (row.numeroOrdreDeFabrication ?? '').trim(),
          openum: parseFloat(row.numeroOperation ?? '0') || 0,
          cplqty: parseFloat(row.quantiteRealiseeTotale ?? '0') || 0,
          opesta: (row.statutOperation ?? '').trim(),
          extqty: parseFloat(row.quantitePrevue ?? '0') || 0,
        })
      }
    }
    return rows
  }
}
