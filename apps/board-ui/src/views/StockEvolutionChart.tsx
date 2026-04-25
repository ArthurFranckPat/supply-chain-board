import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useStockChartData } from '@/hooks/useStockChartData'
import type { StockEvolutionResponse } from '@/types/stock-evolution'
import type { LotEcoArticle } from '@/types/lot-eco'
import { fmtDate } from '@/lib/format'

interface Props { data: StockEvolutionResponse; lotEco: LotEcoArticle }

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: import('@/hooks/useStockChartData').ChartEntry }> }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]!.payload
  return (
    <div className="bg-card border border-border px-2 py-1 text-[11px]">
      <p className="font-semibold">{entry.date}</p>
      {entry.stock !== null && <p>Stock: <span className="font-mono font-semibold">{entry.stock.toFixed(1)}</span></p>}
      {entry.forecastStock !== null && !entry.isReplenishment && <p>Projeté: <span className="font-mono">{entry.forecastStock.toFixed(1)}</span></p>}
      {entry.isReplenishment && entry.forecastReplenishment !== null && <p>Réappro: <span className="text-green font-semibold">+{entry.forecastReplenishment.toFixed(0)}</span></p>}
      {entry.qtystu !== 0 && <p>Mvt: <span className={entry.qtystu >= 0 ? 'text-green' : 'text-destructive'}>{entry.qtystu >= 0 ? '+' : ''}{entry.qtystu.toFixed(1)}</span></p>}
    </div>
  )
}

export function StockEvolutionChart({ data, lotEco }: Props) {
  const { allEntries, forecastEntries, lastHistoryDate, hasForecast } = useStockChartData(data, lotEco)

  if (allEntries.length === 0) return <div className="bg-card border border-border p-4 text-center text-xs text-muted-foreground">Aucun mouvement</div>

  return (
    <div className="bg-card border border-border p-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold">Evolution — {data.article}</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-[2px] bg-primary inline-block" />Historique</span>
          {hasForecast && <span className="flex items-center gap-1"><span className="w-3 h-[2px] bg-muted-foreground inline-block" />Projection</span>}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={allEntries} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={v => v.toLocaleString('fr-FR')} width={50} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={lotEco.lot_eco} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Line type="monotone" dataKey="stock" stroke="var(--primary)" strokeWidth={1.5} dot={{ r: 2, fill: 'var(--primary)' }} activeDot={{ r: 4 }} connectNulls={false} />
          <Line type="monotone" dataKey="forecastStock" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} activeDot={{ r: 3 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
      {forecastEntries.length > 0 && lastHistoryDate && (
        <p className="text-[10px] text-muted-foreground mt-1 text-center">
          Projection {forecastEntries.length} sem. après {fmtDate(lastHistoryDate)} · Lot opt. {lotEco.lot_optimal.toLocaleString('fr-FR')} · Délai {lotEco.delai_reappro_jours}j
        </p>
      )}
    </div>
  )
}
