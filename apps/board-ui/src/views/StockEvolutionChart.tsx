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
} from 'recharts'
import { useStockChartData } from '@/hooks/useStockChartData'
import type { StockEvolutionResponse } from '@/types/stock-evolution'
import type { LotEcoArticle } from '@/types/lot-eco'
import { Package } from 'lucide-react'
import { fmtDate } from '@/lib/format'

interface Props {
  data: StockEvolutionResponse
  lotEco: LotEcoArticle
}

function CustomTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ value: number; payload: import('@/hooks/useStockChartData').ChartEntry }>
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

function CustomLegend({ lotEco, hasForecast }: { lotEco: LotEcoArticle; hasForecast: boolean }) {
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
  const { allEntries, forecastEntries, lastHistoryDate, hasForecast } = useStockChartData(data, lotEco)

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
        <CustomLegend lotEco={lotEco} hasForecast={hasForecast} />
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
