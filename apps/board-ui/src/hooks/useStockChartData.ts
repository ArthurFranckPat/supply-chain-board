import { useMemo } from 'react'
import type { StockEvolutionResponse } from '@/types/stock-evolution'
import type { LotEcoArticle } from '@/types/lot-eco'
import { fmtDate, addDays } from '@/lib/format'

export interface ChartEntry {
  date: string
  dateRaw: string
  stock: number | null
  qtystu: number
  count: number
  forecastStock: number | null
  forecastReplenishment: number | null
  isReplenishment: boolean
  isFuture: boolean
  lotEcoLine: number | null
  lotOptimalLine: number | null
}

export interface StockChartData {
  entries: ChartEntry[]
  forecastEntries: ChartEntry[]
  allEntries: ChartEntry[]
  lastHistoryDate: string | null
  hasForecast: boolean
}

const FORECAST_WEEKS = 26
const DAYS_PER_STEP = 7
const TRIGGER_PCT = 0.3

export function useStockChartData(data: StockEvolutionResponse, lotEco: LotEcoArticle): StockChartData {
  // Historical entries aggregated by day
  const { entries, lastHistoryDate } = useMemo(() => {
    const dayMap = new Map<string, ChartEntry>()

    for (const m of data.items) {
      const day = m.iptdat.slice(0, 10)
      const existing = dayMap.get(day)
      if (existing) {
        existing.stock = m.stock_apres
        existing.qtystu += m.qtystu
        existing.count += 1
      } else {
        dayMap.set(day, {
          date: fmtDate(day),
          dateRaw: day,
          stock: m.stock_apres,
          qtystu: m.qtystu,
          count: 1,
          forecastStock: null,
          forecastReplenishment: null,
          isReplenishment: false,
          isFuture: false,
          lotEcoLine: lotEco.lot_eco,
          lotOptimalLine: lotEco.lot_optimal,
        })
      }
    }

    return {
      entries: Array.from(dayMap.values()),
      lastHistoryDate: data.items.length > 0
        ? data.items[data.items.length - 1]!.iptdat.slice(0, 10)
        : null,
    }
  }, [data.items, lotEco])

  // Forecast projection
  const forecastEntries = useMemo(() => {
    if (!lastHistoryDate || lotEco.demande_hebdo <= 0) return []

    const recvd = [...entries].sort((a, b) => a.dateRaw.localeCompare(b.dateRaw))
    const lastEntry = recvd[recvd.length - 1]
    if (!lastEntry) return []

    let currentStock = lastEntry.stock ?? 0
    const forecasts: ChartEntry[] = []
    let cursor = lastHistoryDate
    const triggerThreshold = lotEco.lot_eco * TRIGGER_PCT

    for (let week = 1; week <= FORECAST_WEEKS; week++) {
      cursor = addDays(cursor, DAYS_PER_STEP)
      currentStock -= lotEco.demande_hebdo

      if (currentStock <= triggerThreshold) {
        const deliveryDate = addDays(cursor, lotEco.delai_reappro_jours)
        const qty = lotEco.lot_optimal

        forecasts.push({
          date: fmtDate(cursor),
          dateRaw: cursor,
          stock: null,
          qtystu: -lotEco.demande_hebdo,
          count: 0,
          forecastStock: Math.max(0, currentStock),
          forecastReplenishment: null,
          isReplenishment: false,
          isFuture: true,
          lotEcoLine: lotEco.lot_eco,
          lotOptimalLine: lotEco.lot_optimal,
        })

        forecasts.push({
          date: fmtDate(deliveryDate),
          dateRaw: deliveryDate,
          stock: null,
          qtystu: qty,
          count: 0,
          forecastStock: null,
          forecastReplenishment: qty,
          isReplenishment: true,
          isFuture: true,
          lotEcoLine: lotEco.lot_eco,
          lotOptimalLine: lotEco.lot_optimal,
        })

        currentStock += qty
      } else {
        forecasts.push({
          date: fmtDate(cursor),
          dateRaw: cursor,
          stock: null,
          qtystu: -lotEco.demande_hebdo,
          count: 0,
          forecastStock: Math.max(0, currentStock),
          forecastReplenishment: null,
          isReplenishment: false,
          isFuture: true,
          lotEcoLine: lotEco.lot_eco,
          lotOptimalLine: lotEco.lot_optimal,
        })
      }
    }

    return forecasts
  }, [entries, lastHistoryDate, lotEco])

  // Merge historical + forecast, deduplicating by date
  const allEntries = useMemo(() => {
    const byDate = new Map<string, ChartEntry>()

    for (const e of entries) {
      byDate.set(e.dateRaw, e)
    }

    for (const f of forecastEntries) {
      if (!byDate.has(f.dateRaw)) {
        byDate.set(f.dateRaw, f)
      } else {
        const existing = byDate.get(f.dateRaw)!
        if (existing.stock === null && f.forecastStock !== null) {
          existing.forecastStock = f.forecastStock
          existing.qtystu = f.qtystu
          existing.isFuture = true
        }
        if (f.isReplenishment) {
          existing.forecastReplenishment = f.forecastReplenishment
          existing.isReplenishment = f.isReplenishment
        }
      }
    }

    return Array.from(byDate.values()).sort((a, b) => a.dateRaw.localeCompare(b.dateRaw))
  }, [entries, forecastEntries])

  return {
    entries,
    forecastEntries,
    allEntries,
    lastHistoryDate,
    hasForecast: forecastEntries.length > 0,
  }
}
