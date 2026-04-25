import { memo, useState, useMemo } from 'react'
import type { EolComponent, EolResidualsResult } from '@/types/eol-residuals'
import { GridTable } from '@/components/ui/GridTable'
import type { GridTableColumn } from '@/components/ui/GridTable'

type TypeFilter = 'all' | 'ACHAT' | 'FABRICATION'
type SortKey = 'article' | 'description' | 'component_type' | 'used_by_target_pf_count' | 'stock_qty' | 'pmp' | 'value'
type SortDir = 'asc' | 'desc'

export interface EolResultsTableProps {
  data: EolResidualsResult
  bomDepthMode: 'full' | 'level1'
  stockMode: 'physical' | 'net_releaseable' | 'projected'
  projectionDate: string
}

export const EolResultsTable = memo(function EolResultsTable({ data, bomDepthMode, stockMode, projectionDate }: EolResultsTableProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const achatComponents = data.components.filter(c => c.component_type === 'ACHAT')
  const fabComponents = data.components.filter(c => c.component_type === 'FABRICATION')
  const totalAchatValue = achatComponents.reduce((sum, c) => sum + c.value, 0)
  const totalFabValue = fabComponents.reduce((sum, c) => sum + c.value, 0)
  const totalValue = totalAchatValue + totalFabValue
  const achatPct = totalValue > 0 ? Math.round((totalAchatValue / totalValue) * 100) : 0
  const fabPct = 100 - achatPct

  const filteredComponents = useMemo(() => {
    let comps = data.components
    if (typeFilter !== 'all') comps = comps.filter(c => c.component_type === typeFilter)
    return [...comps].sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal
      }
      return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
    })
  }, [data.components, typeFilter, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const stockModeLabel = stockMode === 'physical' ? 'stock physique'
    : stockMode === 'net_releaseable' ? 'stock net allouable'
    : `stock projete au ${projectionDate}`

  const exportCSV = () => {
    const headers = ['Article', 'Description', 'Type', 'PF cibles', 'Stock qte', 'PMP', 'Valeur EUR']
    const rows = filteredComponents.map(c => [
      c.article, `"${c.description.replace(/"/g, '""')}"`, c.component_type,
      c.used_by_target_pf_count, c.stock_qty.toFixed(2), c.pmp.toFixed(4), c.value.toFixed(2),
    ])
    const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eol-residuels-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const sortIndicator = (key: SortKey) => (
    sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : null
  )

  const columns: GridTableColumn<EolComponent>[] = [
    {
      key: 'article', header: <button onClick={() => handleSort('article')} className="flex items-center gap-0.5">Article{sortIndicator('article')}</button>, width: '110px',
      cell: (c) => <span className="font-mono text-[12px] font-semibold">{c.article}</span>,
    },
    {
      key: 'description', header: <button onClick={() => handleSort('description')} className="flex items-center gap-0.5">Description{sortIndicator('description')}</button>,
      cell: (c) => <span className="text-[12px] text-muted-foreground block max-w-[220px] truncate">{c.description}</span>,
    },
    {
      key: 'type', header: <button onClick={() => handleSort('component_type')} className="flex items-center gap-0.5">Type{sortIndicator('component_type')}</button>, align: 'center', width: '70px',
      cell: (c) => (
        <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold border ${
          c.component_type === 'ACHAT'
            ? 'bg-orange/10 text-orange border-orange/20'
            : 'bg-green/10 text-green border-green/20'
        }`}>
          {c.component_type === 'ACHAT' ? 'ACH' : 'FAB'}
        </span>
      ),
    },
    {
      key: 'pf', header: <button onClick={() => handleSort('used_by_target_pf_count')} className="flex items-center gap-0.5">PF{sortIndicator('used_by_target_pf_count')}</button>, align: 'center', width: '60px',
      cell: (c) => <span className="font-mono text-[12px] tabular-nums">{c.used_by_target_pf_count.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>,
    },
    {
      key: 'stock', header: <button onClick={() => handleSort('stock_qty')} className="flex items-center gap-0.5">Stock{sortIndicator('stock_qty')}</button>, align: 'right', width: '80px',
      cell: (c) => <span className="font-mono text-[12px] tabular-nums">{c.stock_qty.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</span>,
    },
    {
      key: 'pmp', header: <button onClick={() => handleSort('pmp')} className="flex items-center gap-0.5">PMP{sortIndicator('pmp')}</button>, align: 'right', width: '80px',
      cell: (c) => <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{c.pmp.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 })}</span>,
    },
    {
      key: 'value', header: <button onClick={() => handleSort('value')} className="flex items-center gap-0.5">Valeur{sortIndicator('value')}</button>, align: 'right', width: '90px',
      cell: (c) => <span className="font-mono text-[12px] tabular-nums font-semibold">{c.value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</span>,
    },
  ]

  return (
    <div className="space-y-2">
      {/* Summary */}
      <div className="bg-card border border-border p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Analyse residuelle EOL</p>
            <p className="text-xs font-semibold">{data.summary.unique_component_count} composants &middot; {data.summary.target_pf_count} PF cibles</p>
            <p className="text-[10px] text-muted-foreground">{stockModeLabel} &middot; {bomDepthMode === 'full' ? 'nomenclature complète' : 'niveau 1'}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-muted-foreground">Valeur totale</p>
            <p className="text-[16px] font-bold tabular-nums">{data.summary.total_value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</p>
            <p className="text-[10px] text-muted-foreground">{data.summary.total_stock_qty.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} unités</p>
          </div>
        </div>

        {totalValue > 0 && (
          <div className="mt-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between text-[10px] mb-0.5">
              <span className="text-orange font-semibold">ACHAT {achatPct}%</span>
              <span className="text-green font-semibold">FAB {fabPct}%</span>
            </div>
            <div className="h-[3px] bg-border flex">
              <div className="h-full bg-orange" style={{ width: `${achatPct}%` }} />
              <div className="h-full bg-green" style={{ width: `${fabPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-card border border-border p-2 flex items-start justify-between">
          <div>
            <span className="text-[10px] font-semibold text-orange">ACHAT</span>
            <p className="text-[16px] font-bold tabular-nums">{achatComponents.length}</p>
            <p className="text-[10px] text-muted-foreground">composants</p>
          </div>
          <div className="text-right">
            <p className="text-[12px] font-semibold tabular-nums">{totalAchatValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</p>
            <p className="text-[10px] text-muted-foreground">{achatPct}%</p>
          </div>
        </div>
        <div className="bg-card border border-border p-2 flex items-start justify-between">
          <div>
            <span className="text-[10px] font-semibold text-green">FABRICATION</span>
            <p className="text-[16px] font-bold tabular-nums">{fabComponents.length}</p>
            <p className="text-[10px] text-muted-foreground">composants</p>
          </div>
          <div className="text-right">
            <p className="text-[12px] font-semibold tabular-nums">{totalFabValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}</p>
            <p className="text-[10px] text-muted-foreground">{fabPct}%</p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {data.warnings.length > 0 && (
        <div className="bg-orange/5 border border-orange/20 px-3 py-2">
          <p className="text-[10px] font-semibold text-orange mb-0.5">Alertes</p>
          {data.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-orange/80">{w}</p>
          ))}
        </div>
      )}

      {/* Table */}
      {data.components.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex gap-0 border border-border">
              {(['all', 'ACHAT', 'FABRICATION'] as TypeFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`h-6 px-2 text-[11px] font-medium border-r border-border last:border-r-0 transition-colors ${
                    typeFilter === f ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {f === 'all' ? `Tous (${data.components.length})` : f === 'ACHAT' ? `ACHAT (${achatComponents.length})` : `FAB (${fabComponents.length})`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">{filteredComponents.length}</span>
              <button onClick={exportCSV} className="h-6 px-2 border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                CSV
              </button>
            </div>
          </div>

          <GridTable
            columns={columns} data={filteredComponents} keyExtractor={(c) => c.article}
            maxHeight="480px" emptyMessage="Aucun composant ne correspond aux filtres."
          />
        </div>
      )}
    </div>
  )
})
