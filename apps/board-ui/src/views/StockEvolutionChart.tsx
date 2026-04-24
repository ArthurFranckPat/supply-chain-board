import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Legend,
} from 'recharts'
import type { StockEvolutionResponse } from '@/types/stock-evolution'
import type { LotEcoArticle } from '@/types/lot-eco'
import { TrendingDown, TrendingUp, Minus, Package } from 'lucide-react'

interface Props {
  data: StockEvolutionResponse
  lotEco: LotEcoArticle
}

interface ChartEntry {
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

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; payload: ChartEntry }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const entry = payload[0]!.payload
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-xl px-4 py-3 text-xs space-y-1.5 shadow-2xl shadow-black/60">
      <p className="text-[#8b949e] font-medium">{entry.date}</p>
      {entry.stock !== null && (
        <p className="flex items-center gap-2">
          <span className="text-[#58a6ff]">●</span>
          <span className="text-[#c9d1d9]">Stock réel:</span>
          <span className="text-[#f0f6fc] font-bold font-mono">{entry.stock.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</span>
        </p>
      )}
      {entry.forecastStock !== null && !entry.isReplenishment && (
        <p className="flex items-center gap-2">
          <span className="text-[#a371f7]">●</span>
          <span className="text-[#8b949e]">Stock projeté:</span>
          <span className="text-[#c9d1d9] font-bold font-mono">{entry.forecastStock.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</span>
        </p>
      )}
      {entry.isReplenishment && entry.forecastReplenishment !== null && (
        <p className="flex items-center gap-2">
          <span className="text-[#3fb950]">▲</span>
          <span className="text-[#8b949e]">Réception lot:</span>
          <span className="text-[#3fb950] font-bold font-mono">+{entry.forecastReplenishment.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>
        </p>
      )}
      {entry.qtystu !== 0 && (
        <p className="flex items-center gap-2">
          <span className="text-[#f0883e]">●</span>
          <span className="text-[#8b949e]">Mouvement:</span>
          <span className={entry.qtystu >= 0 ? 'text-[#3fb950] font-bold' : 'text-[#f85149] font-bold'}>
            {entry.qtystu >= 0 ? '+' : ''}{entry.qtystu.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
          </span>
        </p>
      )}
    </div>
  )
}

interface CustomLegendProps {
  lotEco: LotEcoArticle
  hasForecast: boolean
}
function CustomLegend({ lotEco, hasForecast }: CustomLegendProps) {
  return (
    <div className="flex items-center justify-center gap-6 mt-3">
      <span className="flex items-center gap-1.5 text-[11px] text-[#8b949e]">
        <span className="w-3 h-0.5 bg-[#58a6ff] inline-block rounded-full" />
        Historique
      </span>
      {hasForecast && (
        <>
          <span className="flex items-center gap-1.5 text-[11px] text-[#8b949e]">
            <span className="w-3 h-0.5 bg-[#a371f7] inline-block rounded-full opacity-70" />
            Projection stock
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[#8b949e]">
            <span className="w-3 h-0.5 bg-[#3fb950] inline-block rounded-full" />
            Réceptions prévues
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-[#8b949e]">
            <span className="w-3 h-0.5 bg-[#f85149] inline-block rounded-full opacity-40" />
            Lot éco ({lotEco.lot_eco.toLocaleString('fr-FR')})
          </span>
        </>
      )}
    </div>
  )
}

export function StockEvolutionChart({ data, lotEco }: Props) {
  const { entries, lastHistoryDate } = useMemo(() => {
    const dayMap = new Map<string, ChartEntry>()

    // Historical entries
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

    const FORECAST_WEEKS = 26 // 6 months
    const DAYS_PER_STEP = 7
    const recvd = [...entries].sort((a, b) => a.dateRaw.localeCompare(b.dateRaw))
    const lastEntry = recvd[recvd.length - 1]
    if (!lastEntry) return []

    let currentStock = lastEntry.stock ?? 0
    let nextDeliveryDate = lastHistoryDate
    const forecasts: ChartEntry[] = []

    // Advance to last history date
    let cursor = lastHistoryDate

    // Move cursor forward one week at a time from last history date
    for (let week = 1; week <= FORECAST_WEEKS; week++) {
      cursor = addDays(cursor, DAYS_PER_STEP)

      // Consume this week
      currentStock -= lotEco.demande_hebdo

      // Check if we need a replenishment
      // Trigger: stock would go below lot_eco threshold (or zero)
      const triggerThreshold = lotEco.lot_eco * 0.3 // trigger at 30% of lot eco
      if (currentStock <= triggerThreshold) {
        // Delivery arrives after lead time
        const deliveryDate = addDays(cursor, lotEco.delai_reappro_jours)
        const qty = lotEco.lot_optimal

        // Add consumption entry on cursor date
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

        // Add delivery entry
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
        nextDeliveryDate = deliveryDate
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
        // Merge: keep existing (historical) stock but overlay forecast if present
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

  if (allEntries.length === 0) {
    return (
      <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-8 text-center text-sm text-[#8b949e]">
        Aucun mouvement sur cette période
      </div>
    )
  }

  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-[#58a6ff]" />
          <p className="text-[13px] font-semibold text-[#f0f6fc]">Évolution du stock — {data.article}</p>
        </div>
        <CustomLegend lotEco={lotEco} hasForecast={forecastEntries.length > 0} />
      </div>

      {/* Threshold zone legend */}
      <div className="flex items-center gap-4 mb-3 text-[10px] text-[#8b949e]">
        <span>Zone critique</span>
        <div className="relative h-2 flex-1 max-w-[200px] bg-gradient-to-r from-[#f85149]/20 via-[#f0883e]/10 to-transparent rounded-full" />
        <span>Zone lot éco ({lotEco.lot_eco.toLocaleString('fr-FR')})</span>
        <div className="relative h-2 flex-1 max-w-[200px] bg-gradient-to-r from-transparent via-[#3fb950]/10 to-[#3fb950]/20 rounded-full" />
        <span>Zone sureffectif</span>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={allEntries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid stroke="#21262d" strokeDasharray="4 4" />

          {/* Critical zone background */}
          <ReferenceArea
            y1={0}
            y2={lotEco.lot_eco * 0.3}
            fill="#f85149"
            fillOpacity={0.06}
          />
          {/* Optimal zone */}
          <ReferenceArea
            y1={lotEco.lot_eco * 0.8}
            y2={lotEco.lot_eco * 1.5}
            fill="#3fb950"
            fillOpacity={0.04}
          />

          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#8b949e' }}
            interval="preserveStartEnd"
            tickLine={{ stroke: '#30363d' }}
            axisLine={{ stroke: '#30363d' }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#8b949e' }}
            tickFormatter={(v) => v.toLocaleString('fr-FR')}
            width={65}
            tickLine={{ stroke: '#30363d' }}
            axisLine={{ stroke: '#30363d' }}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Lot eco reference line */}
          <ReferenceLine
            y={lotEco.lot_eco}
            stroke="#f85149"
            strokeDasharray="6 3"
            strokeOpacity={0.5}
          />

          {/* Historical stock line */}
          <Line
            type="monotone"
            dataKey="stock"
            stroke="#58a6ff"
            strokeWidth={2}
            dot={{ r: 2.5, fill: '#58a6ff', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#58a6ff', stroke: '#0d1117', strokeWidth: 2 }}
            connectNulls={false}
          />

          {/* Forecast stock line */}
          <Line
            type="monotone"
            dataKey="forecastStock"
            stroke="#a371f7"
            strokeWidth={2}
            strokeDasharray="5 3"
            strokeOpacity={0.8}
            dot={false}
            activeDot={{ r: 4, fill: '#a371f7', stroke: '#0d1117', strokeWidth: 2 }}
            connectNulls={false}
          />

          {/* Replenishment markers */}
          <Line
            type="stepAfter"
            dataKey="forecastReplenishment"
            stroke="#3fb950"
            strokeWidth={2}
            dot={{ r: 5, fill: '#3fb950', stroke: '#0d1117', strokeWidth: 2 }}
            activeDot={{ r: 7, fill: '#3fb950', stroke: '#0d1117', strokeWidth: 2 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Future projections label */}
      {forecastEntries.length > 0 && lastHistoryDate && (
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 h-px bg-gradient-to-r from-[#30363d] to-[#a371f7]/50" />
          <span className="text-[10px] text-[#8b949e] italic">
            Projection {forecastEntries.length} semaines après le {fmtDate(lastHistoryDate)} · Lot opt. {lotEco.lot_optimal.toLocaleString('fr-FR')} · Délai {lotEco.delai_reappro_jours}j
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-[#a371f7]/50 to-transparent" />
        </div>
      )}
    </div>
  )
}
