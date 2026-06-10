/**
 * Article -- fiche produit du catalogue ERP.
 */

export type SupplyType = 'ACHAT' | 'FABRICATION'

export interface Article {
  code: string
  description: string
  category: string
  supplyType: SupplyType
  reorderDelay: number
  productFamily: string | null
  pmp: number | null
  economicLot: number | null
  unitStock: string | null
  unitPurchase: string | null
  purchaseToStockRatio: number
  packagings: Packaging[]
}

export interface Packaging {
  quantity: number
  type: string
}

// -- Helpers --

export function isPurchase(article: Pick<Article, 'supplyType'>): boolean {
  return article.supplyType === 'ACHAT'
}

export function isFabrication(article: Pick<Article, 'supplyType'>): boolean {
  return article.supplyType === 'FABRICATION'
}

export function isPhantom(article: Pick<Article, 'category'>): boolean {
  return article.category.toUpperCase() === 'AFANT'
}

/** Arrondit au plus petit conditionnement (arrondi superieur). */
export function roundToPackaging(article: Pick<Article, 'packagings'>, qty: number): number {
  if (article.packagings.length === 0 || qty <= 0) return qty
  const smallest = article.packagings[0].quantity
  return Math.ceil(qty / smallest) * smallest
}
