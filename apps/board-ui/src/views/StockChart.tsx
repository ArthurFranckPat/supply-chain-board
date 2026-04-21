import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { StockEvolutionResponse } from '@/types/stock-evolution'

interface Props {
  data: StockEvolutionResponse
}

interface ChartEntry {
  date: string
  stock: number
  qtystu: number
  trstyp: number
  vcrnum: string
}

const TRSTYP_LABELS: Record<number, string> = {
  1: 'Entrée',
  2: 'Sortie',
  4: 'Vente',
  5: 'Production',
  6: 'Transfert',
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; payload: ChartEntry }>; label?: string }) {
  if (!active || !payload?.length) return null
  const entry = payload[0]!.payload
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs space-y-1">
      <p className="font-semibold">{label}</p>
      <p>Stock: <span className="font-mono font-semibold">{entry.stock.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</span></p>
      <p>
        Mvt:{' '}
        <span className={entry.qtystu >= 0 ? 'text-green font-semibold' : 'text-destructive font-semibold'}>
          {entry.qtystu >= 0 ? '+' : ''}{entry.qtystu.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
        </span>
      </p>
      <p>Type: {TRSTYP_LABELS[entry.trstyp] ?? entry.trstyp}</p>
      {entry.vcrnum && <p>Doc: <span className="font-mono">{entry.vcrnum}</span></p>}
    </div>
  )
}

export function StockChart({ data }: Props) {
  const entries: ChartEntry[] = data.items.map((m) => ({
    date: new Date(m.iptdat).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
    stock: m.stock_apres,
    qtystu: m.qtystu,
    trstyp: m.trstyp,
    vcrnum: m.vcrnum,
  }))

  if (entries.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
        Aucun mouvement sur cette période
      </div>
    )
  }

  const stockMoyen = data.stock_moyen

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold">Evolution du stock — {data.article}</p>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue inline-block" />
            Stock
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-purple/40 inline-block" />
            Moyenne
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={entries} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            tickFormatter={(v) => v.toLocaleString('fr-FR')}
            width={60}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine
            y={stockMoyen}
            stroke="var(--purple)"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{ value: `moy: ${stockMoyen.toFixed(0)}`, fontSize: 9, fill: 'var(--purple)', position: 'right' }}
          />
          <Line
            type="monotone"
            dataKey="stock"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--primary)' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
