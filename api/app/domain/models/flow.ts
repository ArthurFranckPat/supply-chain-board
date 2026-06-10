/**
 * Flow -- mouvement de stock sur un article.
 *
 * C'est le modèle central du système. Tout est un Flow:
 * - Stock disponible    → Flow { direction: 'supply', origin.type: 'stock' }
 * - Réception prévue    → Flow { direction: 'supply', origin.type: 'reception', date }
 * - Production d'un OF  → Flow { direction: 'supply', origin.type: 'of', date }
 * - Commande client     → Flow { direction: 'demand', origin.type: 'order', date }
 * - Besoin composant    → Flow { direction: 'demand', origin.type: 'component' }
 * - Allocation existante→ Flow { direction: 'supply', origin.type: 'allocation' }
 */

export type FlowDirection = 'supply' | 'demand'

export type FlowOrigin =
  | { type: 'stock' }
  | { type: 'reception'; id: string; supplier: string }
  | { type: 'of'; id: string; status: OfStatus }
  | { type: 'order'; id: string; customer: string; orderType: OrderType; nature: NeedNature }
  | { type: 'forecast'; id: string; orderType: OrderType }
  | { type: 'component'; parent: string; ofId: string }
  | { type: 'allocation'; docId: string }

export type OfStatus = 1 | 2 | 3 // Ferme, Planifie, Suggere
export type OrderType = 'MTS' | 'MTO' | 'NOR'
export type NeedNature = 'COMMANDE' | 'PREVISION'

export interface Flow {
  article: string
  quantity: number
  direction: FlowDirection
  date: Date | null // null = immediat (stock)
  origin: FlowOrigin
}

// -- Helpers --

export function isSupply(flow: Flow): flow is Flow & { direction: 'supply' } {
  return flow.direction === 'supply'
}

export function isDemand(flow: Flow): flow is Flow & { direction: 'demand' } {
  return flow.direction === 'demand'
}

export function hasDate(flow: Flow): flow is Flow & { date: Date } {
  return flow.date !== null
}

/** Somme nette des flows pour un article (supply positif, demand negatif). */
export function netQuantity(flows: Flow[], article: string, upToDate?: Date): number {
  return flows
    .filter((f) => f.article === article)
    .filter((f) => !upToDate || f.date === null || f.date <= upToDate)
    .reduce((sum, f) => sum + (f.direction === 'supply' ? f.quantity : -f.quantity), 0)
}

/** Trie les flows supply par date croissante (stock null = premier). */
export function sortByDate(flows: Flow[]): Flow[] {
  return [...flows].sort((a, b) => {
    if (a.date === null && b.date === null) return 0
    if (a.date === null) return -1
    if (b.date === null) return 1
    return a.date.getTime() - b.date.getTime()
  })
}
