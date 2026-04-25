import { useState } from 'react'
import type { StockMovement } from '@/types/stock-evolution'
import { TRSTYP_LABELS, isStockEntry } from '@/types/trstyp'
import { GridTable, type GridTableColumn } from '@/components/ui/GridTable'

interface Props {
  movements: StockMovement[]
}

function TrstypBadge({ trstyp }: { trstyp: number }) {
  const label = TRSTYP_LABELS[trstyp] ?? String(trstyp)
  const isPositive = isStockEntry(trstyp)
  return (
    <span className={`px-1 py-0 text-[10px] font-semibold border ${isPositive ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-red-300 text-red-700 bg-red-50'}`}>
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
    return <div className="bg-card border border-border p-4 text-center text-xs text-muted-foreground">Aucun mouvement</div>
  }

  const columns: GridTableColumn<StockMovement>[] = [
    { key: 'date', header: 'Date', width: '80px', cell: (m) => <span className="font-mono text-[10px]">{new Date(m.iptdat).toLocaleDateString('fr-FR')}</span> },
    { key: 'type', header: 'Type', width: '80px', cell: (m) => <TrstypBadge trstyp={m.trstyp} /> },
    { key: 'qty', header: 'Qté', align: 'right', width: '80px', cell: (m) => (
      <span className={`tabular-nums font-mono font-semibold ${m.qtystu >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
        {m.qtystu >= 0 ? '+' : ''}{m.qtystu.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
      </span>
    ) },
    { key: 'stock', header: 'Stock', align: 'right', width: '80px', cell: (m) => <span className="tabular-nums font-mono">{m.stock_apres.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</span> },
    { key: 'doc', header: 'Doc', width: '1fr', cell: (m) => <span className="font-mono text-[10px] text-muted-foreground">{m.vcrnum || '—'}</span> },
  ]

  return (
    <div className="bg-card border border-border overflow-hidden">
      <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
        <p className="text-[11px] font-semibold">Mouvements ({movements.length})</p>
        <button onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="text-[10px] text-muted-foreground hover:text-foreground">
          {sortDir === 'asc' ? 'Ancien → Récent' : 'Récent → Ancien'}
        </button>
      </div>
      <GridTable
        columns={columns}
        data={sorted}
        keyExtractor={(_, i) => String(i)}
        maxHeight="360px"
        emptyMessage="Aucun mouvement"
      />
    </div>
  )
}
