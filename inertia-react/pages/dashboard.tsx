import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { fr } from 'react-day-picker/locale'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { toast } from 'sonner'

import AppLayout from '@r/layouts/app'
import { Calendar } from '@r/components/ui/calendar'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { usePrintFitPage } from '@r/lib/board/use-print-fit-page'
import { cn } from '@r/lib/utils'
import {
  DEFAULT_DASHBOARD_LAYOUT,
  KPI_TITLES,
  normalizeDashboardLayout,
  type DashboardLayout,
  type KpiId,
  type KpiWidth,
} from '@/lib/dashboard/types'
import { useLayoutStore } from '@r/lib/dashboard/layout-store'
import { Eye, EyeOff, GripVertical, ArrowUp, ArrowDown, LoaderCircle, Calendar as CalendarIcon, X, Search, ChevronDown, ChevronRight } from 'lucide-react'
import { DynamicIcon } from '../components/ui/dynamic-icon'

/**
 * Tableau de bord (issue #26 shell + #38 KPI). Landing par défaut post-login.
 *
 * Coquille rendue instantanément ; les KPI « charge en retard » + liste des lignes
 * en retard (calcul lourd : statuts + charge gamme depuis X3) sont chargés en différé
 * par fetch JSON sur `kpisHref`. Même motif que /suivi (scheduler/tracking).
 *
 * Port React du Solid inertia/pages/dashboard.tsx — structure identique
 * (sous-composants inline), store zustand pour le layout, DnD HTML5 natif.
 */

// ═════════════════════════════════════════════════════════════════════════ Types
interface RetardLigne {
  numCommande: string
  client: string
  article: string
  designation: string
  type: string
  dateExp: string
  dateExpIso: string | null
  qteRestante: number
  heures: number
  postes: string[]
}

interface RetardChargeKpi {
  totalHeures: number
  nbLignes: number
  postes: { code: string; label: string; heures: number }[]
  lignes: RetardLigne[]
}

interface OtdLigneDtl {
  numCommande: string
  client: string
  article: string
  posteDeCharge: string | null
  dateExpHisto: string
  qteCmde: number
  qteLivree: number
  estComplet: boolean
  estPonctuel: boolean
}

type OtdMode = 'demandee' | 'acceptee'

interface OtdKpi {
  label: string
  mode: OtdMode
  nbTotal: number
  nbOtif: number
  tauxOtif: number
  lignesNon: OtdLigneDtl[]
}

interface DashboardKpisResponse {
  retardCharge: RetardChargeKpi
  x3Error: string | null
  referenceDate: string
}

interface DashboardOtdResponse {
  otd: OtdKpi[]
  x3Error: string | null
}

interface StockValuationPoint {
  periode: string
  label: string
  valeur: number
  qte: number
}

interface StockCategorieRow {
  categorie: string
  valeur: number
  part: number
}

interface StockArticleRow {
  article: string
  designation: string
  categorie: string
  stock: number
  pmp: number
  valeur: number
}

type StockGrain = 'mois' | 'semaine'

interface StockValuationKpi {
  grain: StockGrain
  series: StockValuationPoint[]
  totalActuel: number
  totalDebut: number
  deltaPct: number
  categories: StockCategorieRow[]
  articles: StockArticleRow[]
  nbArticles: number
}

interface DashboardStockResponse {
  stockValuation: StockValuationKpi
  x3Error: string | null
}

interface DashboardProps {
  referenceDate: string
  kpisHref: string
  otdHref: string
  stockHref: string
  layout?: DashboardLayout
}

// ═════════════════════════════════════════════════════════════════════════ Constants
const EMPTY_KPIS: DashboardKpisResponse = {
  retardCharge: { totalHeures: 0, nbLignes: 0, postes: [], lignes: [] },
  x3Error: null,
  referenceDate: '',
}

const EMPTY_OTD: DashboardOtdResponse = { otd: [], x3Error: null }

const EMPTY_STOCK: StockValuationKpi = {
  grain: 'mois',
  series: [],
  totalActuel: 0,
  totalDebut: 0,
  deltaPct: 0,
  categories: [],
  articles: [],
  nbArticles: 0,
}

/** Palette des barres par rang de poste (du plus chargé au moins chargé). */
const BAR_PALETTE = ['#b23b2e', '#cf6a3f', '#b8862c', '#cdb079', '#a8a18c']
/** Palette des catégories de stock (bleus/verts, distincte du rouge « charge »). */
const STOCK_PALETTE = ['#2d6a8f', '#3a8a5f', '#5b9a8f', '#8fae8f', '#a8a18c']

/** Classes de largeur statiques (purge Tailwind). 1 = 1/3, 2 = 2/3, 3 = plein. */
const WIDTH_CLASS: Record<KpiWidth, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
}

// ═════════════════════════════════════════════════════════════════════════ Helpers
const fmtDay = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

const fmtEuro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

function otdColor(taux: number, nbTotal: number): string {
  if (nbTotal === 0) return '#a8a18c'
  if (taux >= 90) return '#2d7a4f'
  if (taux >= 70) return '#b8862c'
  return '#b23b2e'
}

// ═════════════════════════════════════════════════════════════════════════ Components
/** En-tête de card lisible : pastille d'accent + titre Fraunces + suffixe mono optionnel. */
function CardHeader({
  title,
  suffix,
  tone,
  onHide,
}: {
  title: string
  suffix?: string
  tone?: string
  onHide?: () => void
}) {
  return (
    <div className="mb-4 flex items-center gap-2.5 border-b border-rule-soft pb-3">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: tone ?? 'var(--color-destructive, #b23b2e)' }}
      />
      <h2 className="font-fraunces text-[16px] font-semibold leading-none tracking-tight text-foreground">
        {title}
      </h2>
      <div className="ml-auto flex items-center gap-2.5">
        {suffix && (
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {suffix}
          </span>
        )}
        {onHide && (
          <button
            type="button"
            onClick={onHide}
            className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground print:hidden"
            title="Masquer ce KPI"
            aria-label={`Masquer le KPI ${title}`}
          >
            <Eye size={15} />
          </button>
        )}
      </div>
    </div>
  )
}

