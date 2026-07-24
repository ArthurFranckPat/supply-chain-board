import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { fr } from 'react-day-picker/locale'
import { toast } from 'sonner'

import AppLayout from '@r/layouts/app'
import { Calendar } from '@r/components/ui/calendar'
import { useRangeCalendar } from '@r/lib/use-range-calendar'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { usePrintFitPage } from '@r/lib/board/use-print-fit-page'
import { cn } from '@r/lib/utils'
import { Segment, SegmentButton, DateWindowPill } from '@r/components/vision/toolbar'
import {
  DEFAULT_DASHBOARD_LAYOUT,
  KPI_TITLES,
  normalizeDashboardLayout,
  type DashboardLayout,
  type KpiId,
  type KpiWidth,
} from '@/lib/dashboard/types'
import { useLayoutStore } from '@r/lib/dashboard/layout-store'
import { Eye, EyeOff, GripVertical, ArrowUp, ArrowDown, LoaderCircle, Calendar as CalendarIcon, X, Search, ChevronDown, ChevronRight, ChevronLeft, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { DynamicIcon } from '../components/ui/dynamic-icon'
import { StockArticleSheet } from '@r/components/board/stock-article-sheet'
import { Skeleton, SkeletonChart } from '@r/components/ui/skeleton'
import { Card, CardContent } from '@r/components/ui/card'
import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import { Separator } from '@r/components/ui/separator'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupButton,
} from '@r/components/ui/input-group'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@r/components/ui/select'
import { Switch } from '@r/components/ui/switch'

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

/**
 * Palette Airbnb « stricte » — une seule famille pour toutes les séries
 * catégorielles (choix utilisateur 2026-07-20) : Rausch en accent (rang le plus
 * chargé / valeur saillante), puis ink, teal Babu, rampe de gris. Remplace
 * l'ancienne famille terreuse Papier (brique/or/moutarde/sable).
 */
const BAR_PALETTE = ['#ff385c', '#222222', '#00a699', '#717171', '#dddddd']
/** Catégories de stock — même famille unique (cohérence Airbnb stricte). */
const STOCK_PALETTE = ['#ff385c', '#222222', '#00a699', '#717171', '#dddddd']

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
/** PMP : 4 décimales, virgule décimale (toFixed donnerait un point). */
const fmtPmp = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})
/** Quantité : 2 décimales max, virgule décimale (l'affichage JS brut point). */
const fmtQtyDec = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

function otdColor(taux: number, nbTotal: number): string {
  if (nbTotal === 0) return 'var(--color-muted-foreground)'
  if (taux >= 95) return 'var(--color-ferme, #008049)'
  if (taux >= 85) return 'var(--color-planifie, #d97706)'
  return 'var(--color-destructive, #ff385c)'
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
    <div className="mb-4 flex items-center gap-2.5 border-b border-border/60 pb-3">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: tone ?? 'var(--color-destructive, #ff385c)' }}
      />
      <h2 className="font-heading text-base font-semibold leading-none tracking-tight text-foreground">
        {title}
      </h2>
      <div className="ml-auto flex items-center gap-2">
        {suffix && (
          <Badge variant="secondary" className="font-mono text-[10px] uppercase font-bold">
            {suffix}
          </Badge>
        )}
        {onHide && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onHide}
            className="size-6 text-muted-foreground hover:text-foreground print:hidden"
            title="Masquer ce KPI"
            aria-label={`Masquer le KPI ${title}`}
          >
            <Eye size={14} />
          </Button>
        )}
      </div>
    </div>
  )
}

/** Période datée : « S26 2025 » en maille semaine (la clé `periode` « YYYY-Www »
 *  porte l'année ISO), sinon le label fourni (« janv. 26 »). */
const periodDated = (p: StockValuationPoint) =>
  p.periode.includes('-W') ? `S${p.periode.slice(-2)} ${p.periode.slice(0, 4)}` : p.label

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
              fill={isLast ? '#222222' : '#dddddd'}
            >
              <title>{`${periodDated(pt)} · ${pt.valeur.toFixed(0)} €`}</title>
            </rect>
          )
        })}
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[8.5px] text-muted-foreground/70">
        <span>{series[0] ? periodDated(series[0]) : null}</span>
        <span>{series[series.length - 1] ? periodDated(series[series.length - 1]) : null}</span>
      </div>
    </div>
  )
}

