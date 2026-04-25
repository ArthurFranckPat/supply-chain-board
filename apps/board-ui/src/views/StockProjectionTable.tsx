import { useState, useEffect } from 'react'
import { apiClient, ApiError } from '@/api/client'
import type { StockProjectionResponse } from '@/types/stock-evolution'
import { GridTable, type GridTableColumn } from '@/components/ui/GridTable'
import { cn } from '@/lib/utils'

interface Props {
  articleCode: string
  stockInitial: number
  lotEco: number
  lotOptimal: number
  delaiReappro: number
  demandeHebdo: number
}

function fmtNum(n: number, dec = 1): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function StockProjectionTable({ articleCode, stockInitial, lotEco, lotOptimal, delaiReappro, demandeHebdo }: Props) {
  const [data, setData] = useState<StockProjectionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiClient.projectStock({
      article: articleCode, stock_initial: stockInitial, lot_eco: lotEco, lot_optimal: lotOptimal,
      delai_reappro_jours: delaiReappro, demande_hebdo: demandeHebdo, horizon_weeks: 26,
    }).then(setData).catch(err => setError(err instanceof ApiError ? err.message : 'Erreur')).finally(() => setLoading(false))
  }, [articleCode, stockInitial, lotEco, lotOptimal, delaiReappro, demandeHebdo])

  if (loading) return <div className="py-8 text-center text-xs text-muted-foreground">Projection...</div>
  if (error) return <div className="py-8 text-center text-xs text-muted-foreground">{error}</div>
  if (!data || data.weeks.length === 0) return <div className="py-8 text-center text-xs text-muted-foreground">Aucune donnée</div>

  const columns: GridTableColumn<typeof data.weeks[0]>[] = [
    { key: 'week', header: 'Sem.', width: '60px', cell: (w) => w.week_label },
    { key: 'stock', header: 'Stock', align: 'right', width: '80px', cell: (w) => {
      const stockColor = w.projected_stock < 0 ? 'text-red-600' : w.projected_stock < data.threshold ? 'text-amber-600' : ''
      return <span className={cn('tabular-nums font-mono font-semibold', stockColor)}>{fmtNum(w.projected_stock, 0)}</span>
    } },
    { key: 'exits', header: 'Sorties', align: 'right', width: '80px', cell: (w) => (
      <span className="tabular-nums font-mono text-muted-foreground">{w.client_exits > 0 ? `-${fmtNum(w.client_exits, 1)}` : '—'}</span>
    ) },
    { key: 'receptions', header: 'Récept.', align: 'right', width: '80px', cell: (w) => (
      <span className="tabular-nums font-mono text-emerald-600">{w.supplier_receptions > 0 ? `+${fmtNum(w.supplier_receptions, 0)}` : '—'}</span>
    ) },
    { key: 'prod', header: 'Prod.', align: 'right', width: '80px', cell: (w) => (
      <span className="tabular-nums font-mono text-sky-600">{w.production_entries > 0 ? `+${fmtNum(w.production_entries, 0)}` : '—'}</span>
    ) },
    { key: 'reappro', header: 'Réappro', align: 'right', width: '80px', cell: (w) => (
      <span className="tabular-nums font-mono text-amber-600">{w.simulated_replenishment > 0 ? `+${fmtNum(w.simulated_replenishment, 0)}` : '—'}</span>
    ) },
  ]

  return (
    <div className="space-y-2">
      {data.rupture_week && (
        <div className="text-red-600 text-[11px] font-semibold">Rupture en S+{data.rupture_week}</div>
      )}
      <GridTable
        columns={columns}
        data={data.weeks}
        keyExtractor={(_, i) => String(i)}
        maxHeight="400px"
        emptyMessage="Aucune donnée"
      />
    </div>
  )
}
