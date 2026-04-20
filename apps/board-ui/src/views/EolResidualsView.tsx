import { useState, useMemo } from 'react'
import { apiClient, ApiError } from '@/api/client'
import type { EolResidualsResponse, EolComponent } from '@/types/eol-residuals'
import { Package, AlertTriangle, Download, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

type TypeFilter = 'all' | 'ACHAT' | 'FABRICATION'
type SortKey = 'article' | 'description' | 'component_type' | 'used_by_target_pf_count' | 'stock_qty' | 'pmp' | 'value'
type SortDir = 'asc' | 'desc'

export function EolResidualsView() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EolResidualsResponse | null>(null)

  const [familles, setFamilles] = useState('BDS,BDC')
  const [prefixes, setPrefixes] = useState('')
  const [bomDepthMode, setBomDepthMode] = useState<'full' | 'level1'>('full')
  const [stockMode, setStockMode] = useState<'physical' | 'net_releaseable' | 'projected'>('physical')
  const [projectionDate, setProjectionDate] = useState('2026-12-31')

  // Table controls
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('value')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleAnalyze = async () => {
    const famillesList = familles.split(',').map(s => s.trim()).filter(Boolean)
    const prefixesList = prefixes.split(',').map(s => s.trim()).filter(Boolean)
    if (famillesList.length === 0 && prefixesList.length === 0) {
      setError('Au moins une famille ou un prefixe requis')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiClient.eolResidualsAnalysis({
        familles: famillesList,
        prefixes: prefixesList,
        bom_depth_mode: bomDepthMode,
        stock_mode: stockMode,
        projection_date: stockMode === 'projected' ? projectionDate : undefined,
      })
      setResult(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inattendue lors de l\'analyse')
    } finally {
      setLoading(false)
    }
  }

  const achatComponents = result?.components.filter(c => c.component_type === 'ACHAT') ?? []
  const fabComponents = result?.components.filter(c => c.component_type === 'FABRICATION') ?? []
  const totalAchatValue = achatComponents.reduce((sum, c) => sum + c.value, 0)
  const totalFabValue = fabComponents.reduce((sum, c) => sum + c.value, 0)
  const totalValue = totalAchatValue + totalFabValue
  const achatPct = totalValue > 0 ? Math.round((totalAchatValue / totalValue) * 100) : 0
  const fabPct = 100 - achatPct

  // Filtered + sorted components
  const filteredComponents = useMemo(() => {
    if (!result) return []
    let comps = result.components
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
  }, [result, typeFilter, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const exportCSV = () => {
    if (!result) return
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

  const stockModeLabel = stockMode === 'physical'
    ? 'stock physique'
    : stockMode === 'net_releaseable'
    ? 'stock net allouable'
    : `stock projete au ${projectionDate}`

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Form */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Familles produit</label>
            <input
              type="text"
              value={familles}
              onChange={(e) => setFamilles(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="BDS, BDC"
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background font-mono"
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Prefixes (optionnel)</label>
            <input
              type="text"
              value={prefixes}
              onChange={(e) => setPrefixes(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              placeholder="MH, DW..."
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background font-mono"
            />
          </div>
          <div className="w-36">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Profondeur nomenclature</label>
            <select
              value={bomDepthMode}
              onChange={(e) => setBomDepthMode(e.target.value as 'full' | 'level1')}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
            >
              <option value="full">Complete</option>
              <option value="level1">Niveau 1</option>
            </select>
          </div>
          <div className="w-44">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Mode stock</label>
            <select
              value={stockMode}
              onChange={(e) => setStockMode(e.target.value as typeof stockMode)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
            >
              <option value="physical">Physique</option>
              <option value="net_releaseable">Net allouable</option>
              <option value="projected">Projete</option>
            </select>
          </div>
          {stockMode === 'projected' && (
            <div className="w-40">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Date projection</label>
              <input
                type="date"
                value={projectionDate}
                onChange={(e) => setProjectionDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
              />
            </div>
          )}
          <button
            onClick={handleAnalyze}
            disabled={loading || (!familles.trim() && !prefixes.trim())}
            className="bg-primary text-white px-5 py-2 rounded-md text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Analyser
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-[11px] uppercase mb-0.5">Erreur d'analyse</p>
            <p>{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-destructive/50 hover:text-destructive transition-colors text-base leading-none ml-1"
            aria-label="Fermer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium">Analyse residuelle en cours...</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Nomenclature {bomDepthMode === 'full' ? 'complete' : 'niveau 1'} &middot; {stockModeLabel}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !result && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Aucune analyse chargee</p>
          <p className="text-[11px] text-muted-foreground mt-1.5 max-w-[340px] leading-relaxed">
            Saisissez des familles produit ou des prefixes d'articles, puis cliquez sur{' '}
            <strong className="text-foreground">Analyser</strong> pour identifier les composants residuels EOL et leur valorisation.
          </p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary header card */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wide">Analyse residuelle EOL</p>
                <p className="text-sm font-semibold mt-0.5">
                  {result.summary.unique_component_count} composants uniques &middot; {result.summary.target_pf_count} PF cibles
                </p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {stockModeLabel} &middot; nomenclature {bomDepthMode === 'full' ? 'complete' : 'niveau 1'}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-muted-foreground">Valeur totale residuelle</p>
                <p className="text-xl font-bold tabular-nums mt-0.5">
                  {result.summary.total_value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {result.summary.total_stock_qty.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} unites en stock
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
                <p className="text-[11px] text-muted-foreground">composants achetes</p>
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
          {result.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-[11px] font-semibold text-amber-800 mb-1 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                Alertes
              </p>
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">{w}</p>
              ))}
            </div>
          )}

          {/* Components table */}
          {result.components.length > 0 && (
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
                        ? `Tous (${result.components.length})`
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
      )}
    </div>
  )
}
