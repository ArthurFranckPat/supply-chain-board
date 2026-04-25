import { useState, useMemo, useEffect, useCallback } from 'react'
import { useLotEco } from '@/hooks/useLotEco'
import { useTableSortFilter } from '@/hooks/useTableSortFilter'
import { LotEcoStats } from '@/components/lot-eco/LotEcoStats'
import { LotEcoTable } from '@/components/lot-eco/LotEcoTable'
import { LotEcoEmptyState } from '@/components/lot-eco/LotEcoEmptyState'
import { LoadingInline, LoadingError } from '@/components/ui/loading'
import { exportLotEcoCSV } from '@/lib/loteco-export'
import { LotEcoDetailView } from './LotEcoDetailView'
import type { LotEcoArticle, StatutLot } from '@/types/lot-eco'

type TabKey = 'surdimensionne' | 'sous_dimensionne' | 'ok' | 'demande_nulle' | 'all'

const TAB_ITEMS: Array<{ key: TabKey; label: string; filter: StatutLot | 'ALL' }> = [
  { key: 'surdimensionne', label: 'Surdim.', filter: 'SURDIMENSIONNE' },
  { key: 'sous_dimensionne', label: 'Sous-dim.', filter: 'SOUSDIMENSIONNE' },
  { key: 'ok', label: 'OK', filter: 'OK' },
  { key: 'demande_nulle', label: 'Nulle', filter: 'DEMANDE_NULLE' },
  { key: 'all', label: 'Tous', filter: 'ALL' },
]

const PAGE_SIZE = 50

export function LotEcoView() {
  const analyse = useLotEco()
  const [tab, setTab] = useState<TabKey>('surdimensionne')
  const [fournisseur, setFournisseur] = useState<number | 'ALL'>('ALL')
  const [targetCoverage, setTargetCoverage] = useState(4)

  const savedArticle = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('loteco-detail') as string | null : null
  const [selectedArticle, setSelectedArticle] = useState<LotEcoArticle | null>(savedArticle ? JSON.parse(savedArticle) : null)

  useEffect(() => { if (selectedArticle) sessionStorage.setItem('loteco-detail', JSON.stringify(selectedArticle)) }, [selectedArticle])

  const handleBack = () => { sessionStorage.removeItem('loteco-detail'); setSelectedArticle(null) }

  const handleAnalyze = useCallback(async () => {
    const data = await analyse.mutateAsync({ targetCoverageWeeks: targetCoverage })
    if (data.nb_surdimensionne > 0) setTab('surdimensionne')
    else if (data.nb_sousdimensionne > 0) setTab('sous_dimensionne')
    else if (data.nb_ok > 0) setTab('ok')
    else setTab('all')
  }, [analyse, targetCoverage])

  const result = analyse.data ?? null

  const fournisseurs = useMemo(() => {
    if (!result) return []
    const map = new Map<number, number>()
    result.articles.forEach(a => { if (a.code_fournisseur) map.set(a.code_fournisseur, (map.get(a.code_fournisseur) || 0) + 1) })
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count }))
  }, [result])

  const baseData = useMemo(() => {
    if (!result) return []
    const tabDef = TAB_ITEMS.find(t => t.key === tab)!
    let items = tabDef.filter === 'ALL' ? result.articles : result.articles.filter(a => a.statut === tabDef.filter)
    if (fournisseur !== 'ALL') items = items.filter(a => a.code_fournisseur === fournisseur)
    return items
  }, [result, tab, fournisseur])

  const table = useTableSortFilter<LotEcoArticle>({
    data: baseData, pageSize: PAGE_SIZE,
    filterFn: (item, search) => {
      const q = search.toLowerCase()
      return item.article.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) || String(item.code_fournisseur).includes(q)
    },
    sortFn: (a, b, key, dir) => {
      const av = a[key as keyof LotEcoArticle]; const bv = b[key as keyof LotEcoArticle]
      if (typeof av === 'number' && typeof bv === 'number') return dir === 'asc' ? av - bv : bv - av
      return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av))
    },
  })

  const handleToggleAll = () => { table.toggleAll(table.paginated.map(a => a.article)) }

  if (selectedArticle) return <LotEcoDetailView article={selectedArticle} onBack={handleBack} />
  if (analyse.isPending) return <LoadingInline label="analyse lot éco" />
  if (analyse.error) return <LoadingError message={analyse.error.message} onRetry={handleAnalyze} />
  if (!result) return <LotEcoEmptyState onAnalyze={handleAnalyze} />

  const tabCounts: Record<TabKey, number> = {
    surdimensionne: result.nb_surdimensionne, sous_dimensionne: result.nb_sousdimensionne,
    ok: result.nb_ok, demande_nulle: result.nb_demande_nulle, all: result.nb_total,
  }

  return (
    <div className="max-w-[1400px] space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[14px] font-bold">Analyse Lot Éco</h1>
          <p className="text-[10px] text-muted-foreground">Adéquation lots vs besoins</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Couverture {targetCoverage} sem</span>
          <input type="range" min={1} max={12} step={0.5} value={targetCoverage} onChange={e => { setTargetCoverage(parseFloat(e.target.value)); table.setPage(1) }} className="w-24" />
          <button onClick={handleAnalyze} className="h-6 px-2 bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90">Réanalyser</button>
          <button onClick={() => exportLotEcoCSV(table.filtered)} className="h-6 px-2 border border-border text-[11px] text-muted-foreground hover:bg-muted">CSV</button>
        </div>
      </div>

      <LotEcoStats result={result} />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-0 border border-border">
          {TAB_ITEMS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); table.setPage(1) }}
              className={`h-6 px-2 text-[11px] font-medium border-r border-border last:border-r-0 ${tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}>
              {t.label} <span className="text-[10px] opacity-70">{tabCounts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {fournisseurs.length > 0 && (
            <select value={fournisseur} onChange={e => { setFournisseur(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)); table.setPage(1) }}
              className="h-7 px-2 text-[11px] border border-border bg-card outline-none">
              <option value="ALL">Tous fourn.</option>
              {fournisseurs.map(f => <option key={f.code} value={f.code}>Fourn. {f.code} ({f.count})</option>)}
            </select>
          )}
          <input type="text" placeholder="Rechercher..." value={table.search} onChange={e => { table.setSearch(e.target.value); table.setPage(1) }}
            className="h-7 px-2 text-[11px] border border-border bg-card outline-none w-40 placeholder:text-muted-foreground" />
        </div>
      </div>

      <LotEcoTable data={table.filtered} sortKey={table.sortKey as keyof LotEcoArticle} sortDir={table.sortDir}
        onSort={key => table.toggleSort(key as string)} selected={table.selected} onToggleOne={table.toggleOne}
        onToggleAll={handleToggleAll} onSelectArticle={setSelectedArticle} page={table.page} onPageChange={table.setPage} pageSize={PAGE_SIZE} />
    </div>
  )
}