/** Placeholder pour un KPI masqué. En mode édition, il reste un tile réordonnable
 * (pour le replacer) ; hors édition, il est masqué à l'impression. */
function HiddenTile({ id, editMode, screenRank, onShow }: { id: KpiId; editMode: boolean; screenRank?: number; onShow: () => void }) {
  // Affiché uniquement en mode édition : sinon le KPI masqué disparaît totalement.
  if (!editMode) return null
  return (
    <div className="lg:col-span-1 transition-all duration-300 ease-out" style={{ order: screenRank ?? 999, viewTransitionName: `kpi-tile-${id}` } as React.CSSProperties}>
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-rule bg-secondary/30 px-4 py-3 transition-all duration-200 hover:border-brand/40 hover:bg-secondary/50 print:hidden">
        <EyeOff size={15} className="text-muted-foreground" />
        <span className="font-mono text-[10px] font-semibold text-muted-foreground">
          {KPI_TITLES[id]}
        </span>
        <span className="font-fraunces text-[12px] italic text-muted-foreground/70">— masqué</span>
        <button
          type="button"
          onClick={onShow}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold text-muted-foreground transition-all duration-150 active:scale-95 hover:bg-secondary hover:text-foreground"
        >
          <Eye size={13} />
          <span>Afficher</span>
        </button>
      </div>
    </div>
  )
}

// react-grid-layout v2 : WidthProvider (v1) est remplacé par le hook
// useContainerWidth — la largeur mesurée est passée au composant.
import { ResponsiveGridLayout, useContainerWidth, type Layout } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

/**
 * Conteneur de KPI pilotant la disposition react-grid-layout.
 */
