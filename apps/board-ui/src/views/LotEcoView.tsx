import { useState, useMemo, useEffect, useCallback } from 'react'
import { useLotEco } from '@/hooks/useLotEco'
import { useTableSortFilter } from '@/hooks/useTableSortFilter'
import { LotEcoStats } from '@/components/lot-eco/LotEcoStats'
import { LotEcoTable } from '@/components/lot-eco/LotEcoTable'
import { LotEcoEmptyState } from '@/components/lot-eco/LotEcoEmptyState'
import { LoadingInline, LoadingError } from '@/components/ui/loading'
import { exportLotEcoCSV, exportLotEcoExcel } from '@/lib/loteco-export'
import { LotEcoDetailView } from './LotEcoDetailView'
import type { LotEcoArticle, StatutLot } from '@/types/lot-eco'
import {
  Search, Download, FileSpreadsheet, TrendingDown,
} from 'lucide-react'

type TabKey = 'surdimensionne' | 'sous_dimensionne' | 'ok' | 'demande_nulle' | 'all'

const TAB_ITEMS: Array<{ key: TabKey; label: string; filter: StatutLot | 'ALL' }> = [
  { key: 'surdimensionne', label: 'Surdimensionnés', filter: 'SURDIMENSIONNE' },
  { key: 'sous_dimensionne', label: 'Sous-dimensionnés', filter: 'SOUSDIMENSIONNE' },
  { key: 'ok', label: 'OK', filter: 'OK' },
  { key: 'demande_nulle', label: 'Demande nulle', filter: 'DEMANDE_NULLE' },
  { key: 'all', label: 'Tous', filter: 'ALL' },
]

const PAGE_SIZE = 50

