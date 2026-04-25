import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import type { StockEvolutionResponse } from '@/types/stock-evolution'

interface Props { data: StockEvolutionResponse; showAverage?: boolean }
interface ChartEntry { date: string; stock: number; qtystu: number; count: number }

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; payload: ChartEntry }> }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]!.payload
  return (
    <div className="bg-card border border-border px-2 py-1 text-[11px]">
      <p className="font-semibold">{entry.date}</p>
      <p>Stock: <span className="font-mono font-semibold">{entry.stock.toFixed(1)}</span></p>
      <p>Mvt: <span className={entry.qtystu >= 0 ? 'text-green' : 'text-destructive'}>{entry.qtystu >= 0 ? '+' : ''}{entry.qtystu.toFixed(1)}</span>{entry.count > 1 && <span className="text-muted-foreground ml-1">({entry.count})</span>}</p>
    </div>
  )
}

export function StockChart({ data, showAverage = false }: Props) {
  const entries = useMemo(() => {
    const dayMap = new Map<string, ChartEntry>()
    for (const m of data.items) {
      const day = m.iptdat.slice(0, 10)
      const existing = dayMap.get(day)
      if (existing) { existing.stock = m.stock_apres; existing.qtystu += m.qtystu; existing.count += 1 }
      else { dayMap.set(day, { date: new Date(day).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }), stock: m.stock_apres, qtystu: m.qtystu, count: 1 }) }
    }
    return Array.from(dayMap.values())
  }, [data.items])

  if (entries.length === 0) return <div className="bg-card border border-border p-4 text-center text-xs text-muted-foreground">Aucun mouvement</div>

  return (
    <div className="bg-card border border-border p-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold">Evolution — {data.article}</p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="w-3 h-[2px] bg-primary inline-block" />Stock</span>
          {showAverage && <span className="flex items-center gap-1"><span className="w-3 h-[2px] bg-muted-foreground inline-block" />Moy.</span>}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={entries} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={v => v.toLocaleString('fr-FR')} width={50} />
          <Tooltip content={<CustomTooltip />} />
          {showAverage && <ReferenceLine y={data.stock_moyen} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.5} />}
          <Line type="monotone" dataKey="stock" stroke="var(--primary)" strokeWidth={1.5} dot={{ r: 2, fill: 'var(--primary)' }} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
