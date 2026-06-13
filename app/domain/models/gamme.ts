/**
 * Gamme -- route de fabrication (operations par poste de charge).
 */

export interface GammeOperation {
  article: string
  workstation: string
  workstationLabel: string
  rate: number // unites/heure
}

export interface Gamme {
  article: string
  operations: GammeOperation[]
}

// -- Helpers --

export function hoursForQuantity(op: Pick<GammeOperation, 'rate'>, qty: number): number {
  if (op.rate <= 0) return 0
  return qty / op.rate
}

export function totalHoursByWorkstation(gamme: Gamme, qty: number): Map<string, number> {
  const result = new Map<string, number>()
  for (const op of gamme.operations) {
    if (op.rate > 0) {
      const h = qty / op.rate
      result.set(op.workstation, (result.get(op.workstation) ?? 0) + h)
    }
  }
  return result
}
