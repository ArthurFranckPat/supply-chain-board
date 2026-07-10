/**
 * Repository MFGOPE — pointages d'opérations (issue #41, problème 3).
 *
 * Source du proxy d'avancement : les opérations d'une gamme OF ont un `CPLQTY_0`
 * (qté déclarée réalisée) distinct de l'entrée en stock MFGHEAD.CPLQTY_0. Un
 * pointage intermédiaire (> 0 sur une opération hors la dernière) prouve que
 * l'OF est réellement en cours atelier, même si aucune entrée stock n'a encore
 * été déclarée (cas palette 720 pcs déclarée en bloc à la fin).
 */
import { X3Database } from '#app/x3/client/x3_database'

type RawRow = Record<string, string | null>

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

const SQL = `
SELECT
  MFGNUM_0 AS MFGNUM,
  OPENUM_0 AS OPENUM,
  NVL(CPLQTY_0, 0) AS CPLQTY,
  NVL(OPESTA_0, ' ') AS OPESTA,
  NVL(EXTQTY_0, 0) AS EXTQTY
FROM MFGOPE
WHERE MFGNUM_0 IN ({ofs})
`

/** Allowlist pour les n° d'OF (alphanumérique + _ + -). */
const OF_PATTERN = /^[A-Za-z0-9_-]+$/

export class X3OperationRepository {
  /**
   * Récupère les opérations de pointage pour un ensemble d'OFs.
   * Retourne une ligne par opération (plusieurs lignes par OF).
   * Chunké à 1000 pour rester sous la limite IN d'Oracle (cf. mfgmat_repository).
   */
  async getOperations(numOfs: string[]): Promise<OperationRecord[]> {
    // Déduplication + filtrage (allowlist, pas d'échappement ad hoc)
    const unique = [...new Set(numOfs.filter((n) => n && OF_PATTERN.test(n)))]
    if (unique.length === 0) return []

    const CHUNK = 1000
    const chunks: string[][] = []
    for (let i = 0; i < unique.length; i += CHUNK) {
      chunks.push(unique.slice(i, i + CHUNK))
    }

    const db = new X3Database()
    try {
      // Chunks SÉQUENTIELS (et non Promise.all). Le pool X3 est `max: 1` (une
      // seule connexion) → les chunks parallèles ne gagnaient rien (ils se
      // sérialisaient sur l'unique connexion) et introduisaient une condition de
      // course fatale : si un chunk échouait, Promise.all rejetait immédiatement,
      // le `finally` appelait destroy() pendant que les autres chunks tenaient
      // encore la connexion → « Acquire connection error: aborted ». Aligné sur
      // order_line_repository.ts (boucle for/await, même pool max:1).
      const rows: OperationRecord[] = []
      for (const chunk of chunks) {
        const ofsList = chunk.map((n) => `'${n}'`).join(',')
        const sql = SQL.replace('{ofs}', ofsList)
        const chunkRows = (await db.raw(sql)) as RawRow[]
        for (const row of chunkRows) {
          rows.push({
            mfgnum: (row.MFGNUM ?? '').trim(),
            openum: parseFloat(row.OPENUM ?? '0') || 0,
            cplqty: parseFloat(row.CPLQTY ?? '0') || 0,
            opesta: (row.OPESTA ?? '').trim(),
            extqty: parseFloat(row.EXTQTY ?? '0') || 0,
          })
        }
      }
      return rows
    } finally {
      await db.destroy()
    }
  }
}