/** Mini-graphique 12 mois en colonnes verticales (SVG inline, pas de lib).
 *  Hauteur ∝ valeur ; dernière colonne surlignée (mois courant). */
function StockSparkline({ series }: { series: StockValuationPoint[] }) {
  const W = 240
  const H = 56
  const PAD = 4
  const innerH = H - PAD * 2
  const max = useMemo(() => Math.max(1, ...series.map((s) => Math.abs(s.valeur))), [series])
  const gap = 2
  const barW = useMemo(() => {
    const n = series.length || 1
    return (W - gap * (n - 1) - PAD * 2) / n
  }, [series.length])

  return (
    <div className="mt-5" style={{ 'WebkitPrintColorAdjust': 'exact', 'print-color-adjust': 'exact' } as React.CSSProperties}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ height: '56px' }}
      >
        {series.map((pt, i) => {
          const h = Math.max(2, (Math.abs(pt.valeur) / max) * innerH)
          const x = PAD + i * (barW + gap)
          const y = H - PAD - h
          const isLast = i === series.length - 1
          return (
            <rect
              key={pt.periode}
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={1.5}
              fill={isLast ? '#2d6a8f' : '#c4d3da'}
            >
              <title>{`${pt.label} · ${pt.valeur.toFixed(0)} €`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[8.5px] text-muted-foreground/70">
        <span>{series[0]?.label}</span>
        <span>{series[series.length - 1]?.label}</span>
      </div>
    </div>
  )
}

/** Placeholder pour un KPI masqué. En mode édition, il reste un tile réordonnable
 * (pour le replacer) ; hors édition, il est masqué à l'impression. */
function HiddenTile({ id, editMode, onShow }: { id: KpiId; editMode: boolean; onShow: () => void }) {
  // Affiché uniquement en mode édition : sinon le KPI masqué disparaît totalement.
  if (!editMode) return null
  return (
    <div className="lg:col-span-1" style={{ order: 999 } as React.CSSProperties}>
      <div className="flex items-center gap-2 rounded border border-dashed border-rule bg-secondary/30 px-4 py-3 print:hidden">
        <EyeOff size={15} className="text-muted-foreground" />
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {KPI_TITLES[id]}
        </span>
        <span className="font-fraunces text-[12px] italic text-muted-foreground/70">— masqué</span>
        <button
          type="button"
          onClick={onShow}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Eye size={13} />
          <span>Afficher</span>
        </button>
      </div>
    </div>
  )
}

/**
 * Conteneur de KPI pilotant la disposition : largeur discrète (col-span sur la
 * grille 3 colonnes), ordre CSS (écran vs impression via `order`), et en mode
 * édition, poignée de drag, sélecteur de largeur, flèches d'ordre d'impression
 * et badge de numéro d'impression.
 */
function Tile({
  id,
  children,
  editMode,
  screenRank,
  printRank,
  width,
  onWidth,
  onPrintMove,
  draggedId,
  dropTargetId,
  setDraggedId,
  setDropTargetId,
  onDrop,
}: {
  id: KpiId
  children: React.ReactNode
  editMode: boolean
  screenRank: number
  printRank: number
  width: KpiWidth
  onWidth: (w: KpiWidth) => void
  onHide: () => void
  onPrintMove: (dir: -1 | 1) => void
  draggedId: KpiId | null
  dropTargetId: KpiId | null
  setDraggedId: (v: KpiId | null) => void
  setDropTargetId: (v: KpiId | null) => void
  onDrop: () => void
}) {
  const isDropTarget = dropTargetId === id && draggedId !== null && draggedId !== id

  return (
    <div
      className={cn(
        'kpi-tile relative',
        WIDTH_CLASS[width],
        editMode && 'cursor-grab rounded ring-1 ring-brand/30 active:cursor-grabbing',
        isDropTarget && 'ring-2 ring-brand'
      )}
      style={{ '--screen-order': screenRank, '--print-order': printRank } as React.CSSProperties}
      draggable={editMode}
      onDragStart={(e) => {
        setDraggedId(id)
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', id)
        }
      }}
      onDragEnd={() => {
        setDraggedId(null)
        setDropTargetId(null)
      }}
      onDragOver={(e) => {
        // CRITIQUE : en HTML5 DnD, un `drop` ne se déclenche QUE si dragover a
        // appelé preventDefault(). On le fait TOUJOURS en mode édition (on ne
        // dépend pas du signal draggedId qui peut ne pas être propagé à temps),
        // sinon le navigateur refuse définitivement le drop sur cette cible.
        if (!editMode) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        if (draggedId && draggedId !== id) setDropTargetId(id)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDropTargetId(null)
        if (draggedId && draggedId !== id) onDrop()
      }}
    >
      {/* Barre d'outils édition (poignée + largeur + ordre impression + masquer) */}
      {editMode && (
        <>
          <div className="pointer-events-none absolute -top-3 left-3 z-10 flex items-center gap-1 rounded border border-rule bg-card px-1.5 py-0.5 shadow-sm print:hidden">
            <span className="text-muted-foreground" title="Glisser pour réordonner">
              <GripVertical size={14} />
            </span>
            {/* Sélecteur de largeur discret */}
            <div className="pointer-events-auto flex items-center rounded border border-rule bg-secondary px-0.5">
              {([1, 2, 3] as KpiWidth[]).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => onWidth(w)}
                  className={cn(
                    'rounded px-1 py-0.5 font-mono text-[9px] font-bold transition-colors',
                    width === w
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  title={w === 1 ? '1/3' : w === 2 ? '2/3' : 'Pleine largeur'}
                >
                  {w === 1 ? '⅓' : w === 2 ? '⅔' : '▭'}
                </button>
              ))}
            </div>
          </div>
          {/* Badge numéro d'impression + flèches d'ordre d'impression */}
          <div className="pointer-events-none absolute -top-3 right-3 z-10 flex items-center gap-0.5 rounded border border-rule bg-card px-1.5 py-0.5 shadow-sm print:hidden">
            <button
              type="button"
              onClick={() => onPrintMove(-1)}
              className="pointer-events-auto text-muted-foreground hover:text-foreground"
              title="Monter dans l'ordre d'impression"
              aria-label="Monter dans l'ordre d'impression"
            >
              <ArrowUp size={13} />
            </button>
            <span className="font-mono text-[9px] font-bold tabular-nums text-brand" title="Ordre d'impression">
              #{printRank + 1}
            </span>
            <button
              type="button"
              onClick={() => onPrintMove(1)}
              className="pointer-events-auto text-muted-foreground hover:text-foreground"
              title="Descendre dans l'ordre d'impression"
              aria-label="Descendre dans l'ordre d'impression"
            >
              <ArrowDown size={13} />
            </button>
          </div>
        </>
      )}
      {/* Badge numéro d'impression — visible uniquement à l'impression (évite le
          chevauchement avec le bouton masquer du CardHeader à l'écran). */}
      {!editMode && (
        <span
          className="absolute right-3 top-3 z-10 hidden rounded bg-secondary/80 px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums text-muted-foreground print:block"
          title="Ordre d'impression"
        >
          {printRank + 1}
        </span>
      )}
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex h-[180px] items-center justify-center">
      <LoaderCircle className="animate-spin text-muted-foreground/50" size={22} />
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════ Main
export default function Dashboard(props: DashboardProps) {
  // Store layout (zustand) — sync avec props au mount + persistance localStorage
  const layoutFromProps = useMemo(
    () => normalizeDashboardLayout(props.layout) ?? DEFAULT_DASHBOARD_LAYOUT,
    [props.layout]
  )
  const {
    items,
    printOrder,
    setLayout,
    setVisible: setStoreVisible,
    setWidth: setStoreWidth,
    moveItem: moveStoreItem,
    movePrint: moveStorePrint,
    layoutItem,
    isVisible: getIsVisible,
    printRank: getPrintRank,
    screenRank: getScreenRank,
  } = useLayoutStore()

  // Sync initial layout from props (une seule fois au mount)
  useEffect(() => {
    setLayout(layoutFromProps)
  }, [layoutFromProps, setLayout])

  // Wrap actions with store methods
  const setVisible = useCallback((id: KpiId, visible: boolean) => setStoreVisible(id, visible), [setStoreVisible])
  const setWidth = useCallback((id: KpiId, width: KpiWidth) => setStoreWidth(id, width), [setStoreWidth])
  const moveItem = useCallback((draggedId: KpiId, targetId: KpiId) => moveStoreItem(draggedId, targetId), [moveStoreItem])
  const movePrint = useCallback((id: KpiId, dir: -1 | 1) => moveStorePrint(id, dir), [moveStorePrint])
  const isVisible = useCallback((id: KpiId) => getIsVisible(id), [getIsVisible])

  // ----- Local state -----
  const [otdMode, setOtdMode] = useState<OtdMode>('demandee')
  const [otdRange, setOtdRange] = useState<{ start: Date | null; end: Date | null } | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [clientFilter, setClientFilter] = useState('')
  const [debouncedClient, setDebouncedClient] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [draggedId, setDraggedId] = useState<KpiId | null>(null)
  const [dropTargetId, setDropTargetId] = useState<KpiId | null>(null)

  // Stock filters
  const [stockSearch, setStockSearch] = useState('')
  const [stockCatFilter, setStockCatFilter] = useState('')
  const [stockHideZero, setStockHideZero] = useState(false)
  const [stockSortBy, setStockSortBy] = useState<'valeur' | 'stock' | 'article' | 'categorie'>('valeur')
  const [stockSortDir, setStockSortDir] = useState<'asc' | 'desc'>('desc')
  const [stockGrain, setStockGrain] = useState<StockGrain>('mois')
  const [stockRange, setStockRange] = useState<{ start: Date | null; end: Date | null } | null>(null)
  const [stockCalendarOpen, setStockCalendarOpen] = useState(false)

  // Ref pour le contenu imprimable
  const contentElRef = useRef<HTMLDivElement>(null)
  usePrintFitPage(() => contentElRef.current)

  // ----- Debounce client filter -----
  useEffect(() => {
    const t = setTimeout(() => setDebouncedClient(clientFilter), 350)
    return () => clearTimeout(t)
  }, [clientFilter])

  // ----- Persistance du layout (debounce 600 ms) -----
  useEffect(() => {
    const timer = setTimeout(() => {
      const layout: DashboardLayout = { items, printOrder }
      fetch('/api/v1/user/dashboard-layout', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(layout),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(() => toast.success('Disposition enregistrée', { duration: 1800 }))
        .catch(() => toast.error('Disposition non enregistrée'))
    }, 600)
    return () => clearTimeout(timer)
  }, [items, printOrder])

  // ----- URLs -----
  const otdUrl = useMemo(() => {
    let url = `${props.otdHref}&otdMode=${otdMode}`
    const c = debouncedClient.trim()
    if (c) url += `&client=${encodeURIComponent(c)}`
    const r = otdRange
    if (r?.start) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      url += `&otdFrom=${fmt(r.start)}&otdTo=${fmt(r.end ?? r.start)}`
    }
    return url
  }, [props.otdHref, otdMode, debouncedClient, otdRange])

  const otdRangeLabel = useMemo(() => {
    const r = otdRange
    if (!r?.start) return null
    if (!r.end || r.start.toDateString() === r.end.toDateString()) return fmtDay(r.start)
    return `${fmtDay(r.start)} → ${fmtDay(r.end)}`
  }, [otdRange])

  const stockUrl = useMemo(() => {
    let url = `${props.stockHref}?referenceDate=${encodeURIComponent(props.referenceDate)}&stockGrain=${stockGrain}`
    const r = stockRange
    if (r?.start) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      url += `&stockFrom=${fmt(r.start)}&stockTo=${fmt(r.end ?? r.start)}`
    }
    return url
  }, [props.stockHref, props.referenceDate, stockGrain, stockRange])

  const stockRangeLabel = useMemo(() => {
    const r = stockRange
    if (!r?.start) return null
    if (!r.end || r.start.toDateString() === r.end.toDateString()) return fmtDay(r.start)
    return `${fmtDay(r.start)} → ${fmtDay(r.end)}`
  }, [stockRange])

  // ----- Fetch -----
  const kpisData = useTimedFetch<DashboardKpisResponse>(props.kpisHref)
  const otdData = useTimedFetch<DashboardOtdResponse>(otdUrl)
  const stockData = useTimedFetch<DashboardStockResponse>(stockUrl)

  const kpi = useMemo(() => (kpisData.data ?? EMPTY_KPIS).retardCharge, [kpisData.data])
  const otd = useMemo(() => (otdData.data ?? EMPTY_OTD).otd, [otdData.data])
  const x3Error = useMemo(() => (kpisData.data ?? EMPTY_KPIS).x3Error, [kpisData.data])
  const otdError = useMemo(() => (otdData.data ?? EMPTY_OTD).x3Error, [otdData.data])
  const maxHeures = useMemo(() => Math.max(1, ...kpi.postes.map((p) => p.heures)), [kpi.postes])

  const stock = useMemo(() => (stockData.data ?? { stockValuation: EMPTY_STOCK }).stockValuation, [stockData.data])
  const stockError = useMemo(() => (stockData.data ?? { x3Error: null }).x3Error, [stockData.data])
  const stockMaxCat = useMemo(() => Math.max(1, ...stock.categories.map((c) => c.valeur)), [stock.categories])

  // Stock categories
  const stockCategories = useMemo(() => {
    const set = new Set<string>()
    for (const a of stock.articles) set.add(a.categorie)
    return [...set].sort()
  }, [stock.articles])

  // Articles filtrés
  const filteredArticles = useMemo(() => {
    const needle = stockSearch.trim().toLowerCase()
    const cat = stockCatFilter
    const hideZero = stockHideZero
    const by = stockSortBy
    const dir = stockSortDir === 'asc' ? 1 : -1
    return stock.articles
      .filter((a) => {
        if (hideZero && a.stock === 0) return false
        if (cat && a.categorie !== cat) return false
        if (needle && !a.article.toLowerCase().includes(needle) && !a.designation.toLowerCase().includes(needle))
          return false
        return true
      })
      .sort((a, b) => {
        const av = a[by]
        const bv = b[by]
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
        return String(av).localeCompare(String(bv)) * dir
      })
  }, [stock.articles, stockSearch, stockCatFilter, stockHideZero, stockSortBy, stockSortDir])

  const toggleStockSort = (col: 'valeur' | 'stock' | 'article' | 'categorie') => {
    if (stockSortBy === col) {
      setStockSortDir(stockSortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setStockSortBy(col)
      setStockSortDir(col === 'article' || col === 'categorie' ? 'asc' : 'desc')
    }
  }

  const applyOtdRange = (r: DayPickerRange | undefined) => {
    const next: { start: Date | null; end: Date | null } = { start: r?.from ?? null, end: r?.to ?? null }
    setOtdRange(next)
    if (next.start && next.end) setCalendarOpen(false)
  }

  const applyStockRange = (r: DayPickerRange | undefined) => {
    const next: { start: Date | null; end: Date | null } = { start: r?.from ?? null, end: r?.to ?? null }
    setStockRange(next)
    if (next.start && next.end) setStockCalendarOpen(false)
  }

  return (
    <AppLayout
      title="Tableau de bord"
      active="dashboard"
      subtitle="Tableau de bord · Overview"
      theme="airbnb"
      scrollable={false}
      maxWidth="7xl"
    >
        <div ref={contentElRef} className="h-full overflow-auto print:overflow-visible">
          {/* En-tête imprimable — masquée à l'écran, visible uniquement à l'impression */}
          <div
            data-print-header
            className="mb-5 hidden items-baseline justify-between border-b border-rule pb-3 print:flex"
          >
            <span className="font-fraunces text-[20px] font-semibold tracking-tight text-foreground">
              Supply Chain <span className="font-medium italic text-brand">AERECO</span>
              <span className="ml-3 font-mono text-[13px] font-normal text-muted-foreground">
                Tableau de bord
              </span>
            </span>
            <span className="font-mono text-[12px] text-muted-foreground">
              {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(props.referenceDate))}
            </span>
          </div>

          {/* Barre d'outils édition */}
          <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
            {editMode && (
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Personnalisation — glissez les KPI, changez leur largeur, masquez-en.
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {editMode && (
                <button
                  type="button"
                  onClick={() => setLayout(DEFAULT_DASHBOARD_LAYOUT)}
                  className="rounded border border-rule bg-secondary px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-secondary/80 hover:text-foreground"
                >
                  Réinitialiser
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className="flex items-center gap-1.5 rounded border border-rule bg-card px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-secondary"
              >
                <DynamicIcon name={editMode ? 'check' : 'tune'} size={14} className="text-muted-foreground" />
                {editMode ? 'Terminé' : 'Personnaliser'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3 lg:[grid-auto-flow:dense]">
            {/* ═════ KPI #1 — Charge en retard par poste ═════ */}
            {isVisible('charge') ? (
              <Tile
                id="charge"
                editMode={editMode}
                screenRank={getScreenRank('charge')}
                printRank={getPrintRank('charge')}
                width={layoutItem('charge')?.width ?? 1}
                onWidth={setWidth.bind(null, 'charge')}
                onHide={() => setVisible('charge', false)}
                onPrintMove={(dir) => movePrint('charge', dir)}
                draggedId={draggedId}
                dropTargetId={dropTargetId}
                setDraggedId={setDraggedId}
                setDropTargetId={setDropTargetId}
                onDrop={() => draggedId && moveItem(draggedId, 'charge')}
              >
                <article className="rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)]">
                  <CardHeader
                    title="Charge en retard"
                    suffix="par poste"
                    onHide={() => setVisible('charge', false)}
                  />
                  {kpisData.loading ? (
                    <Spinner />
                  ) : x3Error ? (
                    <p className="font-fraunces text-[13px] italic leading-snug text-destructive/80">
                      {x3Error}
                    </p>
                  ) : (
                    <>
                      <div className="flex items-end justify-between gap-3">
                        <div className="font-fraunces text-[56px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                          {kpi.totalHeures}
                          <span className="ml-1 font-mono text-[18px] font-bold text-muted-foreground">
                            h
                          </span>
                        </div>
                        <div className="pb-1.5 text-right font-mono text-[10.5px] leading-tight text-muted-foreground">
                          <b className="text-[13px] text-foreground">{kpi.nbLignes}</b> ligne
                          {kpi.nbLignes > 1 ? 's' : ''}
                          <br />
                          en retard
                        </div>
                      </div>

                      {kpi.postes.length > 0 ? (
                        <div className="mt-6 flex flex-col gap-3.5">
                          {kpi.postes.map((poste, i) => (
                            <div key={poste.code}>
                              <div className="mb-[5px] flex items-baseline justify-between gap-2">
                                <span
                                  className="min-w-0 truncate font-mono text-[11.5px] font-bold text-foreground"
                                  title={poste.label}
                                >
                                  {poste.code}
                                  {poste.label ? ` · ${poste.label}` : ''}
                                </span>
                                <span className="shrink-0 font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">
                                  {poste.heures} h
                                </span>
                              </div>
                              <div
                                className="h-2 overflow-hidden rounded-full bg-secondary"
                                style={{
                                  'WebkitPrintColorAdjust': 'exact',
                                  'printColorAdjust': 'exact',
                                } as React.CSSProperties}
                              >
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max(3, (poste.heures / maxHeures) * 100)}%`,
                                    background: BAR_PALETTE[Math.min(i, BAR_PALETTE.length - 1)],
                                    'WebkitPrintColorAdjust': 'exact',
                                    'printColorAdjust': 'exact',
                                  } as React.CSSProperties}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-6 font-fraunces text-[13px] italic text-muted-foreground">
                          Aucune charge en retard — rien à rattraper.
                        </p>
                      )}
                    </>
                  )}
                </article>
              </Tile>
            ) : (
              <HiddenTile id="charge" editMode={editMode} onShow={() => setVisible('charge', true)} />
            )}

            {/* ═════ KPI #2 — OTD ═════ */}
            {isVisible('otd') ? (
              <Tile
                id="otd"
                editMode={editMode}
                screenRank={getScreenRank('otd')}
                printRank={getPrintRank('otd')}
                width={layoutItem('otd')?.width ?? 1}
                onWidth={setWidth.bind(null, 'otd')}
                onHide={() => setVisible('otd', false)}
                onPrintMove={(dir) => movePrint('otd', dir)}
                draggedId={draggedId}
                dropTargetId={dropTargetId}
                setDraggedId={setDraggedId}
                setDropTargetId={setDropTargetId}
                onDrop={() => draggedId && moveItem(draggedId, 'otd')}
              >
                <article className="rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)]">
                  <div className="mb-4 flex items-center gap-2.5 border-b border-rule-soft pb-3">
                    <span className="size-2 shrink-0 rounded-full bg-foreground/30" />
                    <h2 className="font-fraunces text-[16px] font-semibold leading-none tracking-tight text-foreground">
                      OTD
                    </h2>
                    {/* Sélecteur de plage */}
                    <div className="relative ml-auto">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setCalendarOpen((v) => !v)}
                          className="flex items-center gap-1.5 rounded border border-rule bg-secondary px-2 py-1 font-mono text-[10px] text-foreground transition-colors hover:bg-secondary/80"
                        >
                          <CalendarIcon size={13} className="text-muted-foreground" />
                          <span>{otdRangeLabel ?? 'Auto'}</span>
                        </button>
                        {otdRange?.start && (
                          <button
                            type="button"
                            onClick={() => {
                              setOtdRange(null)
                              setCalendarOpen(false)
                            }}
                            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                            title="Réinitialiser"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {calendarOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setCalendarOpen(false)} />
                          <div className="absolute right-0 top-full z-20 mt-1">
                            <Calendar
                              mode="range"
                              locale={fr}
                              numberOfMonths={2}
                              selected={{
                                from: otdRange?.start ?? undefined,
                                to: otdRange?.end ?? undefined,
                              }}
                              onSelect={applyOtdRange}
                              disabled={(day) => day > new Date()}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    {/* Toggle mode */}
                    <div className="flex items-center rounded border border-rule bg-secondary p-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em]">
                      <button
                        onClick={() => setOtdMode('demandee')}
                        className={cn(
                          'rounded px-2 py-1 transition-colors',
                          otdMode === 'demandee'
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Demandée
                      </button>
                      <button
                        onClick={() => setOtdMode('acceptee')}
                        className={cn(
                          'rounded px-2 py-1 transition-colors',
                          otdMode === 'acceptee'
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Acceptée
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVisible('otd', false)}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground print:hidden"
                      title="Masquer ce KPI"
                      aria-label="Masquer le KPI OTD"
                    >
                      <Eye size={15} />
                    </button>
                  </div>

                  {otdData.loading ? (
                    <Spinner />
                  ) : otdError ? (
                    <p className="font-fraunces text-[13px] italic leading-snug text-destructive/80">
                      {otdError}
                    </p>
                  ) : otd.length === 0 ? (
                    <p className="font-fraunces text-[13px] italic text-muted-foreground">
                      Aucune donnée OTD.
                    </p>
                  ) : (
                    <>
                      {/* Filtre client + toggle détails */}
                      <div className="mb-3 flex items-center gap-1.5">
                        <div className="relative min-w-0 flex-1">
                          <Search size={13} strokeWidth={1.75} className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="text"
                            value={clientFilter}
                            onInput={(e) => setClientFilter(e.currentTarget.value)}
                            placeholder="Filtrer par client"
                            aria-label="Filtrer les lignes par client"
                            className="w-full rounded border border-rule bg-secondary py-[5px] pl-7 pr-6 font-sans text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/30 focus:outline-none"
                          />
                          {clientFilter && (
                            <button
                              type="button"
                              onClick={() => setClientFilter('')}
                              className="absolute right-1 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                              title="Effacer le filtre"
                              aria-label="Effacer le filtre"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setDetailsOpen((v) => !v)}
                          className="flex shrink-0 items-center gap-1 rounded border border-rule bg-secondary px-2 py-[5px] font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-secondary/80"
                          title={detailsOpen ? 'Masquer les détails' : 'Afficher les détails'}
                        >
                          <DynamicIcon name={detailsOpen ? 'expand_more' : 'chevron_right'} size={13} className="text-muted-foreground" />
                          <span>Détails</span>
                        </button>
                      </div>

                      {otd.map((p, i) => (
                        <div key={p.label} className={cn('mt-5 border-t border-rule-soft pt-5', i > 0)}>
                          <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                            {p.label}
                          </div>

                          {p.nbTotal === 0 ? (
                            <p className="font-fraunces text-[12px] italic text-muted-foreground">
                              Aucune ligne à expédier.
                            </p>
                          ) : (
                            <>
                              <div className="flex items-end justify-between gap-3">
                                <div
                                  className="font-fraunces text-[48px] font-semibold leading-none tracking-tight tabular-nums"
                                  style={{ color: otdColor(p.tauxOtif, p.nbTotal) }}
                                >
                                  {p.tauxOtif}
                                  <span className="ml-0.5 font-mono text-[16px] font-bold text-muted-foreground">
                                    %
                                  </span>
                                </div>
                                <div className="pb-1 text-right font-mono text-[10.5px] leading-tight text-muted-foreground">
                                  <b className="text-[13px] text-foreground">{p.nbOtif}</b>/{p.nbTotal}
                                  <br />
                                  lignes OTIF
                                </div>
                              </div>

                              {detailsOpen && p.lignesNon.length > 0 && (
                                <div className="-mx-2 mt-4 max-h-[160px] overflow-auto">
                                  <table className="w-full border-collapse text-left">
                                    <thead>
                                      <tr className="sticky top-0 bg-card">
                                        <th className="border-b border-rule px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                          Commande
                                        </th>
                                        <th className="border-b border-rule px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                          Article
                                        </th>
                                        <th className="border-b border-rule px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                          Poste
                                        </th>
                                        <th className="border-b border-rule px-2 py-1.5 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                          Livré/Cmde
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {p.lignesNon.map((l) => (
                                        <tr key={`${l.numCommande}::${l.article}::${l.posteDeCharge ?? '-'}`} className="border-b border-rule-soft last:border-0 hover:bg-secondary/40">
                                          <td className="px-2 py-1.5 align-top">
                                            <div className="font-mono text-[11px] font-bold text-foreground">
                                              {l.numCommande}
                                            </div>
                                            <div className="font-sans text-[10px] text-muted-foreground">
                                              {l.client}
                                            </div>
                                          </td>
                                          <td className="px-2 py-1.5 align-top font-mono text-[11px] font-semibold text-brand">
                                            {l.article}
                                          </td>
                                          <td className="px-2 py-1.5 align-top">
                                            {l.posteDeCharge ? (
                                              <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-secondary-foreground">
                                                {l.posteDeCharge}
                                              </span>
                                            ) : (
                                              <span className="font-sans text-[10px] text-muted-foreground/70">
                                                —
                                              </span>
                                            )}
                                          </td>
                                          <td className="whitespace-nowrap px-2 py-1.5 text-right align-top font-mono text-[11px] tabular-nums text-muted-foreground">
                                            {l.qteLivree}/{l.qteCmde}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {detailsOpen && p.lignesNon.length === 0 && (
                                <p className="mt-4 font-fraunces text-[12px] italic text-muted-foreground">
                                  Toutes les lignes sont OTIF.
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </article>
              </Tile>
            ) : (
              <HiddenTile id="otd" editMode={editMode} onShow={() => setVisible('otd', true)} />
            )}

            {/* ═════ KPI #3 — Valorisation du stock ═════ */}
            {isVisible('stock') ? (
              <Tile
                id="stock"
                editMode={editMode}
                screenRank={getScreenRank('stock')}
                printRank={getPrintRank('stock')}
                width={layoutItem('stock')?.width ?? 1}
                onWidth={setWidth.bind(null, 'stock')}
                onHide={() => setVisible('stock', false)}
                onPrintMove={(dir) => movePrint('stock', dir)}
                draggedId={draggedId}
                dropTargetId={dropTargetId}
                setDraggedId={setDraggedId}
                setDropTargetId={setDropTargetId}
                onDrop={() => draggedId && moveItem(draggedId, 'stock')}
              >
                <article className="rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)]">
                  <div className="mb-4 flex items-center gap-2.5 border-b border-rule-soft pb-3">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: '#2d6a8f' }} />
                    <h2 className="font-fraunces text-[16px] font-semibold leading-none tracking-tight text-foreground">
                      Valorisation stock
                    </h2>
                    <div className="relative ml-auto">
                      <button
                        type="button"
                        onClick={() => setStockCalendarOpen((v) => !v)}
                        className="flex items-center gap-1.5 rounded border border-rule bg-secondary px-2 py-1 font-mono text-[10px] text-foreground transition-colors hover:bg-secondary/80"
                      >
                        <CalendarIcon size={13} className="text-muted-foreground" />
                        <span>{stockRangeLabel ?? `12 ${stockGrain === 'semaine' ? 'sem.' : 'mois'}`}</span>
                      </button>
                      {stockRange?.start && (
                        <button
                          type="button"
                          onClick={() => {
                            setStockRange(null)
                            setStockCalendarOpen(false)
                          }}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                          title="Réinitialiser"
                        >
                          <X size={14} />
                        </button>
                      )}
                      {stockCalendarOpen && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setStockCalendarOpen(false)} />
                          <div className="absolute right-0 top-full z-20 mt-1">
                            <Calendar
                              mode="range"
                              locale={fr}
                              numberOfMonths={2}
                              selected={{
                                from: stockRange?.start ?? undefined,
                                to: stockRange?.end ?? undefined,
                              }}
                              onSelect={applyStockRange}
                              disabled={(day) => day > new Date()}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    {/* Toggle maille */}
                    <div className="flex items-center rounded border border-rule bg-secondary p-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em]">
                      <button
                        onClick={() => setStockGrain('mois')}
                        className={cn(
                          'rounded px-2 py-1 transition-colors',
                          stockGrain === 'mois'
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Mois
                      </button>
                      <button
                        onClick={() => setStockGrain('semaine')}
                        className={cn(
                          'rounded px-2 py-1 transition-colors',
                          stockGrain === 'semaine'
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Sem.
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVisible('stock', false)}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground print:hidden"
                      title="Masquer ce KPI"
                      aria-label="Masquer le KPI Valorisation stock"
                    >
                      <Eye size={15} />
                    </button>
                  </div>

                  {stockData.loading ? (
                    <Spinner />
                  ) : stockError ? (
                    <p className="font-fraunces text-[13px] italic leading-snug text-destructive/80">
                      {stockError}
                    </p>
                  ) : stock.series.length === 0 ? (
                    <p className="font-fraunces text-[13px] italic text-muted-foreground">
                      Aucune donnée de valorisation.
                    </p>
                  ) : (
                    <>
                      {/* Valeur actuelle + delta */}
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="font-fraunces text-[40px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                            {fmtEuro.format(stock.totalActuel)}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
                            {stock.deltaPct !== 0 && (
                              <span
                                className="font-bold tabular-nums"
                                style={{ color: stock.deltaPct > 0 ? '#b23b2e' : '#2d7a4f' }}
                              >
                                {stock.deltaPct > 0 ? '+' : ''}
                                {stock.deltaPct}%
                              </span>
                            )}
                            <span>vs début de plage</span>
                          </div>
                        </div>
                        <div className="pb-1 text-right font-mono text-[10.5px] leading-tight text-muted-foreground">
                          <b className="text-[13px] text-foreground">{stock.nbArticles}</b> art.
                          <br />
                          valorisés
                        </div>
                      </div>

                      {/* Mini-graphique */}
                      <StockSparkline series={stock.series} />

                      {/* Top 5 catégories */}
                      <div className="mt-5">
                        <div className="mb-3 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          Top catégories
                        </div>
                        <div className="flex flex-col gap-3">
                          {stock.categories.map((cat, i) => (
                            <div key={cat.categorie}>
                              <div className="mb-[5px] flex items-baseline justify-between gap-2">
                                <span className="min-w-0 truncate font-mono text-[11.5px] font-bold text-foreground">
                                  {cat.categorie}
                                </span>
                                <span className="shrink-0 font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">
                                  {fmtEuro.format(cat.valeur)}
                                  <span className="ml-1 text-[10px] text-muted-foreground/70">{cat.part}%</span>
                                </span>
                              </div>
                              <div
                                className="h-2 overflow-hidden rounded-full bg-secondary"
                                style={{
                                  'WebkitPrintColorAdjust': 'exact',
                                  'printColorAdjust': 'exact',
                                } as React.CSSProperties}
                              >
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.max(3, (cat.valeur / stockMaxCat) * 100)}%`,
                                    background: STOCK_PALETTE[Math.min(i, STOCK_PALETTE.length - 1)],
                                    'WebkitPrintColorAdjust': 'exact',
                                    'printColorAdjust': 'exact',
                                  } as React.CSSProperties}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </article>
              </Tile>
            ) : (
              <HiddenTile id="stock" editMode={editMode} onShow={() => setVisible('stock', true)} />
            )}

            {/* ═════ KPI #4 — Lignes en retard ═════ */}
            {isVisible('lignes') ? (
              <Tile
                id="lignes"
                editMode={editMode}
                screenRank={getScreenRank('lignes')}
                printRank={getPrintRank('lignes')}
                width={layoutItem('lignes')?.width ?? 2}
                onWidth={setWidth.bind(null, 'lignes')}
                onHide={() => setVisible('lignes', false)}
                onPrintMove={(dir) => movePrint('lignes', dir)}
                draggedId={draggedId}
                dropTargetId={dropTargetId}
                setDraggedId={setDraggedId}
                setDropTargetId={setDropTargetId}
                onDrop={() => draggedId && moveItem(draggedId, 'lignes')}
              >
                <article className="flex max-h-[calc(100vh-9rem)] flex-col rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)] print:max-h-none print:overflow-visible print:shadow-none">
                  <CardHeader
                    title="Lignes en retard"
                    suffix={`${kpi.nbLignes} commande${kpi.nbLignes > 1 ? 's' : ''}`}
                    onHide={() => setVisible('lignes', false)}
                  />
                  {kpisData.loading ? (
                    <Spinner />
                  ) : x3Error ? (
                    <p className="font-fraunces text-[13px] italic leading-snug text-destructive/80">
                      {x3Error}
                    </p>
                  ) : kpi.lignes.length === 0 ? (
                    <p className="font-fraunces text-[13px] italic text-muted-foreground">
                      Aucune ligne en retard.
                    </p>
                  ) : (
                    <div className="-mx-2 overflow-auto print:overflow-visible">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="sticky top-0 bg-card">
                            <th className="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Expé
                            </th>
                            <th className="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Commande · Client
                            </th>
                            <th className="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Article · Désignation
                            </th>
                            <th className="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Poste
                            </th>
                            <th className="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Reste
                            </th>
                            <th className="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              Charge
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {kpi.lignes.map((l) => (
                            <tr key={`${l.numCommande}::${l.article}::${l.dateExpIso ?? l.dateExp}`} className="border-b border-rule-soft last:border-0 hover:bg-secondary/40">
                              <td className="whitespace-nowrap px-2 py-2.5 align-top font-mono text-[12px] font-semibold text-destructive">
                                {l.dateExp || '—'}
                              </td>
                              <td className="px-2 py-2.5 align-top">
                                <div className="font-mono text-[12px] font-bold text-foreground">
                                  {l.numCommande}
                                </div>
                                <div className="font-sans text-[11px] text-muted-foreground">{l.client}</div>
                              </td>
                              <td className="px-2 py-2.5 align-top">
                                <div className="font-mono text-[12px] font-semibold text-brand">{l.article}</div>
                                <div className="font-sans text-[11px] leading-snug text-secondary-foreground">
                                  {l.designation || '—'}
                                </div>
                              </td>
                              <td className="px-2 py-2.5 align-top">
                                {l.postes.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {l.postes.map((p) => (
                                      <span
                                        key={p}
                                        className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-secondary-foreground"
                                      >
                                        {p}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="font-sans text-[11px] text-muted-foreground/70">—</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2.5 text-right align-top font-mono text-[12px] font-semibold tabular-nums text-foreground">
                                {l.qteRestante}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2.5 text-right align-top font-mono text-[12px] font-bold tabular-nums text-foreground">
                                {l.heures > 0 ? `${l.heures} h` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              </Tile>
            ) : (
              <HiddenTile id="lignes" editMode={editMode} onShow={() => setVisible('lignes', true)} />
            )}

            {/* ═════ KPI #5 — Stock par article ═════ */}
            {isVisible('stockTable') ? (
              <Tile
                id="stockTable"
                editMode={editMode}
                screenRank={getScreenRank('stockTable')}
                printRank={getPrintRank('stockTable')}
                width={layoutItem('stockTable')?.width ?? 2}
                onWidth={setWidth.bind(null, 'stockTable')}
                onHide={() => setVisible('stockTable', false)}
                onPrintMove={(dir) => movePrint('stockTable', dir)}
                draggedId={draggedId}
                dropTargetId={dropTargetId}
                setDraggedId={setDraggedId}
                setDropTargetId={setDropTargetId}
                onDrop={() => draggedId && moveItem(draggedId, 'stockTable')}
              >
                <article className="flex max-h-[calc(100vh-9rem)] flex-col rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)] print:max-h-none print:overflow-visible print:shadow-none">
                  <CardHeader
                    title="Stock par article"
                    suffix={`${filteredArticles.length} / ${stock.nbArticles} · AE1`}
                    tone="#2d6a8f"
                    onHide={() => setVisible('stockTable', false)}
                  />
                  {stockData.loading ? (
                    <Spinner />
                  ) : stockError ? (
                    <p className="font-fraunces text-[13px] italic leading-snug text-destructive/80">
                      {stockError}
                    </p>
                  ) : (
                    <>
                      {/* Barre de filtres */}
                      <div className="mb-3 flex flex-wrap items-center gap-1.5">
                        <div className="relative min-w-0 flex-1">
                          <Search size={13} strokeWidth={1.75} className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <input
                            type="text"
                            value={stockSearch}
                            onInput={(e) => setStockSearch(e.currentTarget.value)}
                            placeholder="Article ou désignation"
                            aria-label="Filtrer les articles"
                            className="w-full rounded border border-rule bg-secondary py-[5px] pl-7 pr-6 font-sans text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/30 focus:outline-none"
                          />
                          {stockSearch && (
                            <button
                              type="button"
                              onClick={() => setStockSearch('')}
                              className="absolute right-1 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                              title="Effacer"
                              aria-label="Effacer la recherche"
                            >
                              <X size={13} />
                            </button>
                          )}
                        </div>
                        <select
                          value={stockCatFilter}
                          onChange={(e) => setStockCatFilter(e.currentTarget.value)}
                          aria-label="Filtrer par catégorie"
                          className="rounded border border-rule bg-secondary py-[5px] px-2 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-foreground focus:border-foreground/30 focus:outline-none"
                        >
                          <option value="">Toutes cat.</option>
                          {stockCategories.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setStockHideZero((v) => !v)}
                          className={cn(
                            'flex items-center gap-1 rounded border border-rule px-2 py-[5px] font-mono text-[9px] font-bold uppercase tracking-[0.12em] transition-colors',
                            stockHideZero
                              ? 'bg-foreground text-background'
                              : 'bg-secondary text-muted-foreground hover:text-foreground'
                          )}
                          title="Masquer les articles à stock nul"
                        >
                          <DynamicIcon name={stockHideZero ? 'check_box' : 'check_box_outline_blank'} size={13} />
                          <span>Stock ≠ 0</span>
                        </button>
                      </div>

                      <div className="-mx-2 overflow-auto print:overflow-visible">
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr className="sticky top-0 bg-card">
                              <th className="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                <button
                                  type="button"
                                  onClick={() => toggleStockSort('article')}
                                  className="flex items-center gap-1 hover:text-foreground"
                                >
                                  Article
                                  {stockSortBy === 'article' && (
                                    <span className="text-[10px]">{stockSortDir === 'asc' ? '▲' : '▼'}</span>
                                  )}
                                </button>
                              </th>
                              <th className="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                Désignation
                              </th>
                              <th className="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                <button
                                  type="button"
                                  onClick={() => toggleStockSort('categorie')}
                                  className="flex items-center gap-1 hover:text-foreground"
                                >
                                  Cat.
                                  {stockSortBy === 'categorie' && (
                                    <span className="text-[10px]">{stockSortDir === 'asc' ? '▲' : '▼'}</span>
                                  )}
                                </button>
                              </th>
                              <th className="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                <button
                                  type="button"
                                  onClick={() => toggleStockSort('stock')}
                                  className="ml-auto flex items-center gap-1 hover:text-foreground"
                                >
                                  Stock
                                  {stockSortBy === 'stock' && (
                                    <span className="text-[10px]">{stockSortDir === 'asc' ? '▲' : '▼'}</span>
                                  )}
                                </button>
                              </th>
                              <th className="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                PMP
                              </th>
                              <th className="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                                <button
                                  type="button"
                                  onClick={() => toggleStockSort('valeur')}
                                  className="ml-auto flex items-center gap-1 hover:text-foreground"
                                >
                                  Valeur
                                  {stockSortBy === 'valeur' && (
                                    <span className="text-[10px]">{stockSortDir === 'asc' ? '▲' : '▼'}</span>
                                  )}
                                </button>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredArticles.map((a) => (
                              <tr key={`${a.article}::${a.categorie}`} className="border-b border-rule-soft last:border-0 hover:bg-secondary/40">
                                <td className="px-2 py-1.5 align-top font-mono text-[12px] font-semibold text-brand">
                                  {a.article}
                                </td>
                                <td className="px-2 py-1.5 align-top font-sans text-[11px] leading-snug text-secondary-foreground">
                                  {a.designation || '—'}
                                </td>
                                <td className="px-2 py-1.5 align-top">
                                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-secondary-foreground">
                                    {a.categorie}
                                  </span>
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right align-top font-mono text-[11px] tabular-nums text-foreground">
                                  {a.stock}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right align-top font-mono text-[11px] tabular-nums text-muted-foreground">
                                  {a.pmp.toFixed(4)}
                                </td>
                                <td className="whitespace-nowrap px-2 py-1.5 text-right align-top font-mono text-[11px] font-bold tabular-nums text-foreground">
                                  {fmtEuro.format(a.valeur)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </article>
              </Tile>
            ) : (
              <HiddenTile id="stockTable" editMode={editMode} onShow={() => setVisible('stockTable', true)} />
            )}
          </div>
        </div>
    </AppLayout>
  )
}
