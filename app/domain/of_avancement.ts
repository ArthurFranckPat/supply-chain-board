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
  /**
   * Qté déjà réalisée (CPLQTY) à l'opération la plus avancée pointée — proxy « pièces déjà
   * faites » pour déduire la charge restante (une pièce n'a franchi ce poste qu'une fois
   * traitée). 0 si non débuté.
   */
  qtyRealisee: number
  /**
   * Qté PRÉVUE à l'opération la plus avancée pointée (EXTQTY de cette op). Avec `qtyRealisee`,
   * dit si la gamme est intégralement pointée — le discriminant de l'OF fantôme ci-dessous.
   * 0 si non débuté.
   */
  qtyPrevueOp: number
}

/**
 * OF FANTÔME : gamme intégralement pointée en atelier, mais ORDERS annonce encore un reste
 * à produire. Signature d'un OF terminé (ou abandonné) jamais soldé administrativement — les
 * pièces annoncées n'existent pas et n'arriveront jamais.
 *
 * Cas de référence, relevés en PROD le 29/07/2026 sur `VAM813GM` :
 *  - `F126-44429` : op. 5 pointée 84/84, ORDERS reste 7, dernier pointage 07/04/2026 →
 *    FANTÔME. Soldé à la main le jour même : aucune entrée en stock, les 7 pièces
 *    n'existaient pas.
 *  - `F126-48957` : op. 5 pointée 28/46, ORDERS reste 18 (= 46 − 28) → cohérent, vivant.
 *  - `F126-49177` : rien de pointé, reste = qté lancée → pas démarré, surtout pas fantôme.
 *
 * Volontairement basé sur MFGOPE (déjà chargé) et pas sur la date du dernier pointage
 * (MFGOPETRK, requête X3 supplémentaire) : la date CORROBORE le diagnostic, elle ne le fonde
 * pas. Un OF pointé à 100 % et non soldé est fantôme, qu'il date d'avril ou d'hier.
 *
 * Conservateur par construction : sans opération intermédiaire pointée (gamme à une seule
 * opération, OF non démarré, suggestion non éclatée), on ne conclut jamais.
 */
export function estOfFantome(avancement: OfAvancement | undefined, qteRestante: number): boolean {
  if (!avancement || qteRestante <= 0) return false
  if (!avancement.estDebuté || avancement.qtyPrevueOp <= 0) return false
  return avancement.qtyRealisee >= avancement.qtyPrevueOp
}

/**
 * Reste RÉELLEMENT à produire sur un OF, pièces déjà pointées déduites.
 *
 * X3 nette `RMNEXTQTY` de façon INCOHÉRENTE d'un OF à l'autre — vérifié sur deux
 * OF réels au comportement opposé :
 *  - `F426-39752` : EXTQTY = RMNEXTQTY = 67 malgré 38 pointés → X3 ne nette qu'à
 *    la déclaration finale de stock. Sans déduction, la charge reste pleine sur
 *    du travail déjà fait.
 *  - `F426-39527` : EXTQTY = 480, RMNEXTQTY = 120, 360 pointés → X3 a déjà netté
 *    au fil des pointages. Déduire une 2e fois donnait 0 h de charge alors que
 *    120 pièces restent réellement à produire.
 *
 * Indistinguable depuis `RMNEXTQTY` seul : le discriminant est `EXTQTY`, que X3
 * ne nette jamais.
 *  - EXTQTY === RMNEXTQTY → rien netté → déduire les pièces faites est sûr ;
 *  - EXTQTY  >  RMNEXTQTY → déjà netté → RMNEXTQTY EST le reste, ne pas déduire.
 *
 * `launched` inconnu (producteurs de flow hors `of_repository`) → repli SANS
 * déduction : mieux vaut une charge légèrement surestimée qu'un 0 h silencieux
 * sur du travail réel.
 */
export function resteAProduire(
  quantity: number,
  launched: number | null | undefined,
  qtyRealisee: number
): number {
  const notYetNetted = launched != null && launched === quantity
  return Math.max(0, quantity - (notYetNetted ? qtyRealisee : 0))
}

/**
 * Calcule l'avancement de chaque OF à partir des enregistrements MFGOPE.
 *
 * @param records - Toutes les opérations de tous les OFs (fetch plat)
 * @returns Map<MFGNUM, OfAvancement>
 */
export function computeAvancement(records: OperationRecord[]): Map<string, OfAvancement> {
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
      (op) => derniereOpGamme !== null && op.openum < derniereOpGamme
    )

    const pointees = intermediaires.filter((op) => op.cplqty > 0)
    const derniereOpPointée =
      pointees.length > 0 ? Math.max(...pointees.map((o) => o.openum)) : null
    const opsAvancees =
      derniereOpPointée !== null ? pointees.filter((op) => op.openum === derniereOpPointée) : []
    const qtyRealisee = opsAvancees.reduce((sum, op) => sum + op.cplqty, 0)
    const qtyPrevueOp = opsAvancees.reduce((sum, op) => sum + op.extqty, 0)

    result.set(numOf, {
      numOf,
      estDebuté: pointees.length > 0,
      derniereOpPointée,
      derniereOpGamme,
      nbOperations: intermediaires.length,
      nbOperationsPointées: pointees.length,
      qtyRealisee,
      qtyPrevueOp,
    })
  }

  return result
}
