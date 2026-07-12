/**
 * Allocation helpers -- virtual reservation and shortage computation
 * with awareness of existing ERP allocations.
 *
 * Ported from Python scheduling/material.py and feasibility/recursive.py.
 */

import type { Nomenclature } from './models/nomenclature.js'
import { requiredQuantity } from './models/nomenclature.js'
import type { StockState } from './stock-state.js'

export interface CandidateOF {
  numOf: string
  article: string
  quantity: number
}

export interface ErpAllocation {
  article: string
  qteAllouee: number
}

export interface AllocationLoader {
  getNomenclature(article: string): Nomenclature | undefined
  getAllocationsOf(numDoc: string): ErpAllocation[]
}

function erpAllocationMap(allocations: ErpAllocation[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const alloc of allocations) {
    map.set(alloc.article, (map.get(alloc.article) ?? 0) + alloc.qteAllouee)
  }
  return map
}

/**
 * Virtual-reserve components for a candidate OF.
 *
 * Skips components already allocated in ERP. Only reserves components that are
 * "scarce" (available virtual stock < requirement).
 */
export function reserveCandidateComponents(
  loader: AllocationLoader,
  candidate: CandidateOF,
  materialState: StockState
): void {
  const bom = loader.getNomenclature(candidate.article)
  if (!bom) return

  const erpAlloc = erpAllocationMap(loader.getAllocationsOf(candidate.numOf))

  for (const entry of bom.components) {
    if (entry.componentType !== 'ACHETE') continue

    const alreadyAllocated = erpAlloc.get(entry.componentArticle) ?? 0
    if (alreadyAllocated > 0) continue

    const besoin = requiredQuantity(entry, candidate.quantity)
    const available = materialState.getAvailable(entry.componentArticle)
    if (available < besoin) {
      materialState.allocate(candidate.numOf, { [entry.componentArticle]: besoin })
    }
  }
}

/**
 * Compute a human-readable shortage message for direct purchased components.
 *
 * Deducts ERP allocations from the requirement before comparing to virtual stock.
 */
export function computeDirectComponentShortages(
  loader: AllocationLoader,
  candidate: CandidateOF,
  materialState: StockState
): string {
  const bom = loader.getNomenclature(candidate.article)
  if (!bom) return ''

  const erpAlloc = erpAllocationMap(loader.getAllocationsOf(candidate.numOf))
  const shortages: string[] = []

  for (const entry of bom.components) {
    if (entry.componentType !== 'ACHETE') continue

    const besoin = requiredQuantity(entry, candidate.quantity)
    const alreadyAllocated = erpAlloc.get(entry.componentArticle) ?? 0
    const available = materialState.getAvailable(entry.componentArticle)
    const netNeed = besoin - alreadyAllocated
    if (netNeed > available) {
      shortages.push(`${entry.componentArticle}:${netNeed - available}`)
    }
  }

  return shortages.join(', ')
}

/**
 * Availability status for scheduling.
 *
 * Firm OFs (status 1) are never blocked: they are already in production.
 * Suggested OFs are blocked if they have direct component shortages.
 */
export function availabilityStatus(
  candidate: Pick<CandidateOF, 'numOf' | 'article' | 'quantity'>,
  statutNum: number,
  loader: AllocationLoader,
  materialState: StockState
): { status: 'comfortable' | 'blocked'; reason: string } {
  if (statutNum === 1) {
    return { status: 'comfortable', reason: '' }
  }

  const reason = computeDirectComponentShortages(
    loader,
    { ...candidate, quantity: candidate.quantity },
    materialState
  )
  return { status: reason ? 'blocked' : 'comfortable', reason }
}