function Tile({
  id,
  children,
  editMode,
  printRank,
  width,
  onWidth,
  onHide,
  onPrintMove,
}: {
  id: KpiId
  children: React.ReactNode
  editMode: boolean
  printRank: number
  width: KpiWidth
  onWidth: (w: KpiWidth) => void
  onHide: () => void
  onPrintMove?: (dir: -1 | 1) => void
}) {
  return (
    <div className="h-full w-full relative flex flex-col group">
      {/* Barre d'outils édition */}
      {editMode && (
        <div className="pointer-events-none absolute -top-3 left-3 z-30 flex items-center gap-1.5 rounded border border-rule bg-card px-1.5 py-0.5 shadow-sm print:hidden">
          <span
            className="grid-drag-handle pointer-events-auto cursor-grab active:cursor-grabbing text-muted-foreground hover:text-brand"
            title="Cliquer et glisser cette poignée pour réordonner la carte"
          >
            <GripVertical size={14} />
          </span>

          {/* Boutons de largeur rapide 1/3, 2/3, Full */}
          <div className="pointer-events-auto flex items-center gap-0.5 rounded border border-rule bg-secondary px-0.5">
            <button
              type="button"
              onClick={() => onWidth(1)}
              className={cn(
                'px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors',
                width === 1 ? 'bg-brand text-brand-foreground rounded-xs' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Largeur 1/3 (4 colonnes)"
            >
              ⅓
            </button>
            <button
              type="button"
              onClick={() => onWidth(2)}
              className={cn(
                'px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors',
                width === 2 ? 'bg-brand text-brand-foreground rounded-xs' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Largeur 2/3 (8 colonnes)"
            >
              ⅔
            </button>
            <button
              type="button"
              onClick={() => onWidth(3)}
              className={cn(
                'px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors',
                width === 3 ? 'bg-brand text-brand-foreground rounded-xs' : 'text-muted-foreground hover:text-foreground'
              )}
              title="Pleine largeur (12 colonnes)"
            >
              ▭
            </button>
          </div>

          {/* Ordre d'impression */}
          {onPrintMove && (
            <div className="pointer-events-auto flex items-center gap-0.5 rounded border border-rule bg-secondary px-0.5">
              <span className="px-1 font-mono text-[9px] text-muted-foreground" title="Ordre impression">
                🖨️ #{printRank + 1}
              </span>
              <button
                type="button"
                onClick={() => onPrintMove(-1)}
                className="p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                title="Monter dans l'impression"
              >
                <ArrowUp size={11} />
              </button>
              <button
                type="button"
                onClick={() => onPrintMove(1)}
                className="p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                title="Descendre dans l'impression"
              >
                <ArrowDown size={11} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onHide}
            className="pointer-events-auto p-0.5 text-muted-foreground transition-colors hover:text-destructive"
            title="Masquer la carte"
          >
            <EyeOff size={13} />
          </button>
        </div>
      )}

      {/* Ordre d'impression */}
      {!editMode && (
        <span
          className="absolute right-3 top-3 z-10 hidden rounded bg-secondary/80 px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums text-muted-foreground print:block"
          title="Ordre d'impression"
        >
          {printRank + 1}
        </span>
      )}

      <div className="h-full w-full flex flex-col flex-1 overflow-hidden">{children}</div>
    </div>
  )
}

function Spinner() {
  return (
    <div className="flex h-[180px] w-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-12 rounded-full" />
      </div>
      <div className="flex flex-1 items-end gap-2 pt-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="w-full rounded-t-sm"
            style={{ height: `${30 + (i * 11) % 60}%` }}
          />
        ))}
      </div>
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
    updateGridItems: setStoreUpdateGridItems,
    movePrint: moveStorePrint,
  } = useLayoutStore()

  // Sync initial layout from props (une seule fois au mount initial)
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      if (layoutFromProps) {
        setLayout(layoutFromProps)
      }
    }
  }, [layoutFromProps, setLayout])

  const setVisible = useCallback((id: KpiId, visible: boolean) => setStoreVisible(id, visible), [setStoreVisible])
  const setWidth = useCallback((id: KpiId, width: KpiWidth) => setStoreWidth(id, width), [setStoreWidth])
  const movePrint = useCallback((id: KpiId, dir: -1 | 1) => moveStorePrint(id, dir), [moveStorePrint])

  const isVisible = useCallback((id: KpiId) => items.find((it) => it.id === id)?.visible ?? true, [items])
  const layoutItem = useCallback((id: KpiId) => items.find((it) => it.id === id), [items])
  const getPrintRank = useCallback((id: KpiId) => printOrder.indexOf(id), [printOrder])

  // Déclaré avant les mémos qui en dépendent (gridLayout, handleLayoutChange).
  const [editMode, setEditMode] = useState(false)

  // Largeur mesurée du conteneur de la grille (react-grid-layout v2).
  const { width: gridWidth, containerRef: gridContainerRef } = useContainerWidth()

  const gridLayout = useMemo(
    () =>
      items
        .filter((it) => it.visible)
        .map((it) => ({
          i: it.id,
          x: it.x,
          y: it.y,
          w: it.w,
          h: it.h,
          minW: 3,
          minH: 3,
          isDraggable: editMode,
          isResizable: editMode,
        })),
    [items, editMode]
  )

  const handleLayoutChange = useCallback(
    (currentLayout: Layout) => {
      if (!editMode) return
      setStoreUpdateGridItems(currentLayout.map((l) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h })))
    },
    [editMode, setStoreUpdateGridItems]
  )

  // ----- Local state -----
  const [otdMode, setOtdMode] = useState<OtdMode>('demandee')
  const [otdRange, setOtdRange] = useState<{ start: Date | null; end: Date | null } | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [clientFilter, setClientFilter] = useState('')
  const [debouncedClient, setDebouncedClient] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(true)
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
  // Article ouvert dans la sheet de détail (null = fermé).
  const [stockArticle, setStockArticle] = useState<string | null>(null)

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
        .catch(() => toast.error('Échec de la sauvegarde de la disposition'))
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

  const otdCal = useRangeCalendar({
    open: calendarOpen,
    value: otdRange?.start ? { from: otdRange.start, to: otdRange.end ?? undefined } : undefined,
    onCommit: (r) => {
      setOtdRange({ start: r.from ?? null, end: r.to ?? null })
      setCalendarOpen(false)
    },
  })

  const stockCal = useRangeCalendar({
    open: stockCalendarOpen,
    value: stockRange?.start ? { from: stockRange.start, to: stockRange.end ?? undefined } : undefined,
    onCommit: (r) => {
      setStockRange({ start: r.from ?? null, end: r.to ?? null })
      setStockCalendarOpen(false)
    },
  })

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
              <span className="font-mono text-xs font-medium text-muted-foreground">
                Personnalisation — glissez les KPI, ajustez la poignée ou choisissez une largeur, masquez-en.
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {editMode && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setLayout(DEFAULT_DASHBOARD_LAYOUT)}
                  className="font-mono text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw size={13} className="mr-1" />
                  Réinitialiser
                </Button>
              )}
              <Button
                type="button"
                variant={editMode ? 'default' : 'outline'}
                size="xs"
                onClick={() => setEditMode((v) => !v)}
                className="font-mono text-xs font-semibold"
              >
                <SlidersHorizontal size={13} className="mr-1" />
                {editMode ? 'Terminé' : 'Personnaliser'}
              </Button>
            </div>
          </div>

          <div ref={gridContainerRef}>
            <ResponsiveGridLayout
              className="layout"
              width={gridWidth}
              layouts={{ lg: gridLayout, md: gridLayout, sm: gridLayout }}
              breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
              cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
              rowHeight={65}
              dragConfig={{ enabled: editMode, handle: '.grid-drag-handle' }}
              resizeConfig={{ enabled: editMode }}
              onLayoutChange={handleLayoutChange}
            >
            {/* ═════ KPI #1 — Charge en retard par poste ═════ */}
            {isVisible('charge') && (
              <div key="charge">
                <Tile
                  id="charge"
                  editMode={editMode}
                  printRank={getPrintRank('charge')}
                  width={layoutItem('charge')?.width ?? 1}
                  onWidth={setWidth.bind(null, 'charge')}
                  onHide={() => setVisible('charge', false)}
                  onPrintMove={(dir) => movePrint('charge', dir)}
                >
                  <Card elevation="raised" padding="lg" className="h-full overflow-auto">
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
                  </Card>
                </Tile>
              </div>
            )}

            {/* ═════ KPI #2 — OTD ═════ */}
            {isVisible('otd') && (
              <div key="otd">
                <Tile
                  id="otd"
                  editMode={editMode}
                  printRank={getPrintRank('otd')}
                  width={layoutItem('otd')?.width ?? 1}
                  onWidth={setWidth.bind(null, 'otd')}
                  onHide={() => setVisible('otd', false)}
                  onPrintMove={(dir) => movePrint('otd', dir)}
                >
                  <Card elevation="raised" padding="lg" className="h-full overflow-auto">
                    <div className="mb-4 flex items-center gap-2.5 border-b border-rule-soft pb-3">
                      <span className="size-2 shrink-0 rounded-full bg-foreground/30" />
                      <h2 className="font-fraunces text-[16px] font-semibold leading-none tracking-tight text-foreground">
                        OTD
                      </h2>
                      {/* Sélecteur de plage */}
                      <div className="ml-auto flex items-center gap-1">
                        <DateWindowPill
                          open={calendarOpen}
                          onOpenChange={setCalendarOpen}
                          selected={{ from: otdRange?.start ?? undefined, to: otdRange?.end ?? undefined }}
                          onSelect={(range) => {
                            if (range?.from && range?.to) {
                              setOtdRange({ start: range.from, end: range.to })
                              setCalendarOpen(false)
                            } else if (range?.from) {
                              setOtdRange({ start: range.from, end: range.from })
                            }
                          }}
                          disabled={(day) => day > new Date()}
                          align="right"
                        />
                        {otdRange?.start && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              setOtdRange(null)
                              setCalendarOpen(false)
                            }}
                            title="Réinitialiser la période OTD"
                          >
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                      {/* Toggle mode */}
                      <Segment role="radiogroup" ariaLabel="Mode d'OTD">
                        <SegmentButton
                          role="radio"
                          active={otdMode === 'demandee'}
                          onClick={() => setOtdMode('demandee')}
                        >
                          Demandée
                        </SegmentButton>
                        <SegmentButton
                          role="radio"
                          active={otdMode === 'acceptee'}
                          onClick={() => setOtdMode('acceptee')}
                        >
                          Acceptée
                        </SegmentButton>
                      </Segment>
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
                          <InputGroup className="h-8 flex-1">
                            <InputGroupAddon align="inline-start">
                              <Search size={13} className="text-muted-foreground" />
                            </InputGroupAddon>
                            <InputGroupInput
                              type="text"
                              value={clientFilter}
                              onChange={(e) => setClientFilter(e.target.value)}
                              placeholder="Filtrer par client"
                              aria-label="Filtrer les lignes par client"
                              className="h-8 text-xs"
                            />
                            {clientFilter && (
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  size="icon-xs"
                                  onClick={() => setClientFilter('')}
                                  title="Effacer le filtre"
                                  aria-label="Effacer le filtre"
                                >
                                  <X size={13} />
                                </InputGroupButton>
                              </InputGroupAddon>
                            )}
                          </InputGroup>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => setDetailsOpen((v) => !v)}
                            title={detailsOpen ? 'Masquer les détails' : 'Afficher les détails'}
                          >
                            <DynamicIcon name={detailsOpen ? 'expand_more' : 'chevron_right'} size={13} className="text-muted-foreground" />
                            <span>Détails</span>
                          </Button>
                        </div>

                        {otd.map((p, i) => (
                          <div key={p.label} className={cn('mt-5 border-t border-rule-soft pt-5', i > 0)}>
                            <div className="mb-2 font-mono text-[10px] font-semibold text-muted-foreground">
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
                  </Card>
                </Tile>
              </div>
            )}

            {/* ═════ KPI #3 — Valorisation du stock ═════ */}
            {isVisible('stock') && (
              <div key="stock">
                <Tile
                  id="stock"
                  editMode={editMode}
                  printRank={getPrintRank('stock')}
                  width={layoutItem('stock')?.width ?? 1}
                  onWidth={setWidth.bind(null, 'stock')}
                  onHide={() => setVisible('stock', false)}
                  onPrintMove={(dir) => movePrint('stock', dir)}
                >
                  <Card elevation="raised" padding="lg" className="h-full overflow-auto">
                    <div className="mb-4 flex items-center gap-2.5 border-b border-rule-soft pb-3">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: '#00a699' }} />
                      <h2 className="font-fraunces text-[16px] font-semibold leading-none tracking-tight text-foreground">
                        Valorisation stock
                      </h2>
                      <div className="ml-auto flex items-center gap-1">
                        <DateWindowPill
                          open={stockCalendarOpen}
                          onOpenChange={setStockCalendarOpen}
                          selected={{ from: stockRange?.start ?? undefined, to: stockRange?.end ?? undefined }}
                          onSelect={(range) => {
                            if (range?.from && range?.to) {
                              setStockRange({ start: range.from, end: range.to })
                              setStockCalendarOpen(false)
                            } else if (range?.from) {
                              setStockRange({ start: range.from, end: range.from })
                            }
                          }}
                          disabled={(day) => day > new Date()}
                          align="right"
                        />
                        {stockRange?.start && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              setStockRange(null)
                              setStockCalendarOpen(false)
                            }}
                            title="Réinitialiser la période stock"
                          >
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                      {/* Toggle maille */}
                      <Segment role="radiogroup" ariaLabel="Maille temporelle stock">
                        <SegmentButton
                          role="radio"
                          active={stockGrain === 'mois'}
                          onClick={() => setStockGrain('mois')}
                        >
                          Mois
                        </SegmentButton>
                        <SegmentButton
                          role="radio"
                          active={stockGrain === 'semaine'}
                          onClick={() => setStockGrain('semaine')}
                        >
                          Sem.
                        </SegmentButton>
                      </Segment>
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
                                  style={{ color: stock.deltaPct > 0 ? '#ff385c' : '#008049' }}
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
                          <div className="mb-3 font-mono text-[9px] font-semibold text-muted-foreground">
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
                  </Card>
                </Tile>
              </div>
            )}

            {/* ═════ KPI #4 — Lignes en retard ═════ */}
            {isVisible('lignes') && (
              <div key="lignes">
                <Tile
                  id="lignes"
                  editMode={editMode}
                  printRank={getPrintRank('lignes')}
                  width={layoutItem('lignes')?.width ?? 2}
                  onWidth={setWidth.bind(null, 'lignes')}
                  onHide={() => setVisible('lignes', false)}
                  onPrintMove={(dir) => movePrint('lignes', dir)}
                >
                  <Card elevation="raised" padding="lg" className="h-full overflow-auto">
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
                                        <Badge
                                          key={p}
                                          variant="secondary"
                                          className="font-mono text-[10px] font-bold tracking-wide"
                                        >
                                          {p}
                                        </Badge>
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
                  </Card>
                </Tile>
              </div>
            )}

            {/* ═════ KPI #5 — Stock par article ═════ */}
            {isVisible('stockTable') && (
              <div key="stockTable">
                <Tile
                  id="stockTable"
                  editMode={editMode}
                  printRank={getPrintRank('stockTable')}
                  width={layoutItem('stockTable')?.width ?? 2}
                  onWidth={setWidth.bind(null, 'stockTable')}
                  onHide={() => setVisible('stockTable', false)}
                  onPrintMove={(dir) => movePrint('stockTable', dir)}
                >
                  <Card elevation="raised" padding="lg" className="h-full overflow-auto">
                    <CardHeader
                      title="Stock par article"
                      suffix={`${filteredArticles.length} / ${stock.nbArticles} · AE1`}
                      tone="#00a699"
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
                          <InputGroup className="h-8 flex-1">
                            <InputGroupAddon align="inline-start">
                              <Search size={13} className="text-muted-foreground" />
                            </InputGroupAddon>
                            <InputGroupInput
                              type="text"
                              value={stockSearch}
                              onChange={(e) => setStockSearch(e.target.value)}
                              placeholder="Article ou désignation"
                              aria-label="Filtrer les articles"
                              className="h-8 text-xs"
                            />
                            {stockSearch && (
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  size="icon-xs"
                                  onClick={() => setStockSearch('')}
                                  title="Effacer la recherche"
                                  aria-label="Effacer la recherche"
                                >
                                  <X size={13} />
                                </InputGroupButton>
                              </InputGroupAddon>
                            )}
                          </InputGroup>
                          <Select
                            value={stockCatFilter || 'all'}
                            onValueChange={(val) => setStockCatFilter(val === 'all' ? '' : (val ?? ''))}
                          >
                            <SelectTrigger size="sm" className="h-8 border-border bg-card font-mono text-[11px] font-semibold text-foreground">
                              <SelectValue placeholder="Toutes cat." />
                            </SelectTrigger>
                            <SelectContent side="bottom">
                              <SelectItem value="all">Toutes cat.</SelectItem>
                              {stockCategories.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <button
                            type="button"
                            onClick={() => setStockHideZero((v) => !v)}
                            className={cn(
                              'h-8 rounded-[8px] border px-2.5 font-mono text-[11px] font-semibold transition-colors',
                              stockHideZero
                                ? 'border-brand/40 bg-brand-soft text-brand'
                                : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                            )}
                          >
                            Stock ≠ 0
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
                                <tr
                                  key={`${a.article}::${a.categorie}`}
                                  onClick={() => setStockArticle(a.article)}
                                  title="Ouvrir le détail de l'article"
                                  className="cursor-pointer border-b border-rule-soft last:border-0 hover:bg-secondary/40"
                                >
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
                                    {fmtQtyDec.format(a.stock)}
                                  </td>
                                  <td className="whitespace-nowrap px-2 py-1.5 text-right align-top font-mono text-[11px] tabular-nums text-muted-foreground">
                                    {fmtPmp.format(a.pmp)}
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
                  </Card>
                </Tile>
              </div>
            )}
            </ResponsiveGridLayout>
          </div>

          {/* Section cartes masquées en mode édition */}
          {editMode && items.some((it) => !it.visible) && (
            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-4 print:hidden">
              <span className="font-mono text-xs font-semibold text-muted-foreground">
                Cartes masquées :
              </span>
              {items
                .filter((it) => !it.visible)
                .map((it) => (
                  <Button
                    key={it.id}
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setVisible(it.id, true)}
                    className="font-mono text-xs"
                  >
                    <Eye size={12} className="mr-1" />
                    Afficher {KPI_TITLES[it.id]}
                  </Button>
                ))}
            </div>
          )}

          {/* Sheet de détail article (clic sur une ligne du KPI stock). */}
          <StockArticleSheet
            article={stockArticle}
            open={!!stockArticle}
            onOpenChange={(v) => {
              if (!v) setStockArticle(null)
            }}
          />
        </div>
    </AppLayout>
  )
}