export function LotEcoView() {
  const analyse = useLotEco()
  const [tab, setTab] = useState<TabKey>('surdimensionne')
  const [fournisseur, setFournisseur] = useState<number | 'ALL'>('ALL')
  const [targetCoverage, setTargetCoverage] = useState(4)

  const savedArticle = (typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem('loteco-detail') as string | null
    : null)
  const [selectedArticle, setSelectedArticle] = useState<LotEcoArticle | null>(
    savedArticle ? (JSON.parse(savedArticle) as LotEcoArticle) : null
  )

  useEffect(() => {
    if (selectedArticle) {
      sessionStorage.setItem('loteco-detail', JSON.stringify(selectedArticle))
    }
  }, [selectedArticle])

  const handleBack = () => {
    sessionStorage.removeItem('loteco-detail')
    setSelectedArticle(null)
  }

  const handleAnalyze = useCallback(async () => {
    const data = await analyse.mutateAsync({ targetCoverageWeeks: targetCoverage })
    // Reset to first tab with results
    if (data.nb_surdimensionne > 0) setTab('surdimensionne')
    else if (data.nb_sousdimensionne > 0) setTab('sous_dimensionne')
    else if (data.nb_ok > 0) setTab('ok')
    else setTab('all')
  }, [analyse, targetCoverage])

  const result = analyse.data ?? null

  const fournisseurs = useMemo(() => {
    if (!result) return []
    const map = new Map<number, number>()
    result.articles.forEach((a) => {
      if (a.code_fournisseur) map.set(a.code_fournisseur, (map.get(a.code_fournisseur) || 0) + 1)
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count }))
  }, [result])

  // Filter data by tab + fournisseur before passing to table hook
  const baseData = useMemo(() => {
    if (!result) return []
    const tabDef = TAB_ITEMS.find((t) => t.key === tab)!
    let items = tabDef.filter === 'ALL'
      ? result.articles
      : result.articles.filter((a) => a.statut === tabDef.filter)
    if (fournisseur !== 'ALL') {
      items = items.filter((a) => a.code_fournisseur === fournisseur)
    }
    return items
  }, [result, tab, fournisseur])

  const table = useTableSortFilter<LotEcoArticle>({
    data: baseData,
    pageSize: PAGE_SIZE,
    filterFn: (item, search) => {
      const q = search.toLowerCase()
      return (
        item.article.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        String(item.code_fournisseur).includes(q)
      )
    },
    sortFn: (a, b, key, dir) => {
      const av = a[key as keyof LotEcoArticle]
      const bv = b[key as keyof LotEcoArticle]
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av
      }
      return dir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    },
  })

  const handleExportExcel = () => {
    const rows = table.filtered.filter((a) => table.selected.has(a.article))
    if (rows.length === 0) return
    exportLotEcoExcel(rows)
  }

  const handleExportCSV = () => {
    exportLotEcoCSV(table.filtered)
  }

  const handleToggleAll = () => {
    table.toggleAll(table.paginated.map((a) => a.article))
  }

  if (selectedArticle) {
    return <LotEcoDetailView article={selectedArticle} onBack={handleBack} />
  }

  if (analyse.isPending) {
    return <LoadingInline label="analyse lot éco" sublabel="Calcul de l'adéquation lots vs besoins..." />
  }

  if (analyse.error) {
    return <LoadingError message={analyse.error.message} onRetry={handleAnalyze} />
  }

  if (!result) {
    return <LotEcoEmptyState onAnalyze={handleAnalyze} />
  }

  const tabCounts: Record<TabKey, number> = {
    surdimensionne: result.nb_surdimensionne,
    sous_dimensionne: result.nb_sousdimensionne,
    ok: result.nb_ok,
    demande_nulle: result.nb_demande_nulle,
    all: result.nb_total,
  }

  return (
    <div className="max-w-[1500px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Analyse Lot Éco</h1>
          <p className="text-sm text-stone-500">Adéquation lots de commande vs besoins réels</p>
        </div>
        <div className="flex items-center gap-4 pl-6 border-l border-border">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-stone-500 font-medium">Cible de couverture</span>
              <span className="text-sm font-bold text-primary">{targetCoverage} sem</span>
            </div>
            <input
              type="range"
              min={1}
              max={12}
              step={0.5}
              value={targetCoverage}
              onChange={(e) => { setTargetCoverage(parseFloat(e.target.value)); table.setPage(1) }}
              className="w-36 h-1.5 bg-stone-200 rounded-full appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between w-36 text-[9px] text-stone-400">
              <span>1 sem</span>
              <span>6 sem</span>
              <span>12 sem</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {table.selected.size > 0 && (
            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-2 text-xs text-white bg-primary hover:bg-primary/90 px-4 py-2 rounded-xl font-semibold transition-all shadow-sm"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Exporter {table.selected.size} article{table.selected.size > 1 ? 's' : ''} (.xlsx)
            </button>
          )}
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 text-xs text-stone-500 hover:text-foreground bg-card border border-border px-3 py-1.5 rounded-lg hover:border-stone-300 transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
          <button
            onClick={handleAnalyze}
            className="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm"
          >
            <TrendingDown className="h-4 w-4" />
            Réanalyser
          </button>
        </div>
      </div>

      {/* Stats */}
      <LotEcoStats result={result} />

      {/* Tabs + Filters */}
      <div className="flex items-center justify-between gap-6">
        <div className="flex gap-1 bg-stone-100/80 rounded-xl p-1 backdrop-blur-sm">
          {TAB_ITEMS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); table.setPage(1) }}
              className={`px-3.5 py-2 rounded-lg text-[11px] font-semibold transition-all ${
                tab === t.key
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-stone-500 hover:text-stone-700 hover:bg-white/50'
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[10px] text-stone-400">{tabCounts[t.key]}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {fournisseurs.length > 0 && (
            <div className="relative">
              <select
                value={fournisseur}
                onChange={(e) => { setFournisseur(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)); table.setPage(1) }}
                className="appearance-none bg-card border border-border rounded-lg pl-3 pr-8 py-1.5 text-[11px] text-stone-600 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="ALL">Tous les fournisseurs</option>
                {fournisseurs.map((f) => (
                  <option key={f.code} value={f.code}>
                    Fournisseur {f.code} ({f.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={table.search}
              onChange={(e) => { table.setSearch(e.target.value); table.setPage(1) }}
              className="w-48 pl-8 pr-3 py-1.5 bg-card border border-border rounded-lg text-[11px] text-stone-600 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <LotEcoTable
        data={table.filtered}
        sortKey={table.sortKey as keyof LotEcoArticle}
        sortDir={table.sortDir}
        onSort={(key) => table.toggleSort(key as string)}
        selected={table.selected}
        onToggleOne={table.toggleOne}
        onToggleAll={handleToggleAll}
        onSelectArticle={setSelectedArticle}
        page={table.page}
        onPageChange={table.setPage}
        pageSize={PAGE_SIZE}
      />
    </div>
  )
}
