import { memo, useState, useMemo } from 'react'
import type { EolComponent, EolResidualsResult } from '@/types/eol-residuals'
import { AlertTriangle, Download } from 'lucide-react'
import { DataTable } from '@/components/ui/DataTable'
import type { DataTableColumn } from '@/components/ui/DataTable'
import { NumberCell, EuroCell, BadgeCell, MonoCell, TextCell } from '@/components/ui/DataTableCells'

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
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal))
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

  const stockModeLabel = stockMode === 'physical'
    ? 'stock physique'
    : stockMode === 'net_releaseable'
    ? 'stock net allouable'
    : `stock projete au ${projectionDate}`

  const exportCSV = () => {
    const headers = ['Article', 'Description', 'Type', 'PF cibles', 'Stock qte', 'PMP', 'Valeur EUR']
    const rows = filteredComponents.map(c => [
      c.article,
      `"${c.description.replace(/"/g, '""')}"`,
      c.component_type,
      c.used_by_target_pf_count,
      c.stock_qty.toFixed(2),
      c.pmp.toFixed(4),
      c.value.toFixed(2),
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

  const columns: DataTableColumn<EolComponent>[] = [
    {
      key: 'article',
      header: 'Article',
      cell: (c) => <MonoCell className="font-semibold">{c.article}</MonoCell>,
      width: '120px',
      sortable: true,
      sortDir: sortKey === 'article' ? sortDir : null,
      onSort: () => handleSort('article'),
    },
    {
      key: 'description',
      header: 'Description',
      cell: (c) => <TextCell muted truncate>{c.description}</TextCell>,
      sortable: true,
      sortDir: sortKey === 'description' ? sortDir : null,
      onSort: () => handleSort('description'),
    },
    {
      key: 'type',
      header: 'Type',
      align: 'center',
      width: '80px',
      cell: (c) => (
        <BadgeCell tone={c.component_type === 'ACHAT' ? 'warning' : 'success'}>
          {c.component_type === 'ACHAT' ? 'ACH' : 'FAB'}
        </BadgeCell>
      ),
      sortable: true,
      sortDir: sortKey === 'component_type' ? sortDir : null,
      onSort: () => handleSort('component_type'),
    },
    {
      key: 'pf',
      header: 'PF cibles',
      align: 'center',
      width: '90px',
      cell: (c) => <NumberCell value={c.used_by_target_pf_count} />,
      sortable: true,
      sortDir: sortKey === 'used_by_target_pf_count' ? sortDir : null,
      onSort: () => handleSort('used_by_target_pf_count'),
    },
    {
      key: 'stock',
      header: 'Stock qte',
      align: 'right',
      width: '100px',
      cell: (c) => <NumberCell value={c.stock_qty} decimals={1} />,
      sortable: true,
      sortDir: sortKey === 'stock_qty' ? sortDir : null,
      onSort: () => handleSort('stock_qty'),
    },
    {
      key: 'pmp',
      header: 'PMP',
      align: 'right',
      width: '100px',
      cell: (c) => <EuroCell value={c.pmp} decimals={2} className="text-muted-foreground text-[12.5px]" />,
      sortable: true,
      sortDir: sortKey === 'pmp' ? sortDir : null,
      onSort: () => handleSort('pmp'),
    },
    {
      key: 'value',
      header: 'Valeur',
      align: 'right',
      width: '110px',
      cell: (c) => <EuroCell value={c.value} className="font-semibold" />,
      sortable: true,
      sortDir: sortKey === 'value' ? sortDir : null,
      onSort: () => handleSort('value'),
    },
  ]

  return (
    <div className="space-y-4">
      {/* Summary header card */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wide">Analyse residuelle EOL</p>
            <p className="text-sm font-semibold mt-0.5">
              {data.summary.unique_component_count} composants uniques &middot; {data.summary.target_pf_count} PF cibles
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {stockModeLabel} &middot; nomenclature {bomDepthMode === 'full' ? 'complete' : 'niveau 1'}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[11px] text-muted-foreground">Valeur totale residuelle</p>
            <p className="text-xl font-bold tabular-nums mt-0.5">
              {data.summary.total_value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {data.summary.total_stock_qty.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} unites en stock
            </p>
          </div>
        </div>

        {/* ACHAT vs FAB proportion bar */}
        {totalValue > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between text-[10px] mb-1.5">
              <span className="text-orange font-semibold">ACHAT &mdash; {achatPct}%</span>
              <span className="text-green font-semibold">{fabPct}% &mdash; FAB</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden flex">
              <div className="h-full bg-orange transition-all" style={{ width: `${achatPct}%` }} />
              <div className="h-full bg-green transition-all" style={{ width: `${fabPct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* ACHAT / FAB breakdown cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between">
          <div>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange/10 text-orange mb-2">ACHAT</span>
            <p className="text-2xl font-bold tabular-nums">{achatComponents.length}</p>
            <p className="text-[11px] text-muted-foreground">composants achetés</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">
              {totalAchatValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-muted-foreground">{achatPct}% de la valeur</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between">
          <div>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green/10 text-green mb-2">FABRICATION</span>
            <p className="text-2xl font-bold tabular-nums">{fabComponents.length}</p>
            <p className="text-[11px] text-muted-foreground">composants internes</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold tabular-nums">
              {totalFabValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-muted-foreground">{fabPct}% de la valeur</p>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {data.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-[11px] font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Alertes
          </p>
          {data.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-700">{w}</p>
          ))}
        </div>
      )}

      {/* Toolbar + DataTable */}
      {data.components.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              {(['all', 'ACHAT', 'FABRICATION'] as TypeFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setTypeFilter(f)}
                  className={`px-3 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                    typeFilter === f
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f === 'all'
                    ? `Tous (${data.components.length})`
                    : f === 'ACHAT'
                    ? `ACHAT (${achatComponents.length})`
                    : `FAB (${fabComponents.length})`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <p className="text-[11px] text-muted-foreground">
                {filteredComponents.length} ligne{filteredComponents.length > 1 ? 's' : ''}
              </p>
              <button
                onClick={exportCSV}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Download className="h-3 w-3" />
                CSV
              </button>
            </div>
          </div>

          <DataTable
            columns={columns}
            data={filteredComponents}
            keyExtractor={(c) => c.article}
            maxHeight="480px"
            emptyMessage="Aucun composant ne correspond aux filtres."
          />
        </div>
      )}
    </div>
  )
})
