/**
 * Stock virtuel pour allocation concurrente entre OF.
 *
 * Tracke les allocations sans modifier le stock réel. Utilisé par CommandeOFMatcher
 * et les helpers d'allocation. L'ancien moteur evaluateSequentialFeasibility a été
 * remplacé par le moteur de rupture unique (#73, étape 3) — cf. rupture-engine.ts.
 */


export interface FeasibilityOptions {
  mode?: 'immediate' | 'sequential'
  /** Allocations ERP par numéro d'OF : Map<numOf, Map<article, qteAllouee>> */
  allocations?: Map<string, Map<string, number>>
}

export interface OfInput {
  numOf: string
  article: string
  qteRestante: number
  dateDebut: string | null
  dateFin: string | null
  statutNum: number
}

export class StockState {
  private initialStock: Map<string, number>
  private allocatedStock: Map<string, number> = new Map()

  constructor(initialStock: Map<string, number> | Record<string, number>) {
    if (initialStock instanceof Map) {
      this.initialStock = new Map(initialStock)
    } else {
      this.initialStock = new Map(Object.entries(initialStock))
    }
  }

  getAvailable(article: string): number {
    return (this.initialStock.get(article) ?? 0) - (this.allocatedStock.get(article) ?? 0)
  }

  allocate(_ofNum: string, allocations: Map<string, number> | Record<string, number>): void {
    const entries = allocations instanceof Map ? allocations.entries() : Object.entries(allocations)
    for (const [article, quantity] of entries) {
      const current = this.allocatedStock.get(article) ?? 0
      this.allocatedStock.set(article, current + quantity)
    }
  }

  addSupply(article: string, quantity: number): void {
    const current = this.initialStock.get(article) ?? 0
    this.initialStock.set(article, current + quantity)
  }

  getInitialStock(article: string): number {
    return this.initialStock.get(article) ?? 0
  }

  getAllocated(article: string): number {
    return this.allocatedStock.get(article) ?? 0
  }
}
