/**
 * Types CTP côté frontend — sérialisation JSON (dates = string ISO).
 * Miroir de app/domain/promise-engine.ts après JSON.stringify.
 */

export type PromiseReason =
  | { kind: 'stock' }
  | { kind: 'reception'; poId: string; date: string }
  | { kind: 'of'; ofId: string; date: string }
  | { kind: 'appro'; leadTime: number; observed?: number }
  | { kind: 'fabrication'; leadTime: number }
  | { kind: 'infeasible'; detail: string }

export interface PromiseNode {
  article: string
  quantity: number
  availableDate: string
  reason: PromiseReason
  leadTimeUsed: number
  children: PromiseNode[]
  onCriticalPath: boolean
}

/** Formulation courte d'une raison CTP (facteur limitant, maillons du chemin). */
export function promiseReasonText(r: PromiseReason): string {
  switch (r.kind) {
    case 'stock':
      return 'stock disponible'
    case 'reception':
      return `réception ${r.poId}`
    case 'of':
      return `OF ${r.ofId}`
    case 'appro':
      return r.observed ? `appro ${r.leadTime}j (+${r.observed}j retard)` : `appro ${r.leadTime}j`
    case 'fabrication':
      return r.leadTime > 0 ? `fabrication ${r.leadTime}j` : 'fantôme (assemblage logique)'
    case 'infeasible':
      return r.detail
  }
}

export interface PromiseResult {
  article: string
  quantity: number
  promiseDate: string
  mode: 'optimiste' | 'engageante'
  criticalPath: PromiseNode[]
  limitingFactor: {
    article: string
    reason: PromiseReason
    date: string
    leadTime: number
  }
  tree: PromiseNode
  truncated: boolean
  infeasible: boolean
}
