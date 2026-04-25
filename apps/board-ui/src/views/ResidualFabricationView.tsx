import { useState, useMemo } from 'react'
import { useResidualFabrication } from '@/hooks/useResidualFabrication'
import type { ResidualFabricationResult } from '@/types/residual-fabrication'
import { GridTable, type GridTableColumn } from '@/components/ui/GridTable'
import { cn } from '@/lib/utils'

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
      familles: famillesList, prefixes: prefixesList, desired_qty: desiredQty,
      bom_depth_mode: bomDepthMode, stock_mode: stockMode,
      projection_date: stockMode === 'projected' ? projectionDate : undefined,
    })
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = useMemo(() => analyse.data ? [...analyse.data].sort((a, b) => {
    let aVal: string | number | boolean = a[sortKey]
    let bVal: string | number | boolean = b[sortKey]
    if (typeof aVal === 'boolean') aVal = aVal ? 1 : 0
    if (typeof bVal === 'boolean') bVal = bVal ? 1 : 0
    if (typeof aVal === 'number' && typeof bVal === 'number') return sortDir === 'asc' ? aVal - bVal : bVal - aVal
    return sortDir === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal))
  }) : [], [analyse.data, sortKey, sortDir])

  const feasibleCount = sorted.filter(r => r.feasible).length
  const infeasibleCount = sorted.length - feasibleCount

  const columns: GridTableColumn<ResidualFabricationResult>[] = [
    {
      key: 'pf_article', header: 'Article', width: '120px',
      cell: (r) => <span className="font-mono font-semibold">{r.pf_article}</span>,
    },
    {
      key: 'description', header: 'Description', width: '1fr',
      cell: (r) => <span className="text-muted-foreground truncate">{r.description}</span>,
    },
    {
      key: 'feasible', header: 'Statut', align: 'center', width: '70px',
      cell: (r) => (
        <span className={cn('inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium border',
          r.feasible ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
        )}>
          {r.feasible ? 'OK' : 'BLOQUE'}
        </span>
      ),
    },
    {
      key: 'desired_qty', header: 'Qté', align: 'right', width: '70px',
      cell: (r) => <span className="tabular-nums font-mono">{r.desired_qty}</span>,
    },
    {
      key: 'max_feasible_qty', header: 'Max', align: 'right', width: '70px',
      cell: (r) => <span className="tabular-nums font-mono font-semibold">{r.max_feasible_qty}</span>,
    },
    {
      key: 'gaps', header: 'Gaps', align: 'center', width: '70px',
      cell: (r) => r.stock_gaps.length > 0
        ? <span className="text-destructive text-[11px] font-medium">{r.stock_gaps.length}</span>
        : <span className="text-muted-foreground/40 text-[11px]">—</span>,
    },
  ]

  return (
    <div className="max-w-6xl space-y-3">
      <div className="bg-card border border-border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] text-muted-foreground mb-0.5">Familles</label>
            <input type="text" value={familles} onChange={e => setFamilles(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              placeholder="BDS, BDC" className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none focus:border-ring font-mono" />
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-[10px] text-muted-foreground mb-0.5">Prefixes</label>
            <input type="text" value={prefixes} onChange={e => setPrefixes(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
              placeholder="MH, DW..." className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none focus:border-ring font-mono" />
          </div>
          <div className="w-20">
            <label className="block text-[10px] text-muted-foreground mb-0.5">Qté</label>
            <input type="number" value={desiredQty} onChange={e => setDesiredQty(Number(e.target.value))} min={1}
              className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none" />
          </div>
          <div className="w-32">
            <label className="block text-[10px] text-muted-foreground mb-0.5">Nomenclature</label>
            <select value={bomDepthMode} onChange={e => setBomDepthMode(e.target.value as 'full' | 'level1')}
              className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none">
              <option value="full">Complète</option>
              <option value="level1">Niveau 1</option>
            </select>
          </div>
          <div className="w-36">
            <label className="block text-[10px] text-muted-foreground mb-0.5">Stock</label>
            <select value={stockMode} onChange={e => setStockMode(e.target.value as typeof stockMode)}
              className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none">
              <option value="physical">Physique</option>
              <option value="net_releaseable">Net allouable</option>
              <option value="projected">Projeté</option>
            </select>
          </div>
          {stockMode === 'projected' && (
            <div className="w-36">
              <label className="block text-[10px] text-muted-foreground mb-0.5">Date</label>
              <input type="date" value={projectionDate} onChange={e => setProjectionDate(e.target.value)}
                className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none" />
            </div>
          )}
          <button onClick={handleAnalyze} disabled={analyse.isPending}
            className="h-7 px-3 bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50">
            Analyser
          </button>
        </div>
      </div>

      {analyse.error && <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2 text-xs">{analyse.error.message}</div>}
      {analyse.isPending && <div className="flex items-center gap-2 text-xs text-muted-foreground"><div className="w-3 h-3 border-2 border-primary border-t-transparent animate-spin" />Analyse...</div>}
      {!analyse.isPending && !analyse.error && !analyse.data && (
        <div className="py-8 text-center text-xs text-muted-foreground">Saisissez des familles et lancez l'analyse.</div>
      )}

      {analyse.data && (
        <div className="space-y-2">
          <div className="bg-card border border-border p-2 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Fabrication résiduelle</p>
              <p className="text-xs font-semibold">{analyse.data.length} produits finis</p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="text-right"><p className="text-green font-bold text-[14px]">{feasibleCount}</p><p className="text-[9px] text-muted-foreground">OK</p></div>
              <div className="text-right"><p className="text-destructive font-bold text-[14px]">{infeasibleCount}</p><p className="text-[9px] text-muted-foreground">Bloqué</p></div>
            </div>
          </div>
          <GridTable columns={columns} data={sorted} keyExtractor={(r) => r.pf_article} maxHeight="520px" emptyMessage="Aucun résultat." />
        </div>
      )}
    </div>
  )
}
