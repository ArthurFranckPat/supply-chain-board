/**
 * Types CTP côté frontend — sérialisation JSON (dates = string ISO).
 * Miroir de app/domain/promise-engine.ts après JSON.stringify.
 */

export type PromesseReason =
  | { kind: 'stock' }
  | { kind: 'reception'; poId: string; date: string }
  | { kind: 'of'; ofId: string; date: string }
  | { kind: 'appro'; leadTime: number; observed?: number }
  | { kind: 'fabrication'; leadTime: number }
  | { kind: 'infeasible'; detail: string }

export interface PromesseNode {
  article: string
  quantity: number
  availableDate: string
  reason: PromesseReason
  leadTimeUsed: number
  children: PromesseNode[]
  onCriticalPath: boolean
}

/** Formulation courte d'une raison CTP (facteur limitant, maillons du chemin). */
export function promiseReasonText(r: PromesseReason): string {
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

export interface PromesseResult {
  article: string
  quantity: number
  promiseDate: string
  mode: 'optimiste' | 'engageante'
  criticalPath: PromesseNode[]
  limitingFactor: {
    article: string
    reason: PromesseReason
    date: string
    leadTime: number
  }
  tree: PromesseNode
  truncated: boolean
  infeasible: boolean
}
