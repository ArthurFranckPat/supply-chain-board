import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { apiClient, ApiError } from '@/api/client'
import type { LotEcoResponse, LotEcoArticle, StatutLot } from '@/types/lot-eco'
import { LoadingInline, LoadingError, LoadingEmpty } from '@/components/ui/loading'
import { Package, Download, Search, ChevronLeft, ChevronRight, TrendingDown, AlertTriangle, CheckCircle2, Minus, ArrowUpDown, ArrowUp, ArrowDown, FileSpreadsheet } from 'lucide-react'
import { LotEcoDetailView } from './LotEcoDetailView'
import * as XLSX from 'xlsx'

type TabKey = 'surdimensionne' | 'sous_dimensionne' | 'ok' | 'demande_nulle' | 'all'
type SortKey = 'ratio_couverture' | 'demande_hebdo' | 'couverture_lot_semaines' | 'valeur_stock' | 'stock_jours' | 'lot_eco' | 'economie_immobilisation' | 'surcout_unitaire'
type SortDir = 'asc' | 'desc'
const PAGE_SIZE = 50

const TAB_ITEMS: Array<{ key: TabKey; label: string; filter: StatutLot | 'ALL' }> = [
  { key: 'surdimensionne', label: 'Surdimensionnés', filter: 'SURDIMENSIONNE' },
  { key: 'sous_dimensionne', label: 'Sous-dimensionnés', filter: 'SOUSDIMENSIONNE' },
  { key: 'ok', label: 'OK', filter: 'OK' },
  { key: 'demande_nulle', label: 'Demande nulle', filter: 'DEMANDE_NULLE' },
  { key: 'all', label: 'Tous', filter: 'ALL' },
]

