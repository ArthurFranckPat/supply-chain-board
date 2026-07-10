/**
 * Logique métier : avancement d'un OF via les pointages d'opérations (issue #41).
 *
 * La dernière opération d'une gamme = déclaration d'entrée en stock (MFGHEAD.CPLQTY_0).
 * Elle ne reflète pas l'avancement réel et peut passer de 0 à la qté totale d'un coup
 * (ex. palette 720 pcs déclarée en bloc). On l'exclut donc du calcul d'avancement.
 *
 * Les opérations intermédiaires (pointages opérateur) sont le vrai signal de production.
 */
import type { OperationRecord } from '#repositories/operation_repository'

export interface OfAvancement {
  /** N° OF. */
  numOf: string
  /** Vrai si au moins une opération intermédiaire a une qté déclarée > 0. */
  estDebuté: boolean
  /**
   * Position dans la gamme : OPENUM le plus élevé parmi les opérations intermédiaires
   * ayant un pointage > 0. null si non débuté ou seule la dernière op a un pointage.
   */
  derniereOpPointée: number | null
  /** N° de la dernière opération de la gamme (= opération de déclaration stock). */
  derniereOpGamme: number | null
  /** Nb total d'opérations intermédiaires (hors dernière). */
  nbOperations: number
  /** Nb d'opérations intermédiaires avec pointage > 0. */
  nbOperationsPointées: number
}

/**
 * Calcule l'avancement de chaque OF à partir des enregistrements MFGOPE.
 *
 * @param records - Toutes les opérations de tous les OFs (fetch plat)
 * @returns Map<MFGNUM, OfAvancement>
 */
export function computeAvancement(
  records: OperationRecord[],
): Map<string, OfAvancement> {
  // Grouper par OF
  const byOf = new Map<string, OperationRecord[]>()
  for (const rec of records) {
    if (!rec.mfgnum) continue
    const arr = byOf.get(rec.mfgnum) ?? []
    arr.push(rec)
    byOf.set(rec.mfgnum, arr)
  }

  const result = new Map<string, OfAvancement>()
  for (const [numOf, ops] of byOf) {
    if (ops.length === 0) continue

    // Trier par OPENUM croissant
    const sorted = [...ops].sort((a, b) => a.openum - b.openum)
    const derniereOpGamme = sorted[sorted.length - 1]?.openum ?? null

    // Opérations intermédiaires = tout sauf la dernière (par OPENUM)
    const intermediaires = sorted.filter(
      (op) => derniereOpGamme !== null && op.openum < derniereOpGamme,
    )

    const pointees = intermediaires.filter((op) => op.cplqty > 0)
    const derniereOpPointée =
      pointees.length > 0 ? Math.max(...pointees.map((o) => o.openum)) : null

    result.set(numOf, {
      numOf,
      estDebuté: pointees.length > 0,
      derniereOpPointée,
      derniereOpGamme,
      nbOperations: intermediaires.length,
      nbOperationsPointées: pointees.length,
    })
  }

  return result
}
