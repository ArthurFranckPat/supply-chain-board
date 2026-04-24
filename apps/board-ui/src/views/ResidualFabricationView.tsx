import { useState, useMemo } from 'react'
import { useResidualFabrication } from '@/hooks/useResidualFabrication'
import type { ResidualFabricationResult } from '@/types/residual-fabrication'
import { Package, AlertTriangle, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

type SortKey = 'pf_article' | 'description' | 'desired_qty' | 'feasible' | 'max_feasible_qty'
type SortDir = 'asc' | 'desc'

export function ResidualFabricationView() {
  const analyse = useResidualFabrication()

  const [familles, setFamilles] = useState('BDS,BDC')
  const [prefixes, setPrefixes] = useState('')
  const [bomDepthMode, setBomDepthMode] = useState<'full' | 'level1'>('full')
  const [stockMode, setStockMode] = useState<'physical' | 'net_releaseable' | 'projected'>('physical')
  const [projectionDate, setProjectionDate] = useState('2026-12-31')
  const [desiredQty, setDesiredQty] = useState(10)

  const [sortKey, setSortKey] = useState<SortKey>('max_feasible_qty')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleAnalyze = () => {
    const famillesList = familles.split(',').map(s => s.trim()).filter(Boolean)
    const prefixesList = prefixes.split(',').map(s => s.trim()).filter(Boolean)
    analyse.mutate({
      familles: famillesList,
      prefixes: prefixesList,
      desired_qty: desiredQty,
      bom_depth_mode: bomDepthMode,
      stock_mode: stockMode,
      projection_date: stockMode === 'projected' ? projectionDate : undefined,
    })
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = useMemo(() => analyse.data ? [...analyse.data].sort((a, b) => {
    let aVal: string | number | boolean = a[sortKey]
    let bVal: string | number | boolean = b[sortKey]
    if (typeof aVal === 'boolean') aVal = aVal ? 1 : 0
    if (typeof bVal === 'boolean') bVal = bVal ? 1 : 0
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    }
    return sortDir === 'asc'
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal))
  }) : [], [analyse.data, sortKey, sortDir])

  const feasibleCount = sorted.filter(r => r.feasible).length
  const infeasibleCount = sorted.length - feasibleCount

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronsUpDown className="h-3 w-3 opacity-30" />
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Form */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Familles produit</label>
            <input type="text" value={familles} onChange={e => setFamilles(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              placeholder="BDS, BDC"
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background font-mono" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Prefixes (optionnel)</label>
            <input type="text" value={prefixes} onChange={e => setPrefixes(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              placeholder="MH, DW..."
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background font-mono" />
          </div>
          <div className="w-24">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Qte desired</label>
            <input type="number" value={desiredQty} onChange={e => setDesiredQty(Number(e.target.value))} min={1}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background" />
          </div>
          <div className="w-36">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Profondeur nomenclature</label>
            <select value={bomDepthMode} onChange={e => setBomDepthMode(e.target.value as 'full' | 'level1')}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background">
              <option value="full">Complète</option>
              <option value="level1">Niveau 1</option>
            </select>
          </div>
          <div className="w-44">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Mode stock</label>
            <select value={stockMode} onChange={e => setStockMode(e.target.value as typeof stockMode)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background">
              <option value="physical">Physique</option>
              <option value="net_releaseable">Net allouable</option>
              <option value="projected">Projete</option>
            </select>
          </div>
          {stockMode === 'projected' && (
            <div className="w-40">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Date projection</label>
              <input type="date" value={projectionDate} onChange={e => setProjectionDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background" />
            </div>
          )}
          <button onClick={handleAnalyze} disabled={analyse.isPending}
            className="bg-primary text-white px-5 py-2 rounded-md text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            Analyser
          </button>
        </div>
      </div>

      {/* Error */}
      {analyse.error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {analyse.error.message}
        </div>
      )}

      {/* Loading */}
      {analyse.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Analyse en cours...
        </div>
      )}

      {/* Empty state */}
      {!analyse.isPending && !analyse.error && !analyse.data && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Aucun resultat</p>
          <p className="text-xs text-muted-foreground mt-1">Saisissez des familles et lancez l'analyse pour voir quels PF sont fabricables</p>
        </div>
      )}

      {/* Results */}
      {analyse.data && (
        <div className="space-y-4">
          {/* Summary header */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground font-mono uppercase">Fabrication residuelle</p>
                <p className="text-sm font-semibold mt-0.5">{analyse.data.length} produitsfinis evalues</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <p className="text-green font-bold text-lg">{feasibleCount}</p>
                  <p className="text-[10px] text-muted-foreground">fabricables</p>
                </div>
                <div className="text-right">
                  <p className="text-destructive font-bold text-lg">{infeasibleCount}</p>
                  <p className="text-[10px] text-muted-foreground">non fabricables</p>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          {analyse.data.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-auto max-h-[520px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground cursor-pointer select-none"
                        onClick={() => handleSort('pf_article')}>
                        <span className="flex items-center gap-1">Article <SortIcon col="pf_article" /></span>
                      </th>
                      <th className="text-left px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none"
                        onClick={() => handleSort('description')}>
                        <span className="flex items-center gap-1">Description <SortIcon col="description" /></span>
                      </th>
                      <th className="text-center px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none"
                        onClick={() => handleSort('feasible')}>
                        <span className="flex items-center gap-1 justify-center">Statut <SortIcon col="feasible" /></span>
                      </th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none"
                        onClick={() => handleSort('desired_qty')}>
                        <span className="flex items-center gap-1 justify-end">Qte desired <SortIcon col="desired_qty" /></span>
                      </th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground cursor-pointer select-none"
                        onClick={() => handleSort('max_feasible_qty')}>
                        <span className="flex items-center gap-1 justify-end">Max qty <SortIcon col="max_feasible_qty" /></span>
                      </th>
                      <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Gaps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((r: ResidualFabricationResult) => (
                      <tr key={r.pf_article} className="border-t border-border hover:bg-accent/40 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-semibold">{r.pf_article}</td>
                        <td className="px-3 py-2.5 text-muted-foreground max-w-[180px] truncate">{r.description}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            r.feasible ? 'bg-green/10 text-green' : 'bg-destructive/10 text-destructive'
                          }`}>
                            {r.feasible ? 'OK' : 'BLOQUE'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono">{r.desired_qty}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-semibold">{r.max_feasible_qty}</td>
                        <td className="px-3 py-2.5 text-center">
                          {r.stock_gaps.length > 0 ? (
                            <span className="text-destructive text-[10px]" title={r.stock_gaps.map(g => `${g.article}:-${g.shortage_qty}`).join(', ')}>
                              {r.stock_gaps.length} gap{r.stock_gaps.length > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40 text-[10px]">—</span>
                          )}
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
