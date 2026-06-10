import type { Flow, FlowOrigin } from './models/flow.js'
import type { Article } from './models/article.js'

// -- OF --

export function isFirm(status: number | undefined): boolean {
  return (status ?? 0) === 1
}

export function isPlannable(status: number | undefined): boolean {
  return [1, 2, 3].includes(status ?? 0)
}

// -- Article --

export function isPurchaseArticle(article: Pick<Article, 'supplyType'> | null): boolean {
  if (!article) return false
  return article.supplyType === 'ACHAT'
}

export function isSubcontracted(article: Pick<Article, 'category'>): boolean {
  return article.category.toUpperCase().startsWith('ST')
}

export function isComponentTreatedAsPurchase(
  article: Pick<Article, 'supplyType' | 'category'> | null,
  componentIsPurchased: boolean,
  componentIsManufactured: boolean,
): boolean {
  if (isPurchaseArticle(article)) return true
  if (componentIsPurchased) return true
  if (!componentIsManufactured) return false
  return article ? isSubcontracted(article) : false
}

// -- BesoinClient (via Flow origin) --

export function isOrder(origin: FlowOrigin): origin is Extract<FlowOrigin, { type: 'order' }> {
  return origin.type === 'order'
}

export function shouldIncludeForScheduler(flow: Flow): boolean {
  if (flow.direction !== 'demand') return false
  return flow.origin.type === 'order' || flow.origin.type === 'forecast'
}

/** Cle de priorite pour le tri des demandes. */
export function demandPriorityKey(flow: Flow): [number, number] {
  const isCommande = flow.origin.type === 'order' ? 0 : 1
  const date = flow.date ? flow.date.getTime() : Infinity
  return [isCommande, date]
}
