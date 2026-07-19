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
