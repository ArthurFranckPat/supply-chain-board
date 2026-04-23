import { useState } from 'react'
import type { StockMovement } from '@/types/stock-evolution'
import { TRSTYP_LABELS, isStockEntry } from '@/types/trstyp'

interface Props {
  movements: StockMovement[]
}

function TrstypBadge({ trstyp }: { trstyp: number }) {
  const label = TRSTYP_LABELS[trstyp] ?? String(trstyp)
  const isPositive = isStockEntry(trstyp)
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
      isPositive ? 'bg-green/10 text-green' : 'bg-destructive/10 text-destructive'
    }`}>
      {label}
    </span>
  )
}

export function StockMovementsTable({ movements }: Props) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = [...movements].sort((a, b) => {
    const cmp = a.iptdat.localeCompare(b.iptdat)
    return sortDir === 'asc' ? cmp : -cmp
  })

  if (movements.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
        Aucun mouvement
      </div>
    )
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <p className="text-xs font-semibold">
          Mouvements ({movements.length})
        </p>
        <button
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {sortDir === 'asc' ? 'Plus anciens' : 'Plus récents'}
        </button>
      </div>
      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qté</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Stock avant</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">Stock après</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Document</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Origine</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Utilisateur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((m, i) => (
              <tr key={i} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-2.5 font-mono text-[11px]">
                  {new Date(m.iptdat).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-3 py-2.5">
                  <TrstypBadge trstyp={m.trstyp} />
                </td>
                <td className={`px-3 py-2.5 text-right font-mono font-semibold ${
                  m.qtystu >= 0 ? 'text-green' : 'text-destructive'
                }`}>
                  {m.qtystu >= 0 ? '+' : ''}{m.qtystu.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                  {m.stock_avant.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold">
                  {m.stock_apres.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                </td>
                <td className="px-3 py-2.5 font-mono text-[10px]">{m.vcrnum || '—'}</td>
                <td className="px-3 py-2.5 font-mono text-[10px] text-muted-foreground">{m.vcrnumori || '—'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{m.creusr}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
