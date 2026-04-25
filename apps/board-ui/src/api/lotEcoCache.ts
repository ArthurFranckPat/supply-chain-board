import type { StockEvolutionResponse } from '@/types/stock-evolution'
import type { LotEcoArticle } from '@/types/lot-eco'

interface CacheEntry {
  stockData: StockEvolutionResponse
  lotEcoData: LotEcoArticle
  cachedAt: number
}

const TTL_MS = 5 * 60 * 1000 // 5 minutes

const _cache = new Map<string, CacheEntry>()

export const lotEcoCache = {
  getStock(article: string): StockEvolutionResponse | null {
    const entry = _cache.get(article)
    if (!entry) return null
    if (Date.now() - entry.cachedAt > TTL_MS) {
      _cache.delete(article)
      return null
    }
    return entry.stockData
  },

  setStock(article: string, stockData: StockEvolutionResponse, lotEcoData: LotEcoArticle): void {
    _cache.set(article, { stockData, lotEcoData, cachedAt: Date.now() })
  },

  getLotEco(article: string): LotEcoArticle | null {
    const entry = _cache.get(article)
    if (!entry) return null
    if (Date.now() - entry.cachedAt > TTL_MS) {
      _cache.delete(article)
      return null
    }
    return entry.lotEcoData
  },

  clear(): void {
    _cache.clear()
  },

  get size(): number {
    return _cache.size
  },
}