function StatutBadge({ statut }: { statut: StatutLot }) {
  const map: Record<StatutLot, { icon: React.ReactNode; label: string; bg: string; text: string; dot: string }> = {
    OK: { icon: <CheckCircle2 className="h-3 w-3" />, label: 'OK', bg: 'bg-green-50', text: 'text-green-800', dot: 'bg-green-500' },
    SURDIMENSIONNE: { icon: <AlertTriangle className="h-3 w-3" />, label: 'Surdimensionné', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    SOUSDIMENSIONNE: { icon: <TrendingDown className="h-3 w-3" />, label: 'Sous-dim.', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    DEMANDE_NULLE: { icon: <Minus className="h-3 w-3" />, label: 'Demande nulle', bg: 'bg-stone-100', text: 'text-stone-500', dot: 'bg-stone-400' },
  }
  const { icon, label, bg, text, dot } = map[statut]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-semibold ${bg} ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {icon}
      {label}
    </span>
  )
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 text-stone-300" />
  return dir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />
}

function fmt(n: number, decimals = 1): string {
  if (n < 0) return '∞'
  return n.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtEuros(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k€`
  return `${n.toFixed(0)}€`
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden w-16">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function exportCSV(data: LotEcoArticle[]) {
  const headers = [
    'Article', 'Description', 'Lot éco', 'Lot optimal', 'Cond.', 'Demande/sem', 'Couv. lot (sem)',
    'Délai réappro (j)', 'Ratio couverture', 'Stock physique', 'Stock dispo', 'Stock (jours)',
    'Statut', 'Nb parents', 'Valeur stock', 'Prix lot éco', 'Prix lot optimal',
    'Economie immobilisation', 'Surcoût unitaire', 'Fournisseur',
  ]
  const rows = data.map(a => [
    a.article, a.description, a.lot_eco, a.lot_optimal,
    a.conditionnements.map(([q, t]) => `${q}${t ? ' ' + t : ''}`).join(', '),
    a.demande_hebdo,
    a.couverture_lot_semaines, a.delai_reappro_jours, a.ratio_couverture,
    a.stock_physique, a.stock_disponible, a.stock_jours,
    a.statut, a.nb_parents, a.valeur_stock,
    a.prix_au_lot_eco, a.prix_au_lot_optimal,
    a.economie_immobilisation, a.surcout_unitaire, a.code_fournisseur,
  ].join(';'))
  const csv = [headers.join(';'), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `analyse_lot_eco_${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

function AnimatedEntry({ children, delay }: { children: React.ReactNode; delay: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  return (
    <div
      ref={ref}
      className="transition-all duration-500 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(12px)',
      }}
    >
      {children}
    </div>
  )
}

export function LotEcoView() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<LotEcoResponse | null>(null)
  const [tab, setTab] = useState<TabKey>('surdimensionne')
  const [sortKey, setSortKey] = useState<SortKey>('ratio_couverture')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [search, setSearch] = useState('')
  const [fournisseur, setFournisseur] = useState<number | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
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
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiClient.analyseLotEco(targetCoverage)
      setResult(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur inattendue')
    } finally {
      setLoading(false)
    }
  }, [targetCoverage])

  const fournisseurs = useMemo(() => {
    if (!result) return []
    const map = new Map<number, number>()
    result.articles.forEach(a => { if (a.code_fournisseur) map.set(a.code_fournisseur, (map.get(a.code_fournisseur) || 0) + 1) })
    return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([code, count]) => ({ code, count }))
  }, [result])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(1)
  }

  const toggleOne = (article: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(article)) next.delete(article)
      else next.add(article)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(a => a.article)))
    }
  }

  const exportExcel = () => {
    const rows = filtered.filter(a => selected.has(a.article))
    if (rows.length === 0) return

    const data = rows.map(a => ({
      'Article': a.article,
      'Description': a.description,
      'Fournisseur': a.code_fournisseur || '',
      'Lot éco': a.lot_eco,
      'Lot optimal': a.lot_optimal,
      'Conditionnements': a.conditionnements.map(([q, t]) => `${q}${t ? ' ' + t : ''}`).join(', '),
      'Demande/sem': a.demande_hebdo,
      'Délai réappro (j)': a.delai_reappro_jours,
      'Couverture lot (sem)': a.couverture_lot_semaines,
      'Ratio couverture': a.ratio_couverture,
      'Stock physique': a.stock_physique,
      'Stock disponible': a.stock_disponible,
      'Stock (jours)': a.stock_jours,
      'Valeur stock': a.valeur_stock,
      'Prix lot éco': a.prix_au_lot_eco,
      'Prix lot optimal': a.prix_au_lot_optimal,
      'Éco. immobilisation': a.economie_immobilisation,
      'Surcoût unitaire': a.surcout_unitaire,
      'Statut': a.statut,
      'Nb parents': a.nb_parents,
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Lot Eco')

    // Column widths
    ws['!cols'] = [
      { wch: 14 }, // Article
      { wch: 35 }, // Description
      { wch: 10 }, // Fournisseur
      { wch: 10 }, // Lot éco
      { wch: 10 }, // Lot optimal
      { wch: 20 }, // Conditionnements
      { wch: 12 }, // Demande/sem
      { wch: 12 }, // Délai
      { wch: 14 }, // Couv lot
      { wch: 10 }, // Ratio
      { wch: 12 }, // Stock physique
      { wch: 12 }, // Stock dispo
      { wch: 10 }, // Stock jours
      { wch: 12 }, // Valeur
      { wch: 14 }, // Prix lot éco
      { wch: 14 }, // Prix lot optimal
      { wch: 16 }, // Éco immob
      { wch: 14 }, // Surcoût
      { wch: 14 }, // Statut
      { wch: 8 },  // Nb parents
    ]

    XLSX.writeFile(wb, `lot_eco_selection_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const filtered = useMemo(() => {
    if (!result) return []
    const tabDef = TAB_ITEMS.find(t => t.key === tab)!
    let items = tabDef.filter === 'ALL'
      ? result.articles
      : result.articles.filter(a => a.statut === tabDef.filter)
    if (fournisseur !== 'ALL') {
      items = items.filter(a => a.code_fournisseur === fournisseur)
    }
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(a =>
        a.article.toLowerCase().includes(q)
        || a.description.toLowerCase().includes(q)
        || String(a.code_fournisseur).includes(q)
      )
    }
    return [...items].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [result, tab, sortKey, sortDir, search, fournisseur])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  if (safePage !== page) setPage(safePage)
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const totalValeurSurdim = result?.articles
    .filter(a => a.statut === 'SURDIMENSIONNE')
    .reduce((s, a) => s + a.valeur_stock, 0) ?? 0

  const totalEcoImmobilisation = result?.articles
    .filter(a => a.statut === 'SURDIMENSIONNE')
    .reduce((s, a) => s + a.economie_immobilisation, 0) ?? 0

  const maxValeur = useMemo(() => {
    if (!result) return 1
    return Math.max(...result.articles.map(a => a.valeur_stock), 1)
  }, [result])

  const maxEco = useMemo(() => {
    if (!result) return 1
    return Math.max(...result.articles.map(a => Math.abs(a.economie_immobilisation)), 1)
  }, [result])

  const HeaderCell = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <th
      className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-3 px-4 cursor-pointer select-none hover:text-stone-600 transition-colors whitespace-nowrap"
      onClick={() => toggleSort(colKey)}
    >
      <span className="inline-flex items-center gap-1.5">
        {label}
        <SortIcon active={sortKey === colKey} dir={sortDir} />
      </span>
    </th>
  )

  if (selectedArticle) {
    return <LotEcoDetailView article={selectedArticle} onBack={handleBack} />
  }

  if (loading) return <LoadingInline label="analyse lot éco" sublabel="Calcul de l'adéquation lots vs besoins..." />

  if (error) return <LoadingError message={error} onRetry={handleAnalyze} />

  if (!result) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <AnimatedEntry delay={0}>
          <div className="text-center max-w-md space-y-6">
            <div className="relative mx-auto w-20 h-20">
              <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping" />
              <div className="relative bg-card border border-border rounded-2xl w-20 h-20 flex items-center justify-center shadow-sm">
                <Package className="h-9 w-9 text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-foreground tracking-tight">Analyse des lots économiques</h2>
              <p className="text-sm text-stone-500 leading-relaxed">
                Compare les lots économiques de réapprovisionnement avec les besoins réels des composants achetés.
              </p>
            </div>
            <button
              onClick={handleAnalyze}
              className="inline-flex items-center gap-2 bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all hover:shadow-md active:scale-[0.98]"
            >
              <TrendingDown className="h-4 w-4" />
              Lancer l'analyse
            </button>
          </div>
        </AnimatedEntry>
      </div>
    )
  }

  const stats = [
    { label: 'Total', value: result.nb_total, icon: Package, color: 'text-stone-600', bg: 'bg-stone-100' },
    { label: 'Surdimensionnés', value: result.nb_surdimensionne, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Sous-dimensionnés', value: result.nb_sousdimensionne, icon: TrendingDown, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'OK', value: result.nb_ok, icon: CheckCircle2, color: 'text-green-700', bg: 'bg-green-50' },
  ]

  return (
    <div className="max-w-[1500px] mx-auto space-y-8">
      {/* Page header */}
      <AnimatedEntry delay={0}>
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
                onChange={e => { setTargetCoverage(parseFloat(e.target.value)); setPage(1) }}
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
            {selected.size > 0 && (
              <button
                onClick={exportExcel}
                className="inline-flex items-center gap-2 text-xs text-white bg-primary hover:bg-primary/90 px-4 py-2 rounded-xl font-semibold transition-all shadow-sm"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Exporter {selected.size} article{selected.size > 1 ? 's' : ''} (.xlsx)
              </button>
            )}
            <button
              onClick={() => exportCSV(filtered)}
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
      </AnimatedEntry>

      {/* Summary stats */}
      <AnimatedEntry delay={100}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => {
            const Icon = stat.icon
            return (
              <div key={stat.label} className="relative overflow-hidden bg-card border border-border rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="space-y-3">
                    <p className="text-xs text-stone-400 font-medium uppercase tracking-wide">{stat.label}</p>
                    <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl ${stat.bg}`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
                {stat.label === 'Surdimensionnés' && result.nb_surdimensionne > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-[10.5px] text-stone-500">
                      <span>Valeur bloquée</span>
                      <span className="font-semibold text-red-600">{fmtEuros(totalValeurSurdim)}</span>
                    </div>
                    <MiniBar value={totalValeurSurdim} max={maxValeur * 3} color="bg-red-400" />
                  </div>
                )}
                {stat.label === 'OK' && result.nb_ok > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-[10.5px] text-stone-500">
                      <span>Éco. potentielle</span>
                      <span className="font-semibold text-primary">{fmtEuros(totalEcoImmobilisation)}</span>
                    </div>
                    <MiniBar value={totalEcoImmobilisation} max={maxEco * 3} color="bg-primary" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </AnimatedEntry>

      {/* Tabs */}
      <AnimatedEntry delay={200}>
        <div className="flex items-center justify-between gap-6">
          <div className="flex gap-1 bg-stone-100/80 rounded-xl p-1 backdrop-blur-sm">
            {TAB_ITEMS.map((t, i) => {
              const count = t.key === 'surdimensionne' ? result.nb_surdimensionne
                : t.key === 'sous_dimensionne' ? result.nb_sousdimensionne
                : t.key === 'ok' ? result.nb_ok
                : t.key === 'demande_nulle' ? result.nb_demande_nulle
                : result.nb_total
              const pct = result.nb_total > 0 ? (count / result.nb_total) * 100 : 0
              const isActive = tab === t.key

              let barColor = 'bg-stone-300'
              if (t.key === 'surdimensionne') barColor = 'bg-red-400'
              else if (t.key === 'sous_dimensionne') barColor = 'bg-amber-400'
              else if (t.key === 'ok') barColor = 'bg-green-500'

              return (
                <button
                  key={t.key}
                  onClick={() => { setTab(t.key); setPage(1) }}
                  className={`relative px-4 py-2 rounded-lg text-[12px] font-semibold transition-all ${
                    isActive
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-stone-500 hover:text-stone-700'
                  }`}
                >
                  <span className="relative z-10">{t.label}</span>
                  {count > 0 && (
                    <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      isActive ? 'bg-primary/10 text-primary' : 'bg-stone-200 text-stone-500'
                    }`}>
                      {count}
                    </span>
                  )}
                  {!isActive && count > 0 && (
                    <span
                      className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${barColor}`}
                      style={{ width: `${pct}%`, margin: '0 auto' }}
                    />
                  )}
                </button>
              )
            })}
          </div>
          <span className="text-[11px] text-stone-400 shrink-0">
            {filtered.length} article{filtered.length > 1 ? 's' : ''}
          </span>
        </div>
      </AnimatedEntry>

      {/* Search + filter */}
      <AnimatedEntry delay={300}>
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <input
              type="text"
              placeholder="Rechercher article, description, fournisseur..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 placeholder:text-stone-400 transition-all"
            />
          </div>
          <select
            value={fournisseur === 'ALL' ? 'ALL' : fournisseur}
            onChange={e => { setFournisseur(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value)); setPage(1) }}
            className="text-sm bg-card border border-border rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground transition-all cursor-pointer"
          >
            <option value="ALL">Tous les fournisseurs</option>
            {fournisseurs.map(f => (
              <option key={f.code} value={f.code}>Fourn. {f.code} ({f.count})</option>
            ))}
          </select>
        </div>
      </AnimatedEntry>

      {/* Table */}
      {filtered.length === 0 ? (
        <AnimatedEntry delay={400}>
          <LoadingEmpty message="Aucun article dans cette catégorie" />
        </AnimatedEntry>
      ) : (
        <AnimatedEntry delay={400}>
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-stone-50/50">
                  <tr>
                    <th className="py-3 pl-4 pr-2">
                      <input
                        type="checkbox"
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/40 cursor-pointer"
                      />
                    </th>
                    <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-3 px-4">Article</th>
                    <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-3 px-4">Description</th>
                    <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-3 px-4">Fourn.</th>
                    <HeaderCell label="Lot éco" colKey="lot_eco" />
                    <HeaderCell label="Lot opt." colKey="economie_immobilisation" />
                    <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-3 px-4">Cond.</th>
                    <HeaderCell label="Dem./sem" colKey="demande_hebdo" />
                    <HeaderCell label="Délai" colKey="ratio_couverture" />
                    <HeaderCell label="Ratio" colKey="ratio_couverture" />
                    <HeaderCell label="Prix lot" colKey="economie_immobilisation" />
                    <HeaderCell label="Prix opt." colKey="surcout_unitaire" />
                    <HeaderCell label="Éco. immob." colKey="economie_immobilisation" />
                    <HeaderCell label="Surcoût/u" colKey="surcout_unitaire" />
                    <HeaderCell label="Stock" colKey="stock_jours" />
                    <HeaderCell label="Valeur" colKey="valeur_stock" />
                    <th className="text-left text-[10.5px] font-semibold text-stone-400 uppercase tracking-wider py-3 px-4">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {paged.map((a, rowIdx) => (
                    <tr
                      key={a.article}
                      className={`group transition-colors ${selected.has(a.article) ? 'bg-primary/[0.04]' : 'hover:bg-stone-50/80'} cursor-pointer`}
                      style={{ animationDelay: `${rowIdx * 20}ms` }}
                      onClick={() => setSelectedArticle(a)}
                    >
                      <td className="py-3 pl-4 pr-2" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(a.article)}
                          onChange={() => toggleOne(a.article)}
                          className="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/40 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-semibold text-foreground text-[11.5px]">{a.article}</span>
                      </td>
                      <td className="py-3 px-4 max-w-[200px]">
                        <span className="text-stone-500 truncate block" title={a.description}>{a.description}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] text-stone-400">{a.code_fournisseur || '—'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px]">{a.lot_eco.toLocaleString('fr-FR')}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] font-semibold text-primary">{a.lot_optimal.toLocaleString('fr-FR')}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] text-stone-400">
                          {a.conditionnements.length > 0 ? a.conditionnements.map(([q, t]) => `${q.toLocaleString('fr-FR')}${t ? ' ' + t : ''}`).join(' | ') : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px]">{fmt(a.demande_hebdo)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] text-stone-500">{a.delai_reappro_jours}j</span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-bold text-[11.5px] ${
                            a.ratio_couverture > 3 ? 'text-red-600'
                            : a.ratio_couverture > 1.5 ? 'text-amber-600'
                            : a.ratio_couverture < 0.5 ? 'text-amber-600'
                            : 'text-green-700'
                          }`}>
                            {fmt(a.ratio_couverture, 1)}x
                          </span>
                          <MiniBar
                            value={Math.min(a.ratio_couverture, 5)}
                            max={5}
                            color={a.ratio_couverture > 3 ? 'bg-red-400' : a.ratio_couverture > 1.5 ? 'bg-amber-400' : a.ratio_couverture < 0.5 ? 'bg-amber-400' : 'bg-green-500'}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] text-stone-500">{a.prix_au_lot_eco > 0 ? a.prix_au_lot_eco.toFixed(4) : '—'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] text-stone-500">{a.prix_au_lot_optimal > 0 ? a.prix_au_lot_optimal.toFixed(4) : '—'}</span>
                      </td>
                      <td className="py-3 px-4">
                        {a.economie_immobilisation > 0 ? (
                          <span className="font-mono text-[11px] font-semibold text-green-700">{fmtEuros(a.economie_immobilisation)}</span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {a.prix_au_lot_eco > 0 ? (
                          <span className={`font-mono text-[11px] font-semibold ${
                            a.surcout_unitaire > 0 ? 'text-amber-600' : a.surcout_unitaire < 0 ? 'text-green-700' : 'text-stone-500'
                          }`}>
                            {a.surcout_unitaire > 0 ? '+' : ''}{a.surcout_unitaire.toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px]">{a.stock_disponible.toLocaleString('fr-FR')}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] text-stone-600">{fmtEuros(a.valeur_stock)}</span>
                      </td>
                      <td className="py-3 px-4">
                        <StatutBadge statut={a.statut} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border px-6 py-4 bg-stone-50/50">
                <span className="text-[11px] text-stone-400">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} sur {filtered.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="p-2 rounded-lg hover:bg-stone-200 disabled:opacity-30 disabled:cursor-default transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4 text-stone-600" />
                  </button>
                  <div className="flex items-center gap-1 px-3">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (safePage <= 3) {
                        pageNum = i + 1
                      } else if (safePage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = safePage - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 rounded-lg text-[11px] font-semibold transition-all ${
                            safePage === pageNum
                              ? 'bg-primary text-white shadow-sm'
                              : 'text-stone-500 hover:bg-stone-200'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="p-2 rounded-lg hover:bg-stone-200 disabled:opacity-30 disabled:cursor-default transition-colors"
                  >
                    <ChevronRight className="h-4 w-4 text-stone-600" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </AnimatedEntry>
      )}
    </div>
  )
}
