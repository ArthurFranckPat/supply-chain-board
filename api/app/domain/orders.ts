import type { Flow, FlowOrigin } from './models/flow.js'
import { isPurchaseArticle } from './rules.js'
import { allocateFromSupply } from './availability.js'
import type { Article } from './models/article.js'

export type MatchMethod =
  | 'mts_hard_pegging'
  | 'stock_complete'
  | 'nor_mto_cumulative'
  | 'purchase_supply'
  | 'none'

export interface OrderMatchResult {
  demandFlow: Flow
  method: MatchMethod
  coveredByStock: number
  coveredByOf: Array<{ ofId: string; quantity: number }>
  uncovered: number
  alerts: string[]
}

function matchMts(
  demand: Flow,
  supplyFlows: Flow[],
): OrderMatchResult {
  const linkedOfs = supplyFlows.filter(
    (f) =>
      f.direction === 'supply' &&
      f.origin.type === 'of' &&
      f.article === demand.article &&
      f.quantity > 0,
  )

  if (linkedOfs.length === 0) {
    return {
      demandFlow: demand,
      method: 'mts_hard_pegging',
      coveredByStock: 0,
      coveredByOf: [],
      uncovered: demand.quantity,
      alerts: [`MTS: aucun OF lie pour ${demand.article}`],
    }
  }

  const sorted = [...linkedOfs].sort((a, b) => {
    const prio = (o: FlowOrigin) => (o.type === 'of' ? (o as any).status ?? 3 : 3)
    return prio(a.origin) - prio(b.origin)
  })

  const selected = sorted[0]
  const allocated = Math.min(demand.quantity, selected.quantity)
  const uncovered = demand.quantity - allocated

  return {
    demandFlow: demand,
    method: 'mts_hard_pegging',
    coveredByStock: 0,
    coveredByOf: [{ ofId: (selected.origin as any).id, quantity: allocated }],
    uncovered,
    alerts: uncovered > 0 ? [`MTS: couverture partielle (${allocated}/${demand.quantity})`] : [],
  }
}

function matchNorMto(
  demand: Flow,
  supplyFlows: Flow[],
  article: Article | undefined,
): OrderMatchResult {
  const targetDate = demand.date ?? new Date()

  const stockAlloc = allocateFromSupply(supplyFlows, demand.article, demand.quantity, targetDate)

  if (stockAlloc.remaining === 0) {
    return {
      demandFlow: demand,
      method: 'stock_complete',
      coveredByStock: stockAlloc.allocated,
      coveredByOf: [],
      uncovered: 0,
      alerts: [],
    }
  }

  if (article && isPurchaseArticle(article)) {
    return {
      demandFlow: demand,
      method: 'purchase_supply',
      coveredByStock: stockAlloc.allocated,
      coveredByOf: [],
      uncovered: stockAlloc.remaining,
      alerts: [`Article achat: ${stockAlloc.allocated} stock, ${stockAlloc.remaining} manquant`],
    }
  }

  const remaining = stockAlloc.remaining
  const ofCandidates = supplyFlows
    .filter(
      (f) =>
        f.direction === 'supply' &&
        f.origin.type === 'of' &&
        f.article === demand.article &&
        f.quantity > 0,
    )
    .sort((a, b) => {
      const prio = (o: FlowOrigin) => (o.type === 'of' ? (o as any).status ?? 3 : 3)
      return prio(a.origin) - prio(b.origin)
    })

  let stillNeeded = remaining
  const ofCovers: OrderMatchResult['coveredByOf'] = []

  for (const ofFlow of ofCandidates) {
    if (stillNeeded <= 0) break
    const taken = Math.min(stillNeeded, ofFlow.quantity)
    ofCovers.push({ ofId: (ofFlow.origin as any).id, quantity: taken })
    stillNeeded -= taken
  }

  if (ofCovers.length === 0) {
    return {
      demandFlow: demand,
      method: 'none',
      coveredByStock: stockAlloc.allocated,
      coveredByOf: [],
      uncovered: remaining,
      alerts: [`Aucun OF pour ${demand.article}, ${remaining} non couvert`],
    }
  }

  return {
    demandFlow: demand,
    method: 'nor_mto_cumulative',
    coveredByStock: stockAlloc.allocated,
    coveredByOf: ofCovers,
    uncovered: stillNeeded,
    alerts: stillNeeded > 0 ? [`Couverture partielle OF: ${remaining - stillNeeded}/${remaining}`] : [],
  }
}

export function matchOrder(
  demand: Flow,
  supplyFlows: Flow[],
  articles: Map<string, Article>,
): OrderMatchResult {
  const { origin } = demand
  const article = articles.get(demand.article)

  if (origin.type === 'order' && origin.orderType === 'MTS') {
    return matchMts(demand, supplyFlows)
  }
  return matchNorMto(demand, supplyFlows, article)
}

export function matchOrders(
  demands: Flow[],
  supplyFlows: Flow[],
  articles: Map<string, Article>,
): OrderMatchResult[] {
  const sorted = [...demands].sort((a, b) => {
    const pa = a.origin.type === 'order' ? 0 : 1
    const pb = b.origin.type === 'order' ? 0 : 1
    if (pa !== pb) return pa - pb
    const da = a.date?.getTime() ?? Infinity
    const db = b.date?.getTime() ?? Infinity
    return da - db
  })

  const mutableSupply = supplyFlows.map((f) => ({ ...f, quantity: f.quantity }))

  return sorted.map((demand) => {
    const result = matchOrder(demand, mutableSupply, articles)

    for (const ofCover of result.coveredByOf) {
      const flow = mutableSupply.find(
        (f) => f.direction === 'supply' && f.origin.type === 'of' && (f.origin as any).id === ofCover.ofId,
      )
      if (flow) flow.quantity -= ofCover.quantity
    }

    if (result.coveredByStock > 0) {
      let toConsume = result.coveredByStock
      for (const f of mutableSupply) {
        if (toConsume <= 0) break
        if (f.direction === 'supply' && f.article === demand.article && f.date === null && f.quantity > 0) {
          const taken = Math.min(toConsume, f.quantity)
          f.quantity -= taken
          toConsume -= taken
        }
      }
    }

    return result
  })
}
