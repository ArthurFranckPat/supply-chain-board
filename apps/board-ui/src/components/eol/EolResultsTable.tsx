import { useState, useMemo } from 'react'
import type { EolComponent, EolResidualsResult } from '@/types/eol-residuals'
import { AlertTriangle, Download, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

type TypeFilter = 'all' | 'ACHAT' | 'FABRICATION'
type SortKey = 'article' | 'description' | 'component_type' | 'used_by_target_pf_count' | 'stock_qty' | 'pmp' | 'value'
type SortDir = 'asc' | 'desc'

export interface EolResultsTableProps {
  data: EolResidualsResult
  bomDepthMode: 'full' | 'level1'
  stockMode: 'physical' | 'net_releaseable' | 'projected'
  projectionDate: string
}

export function EolResultsTable({ data, bomDepthMode, stockMode, projectionDate }: EolResultsTableProps) {
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

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 opacity-30" />
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3" />
      : <ChevronDown className="h-3 w-3" />
  }

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

      {/* Components table */}
      {data.components.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {/* Toolbar: type filter tabs + row count + export */}
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
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

          <div className="overflow-auto max-h-[480px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                <tr>
                  {([
                    { key: 'article' as SortKey, label: 'Article', align: 'left', px: 'px-4' },
                    { key: 'description' as SortKey, label: 'Description', align: 'left', px: 'px-3' },
                    { key: 'component_type' as SortKey, label: 'Type', align: 'center', px: 'px-3' },
                    { key: 'used_by_target_pf_count' as SortKey, label: 'PF cibles', align: 'center', px: 'px-3' },
                    { key: 'stock_qty' as SortKey, label: 'Stock qte', align: 'right', px: 'px-3' },
                    { key: 'pmp' as SortKey, label: 'PMP', align: 'right', px: 'px-3' },
                    { key: 'value' as SortKey, label: 'Valeur', align: 'right', px: 'px-4' },
                  ]).map(col => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`${col.px} py-2 font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none text-${col.align}`}
                    >
                      <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'flex-row-reverse' : col.align === 'center' ? 'justify-center' : ''}`}>
                        {col.label}
                        <SortIcon col={col.key} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredComponents.map((comp: EolComponent) => (
                  <tr key={comp.article} className="border-t border-border hover:bg-accent/40 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-semibold">{comp.article}</td>
                    <td className="px-3 py-2.5 text-muted-foreground max-w-[200px] truncate" title={comp.description}>
                      {comp.description}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                        comp.component_type === 'ACHAT' ? 'bg-orange/10 text-orange' : 'bg-green/10 text-green'
                      }`}>
                        {comp.component_type === 'ACHAT' ? 'ACH' : 'FAB'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-semibold">{comp.used_by_target_pf_count}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                      {comp.stock_qty.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                      {comp.pmp.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                      {comp.value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
