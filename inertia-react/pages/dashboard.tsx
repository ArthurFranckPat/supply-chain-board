import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { fr } from 'react-day-picker/locale'
import { toast } from 'sonner'

import AppLayout from '@r/layouts/app'
import { Calendar } from '@r/components/ui/calendar'
import { useRangeCalendar } from '@r/lib/use-range-calendar'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { usePrintFitPage } from '@r/lib/board/use-print-fit-page'
import { cn } from '@r/lib/utils'
import { X3Link } from '@r/components/x3-link'
import { Segment, DateWindowPill } from '@r/components/programme/toolbar'
import {
  DEFAULT_DASHBOARD_LAYOUT,
  GRID_COLS,
  KPI_TITLES,
  normalizeDashboardLayout,
  type DashboardLayout,
  type KpiId,
  type KpiWidth,
} from '@r/lib/dashboard/types'
import { useLayoutStore } from '@r/lib/dashboard/layout-store'
import {
  Eye,
  EyeOff,
  GripVertical,
  ArrowUp,
  ArrowDown,
  LoaderCircle,
  Calendar as CalendarIcon,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react'
import { DynamicIcon } from '../components/ui/dynamic-icon'
import { StockArticleSheet } from '@r/components/board/stock-article-sheet'
import {
  StockSparklineChart,
  ChargeBars,
  ProfondeurBars,
  CategoriesBars,
} from '@r/components/dashboard/charts'
import { Skeleton } from '@r/components/ui/skeleton'
import { Card, CardContent } from '@r/components/ui/card'
import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import { Separator } from '@r/components/ui/separator'
import { ToolbarSegmented, ToolbarSegment } from '@r/components/ui/toolbar'
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
 *
 * <!--
 * THESIS: régie KPI calme sur crème Cursor — hiérarchie par poids 400 et
 *   tracking, pas par Rausch ni ombres ; refuse le dashboard « cards flottantes ».
 * OWN-WORLD: produit Cursor light — sidebar #f3f3f3, chrome #f8f8f8,
 *   editor/cards #fcfcfc, base #141414, brand #f54e00 rare, accent #2778c1.
 *   Inter Variable, hairlines #e6e5e0, radius 8, pilules ink.
 * STORY: l’ordonnancer lit la charge et la profondeur sans bruit de chrome.
 * FIRST VIEWPORT: sidebar crème + TopBar quiet + grille KPI à héros 36/400.
 * FORM: identité Cursor pinée (remplace Airbnb sur cette surface) — seed n/a.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the
 *   finish review, the verdict, and DESIGN.md
 * -->
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
  joursRetard: number
  /** Qté totale commandée (EXTQTY) — dénominateur lisible côté commande. */
  qteCommandee: number
  qteRestante: number
  /** Pièces déjà pointées OP (CPLQTY) — détail OF pour le tooltip. */
  qteFaite: number
  /** Total lancé OF (EXTQTY) — détail OF pour le tooltip. */
  qteAProduire: number
  /** N° des OF de couverture — pour le tooltip. */
  numOfs: string[]
  heures: number
  postes: string[]
}

interface RetardProfondeurBucket {
  id: string
  label: string
  heures: number
  nbLignes: number
}

interface RetardProfondeurKpi {
  maxJours: number
  moyennePondereeHeures: number
  buckets: RetardProfondeurBucket[]
}

interface RetardChargeKpi {
  totalHeures: number
  nbLignes: number
  postes: { code: string; label: string; heures: number }[]
  lignes: RetardLigne[]
  profondeur: RetardProfondeurKpi
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
  retardCharge: {
    totalHeures: 0,
    nbLignes: 0,
    postes: [],
    lignes: [],
    profondeur: { maxJours: 0, moyennePondereeHeures: 0, buckets: [] },
  },
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

// ═════════════════════════════════════════════════════════════════════════ Colonnes DataTable

const otdLigneColumns: ColumnDef<OtdLigneDtl>[] = [
  {
    accessorKey: 'numCommande',
    header: () => 'Commande',
    cell: ({ row: { original: l } }) => (
      <>
        <X3Link
          fonction="GESSOH"
          cle={l.numCommande}
          title={`Ouvrir la commande ${l.numCommande} dans Sage X3`}
          className="font-mono text-xs font-medium text-foreground"
        >
          {l.numCommande}
        </X3Link>
        <div className="font-sans text-[10px] text-muted-foreground">{l.client}</div>
      </>
    ),
  },
  {
    accessorKey: 'article',
    header: () => 'Article',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs font-medium text-foreground">{getValue() as string}</span>
    ),
  },
  {
    id: 'poste',
    accessorFn: (l) => l.posteDeCharge ?? '',
    header: () => 'Poste',
    cell: ({ row: { original: l } }) =>
      l.posteDeCharge ? (
        <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.06em] text-secondary-foreground">
          {l.posteDeCharge}
        </span>
      ) : (
        <span className="font-sans text-[10px] text-muted-foreground">—</span>
      ),
  },
  {
    id: 'livre',
    enableSorting: false,
    header: () => 'Livré/Cmde',
    cell: ({ row: { original: l } }) => (
      <>
        {l.qteLivree}/{l.qteCmde}
      </>
    ),
    meta: {
      thClass: 'text-right',
      tdClass: 'whitespace-nowrap text-right font-mono text-xs text-muted-foreground',
    },
  },
]

const retardLigneColumns: ColumnDef<RetardLigne>[] = [
  {
    accessorKey: 'dateExp',
    header: () => 'Expé',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs font-medium text-destructive">
        {(getValue() as string) || '—'}
      </span>
    ),
    meta: { tdClass: 'whitespace-nowrap' },
  },
  {
    accessorKey: 'joursRetard',
    header: () => 'J+',
    cell: ({ row: { original: l } }) => {
      const j = l.joursRetard ?? 0
      if (j <= 0) return <span className="text-muted-foreground">—</span>
      return (
        <span
          className={cn(
            'text-xs font-medium tabular-nums',
            j > 7
              ? 'text-destructive'
              : j > 3
                ? 'text-[color:var(--color-suggere)]'
                : 'text-foreground'
          )}
        >
          {j}
        </span>
      )
    },
    meta: { thClass: 'text-right', tdClass: 'whitespace-nowrap text-right' },
  },
  {
    accessorKey: 'numCommande',
    header: () => 'Commande · Client',
    cell: ({ row: { original: l } }) => (
      <>
        <X3Link
          fonction="GESSOH"
          cle={l.numCommande}
          title={`Ouvrir la commande ${l.numCommande} dans Sage X3`}
          className="font-mono text-xs font-medium text-foreground"
        >
          {l.numCommande}
        </X3Link>
        <div className="font-sans text-xs text-muted-foreground">{l.client}</div>
      </>
    ),
  },
  {
    accessorKey: 'article',
    header: () => 'Article · Désignation',
    cell: ({ row: { original: l } }) => (
      <>
        <div className="font-mono text-xs font-medium text-foreground">{l.article}</div>
        <div className="font-sans text-xs leading-snug text-secondary-foreground">
          {l.designation || '—'}
        </div>
      </>
    ),
  },
  {
    id: 'postes',
    enableSorting: false,
    header: () => 'Poste',
    cell: ({ row: { original: l } }) =>
      l.postes.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {l.postes.map((p) => (
            <Badge
              key={p}
              variant="secondary"
              className="font-mono text-[10px] font-medium tracking-[0.06em]"
            >
              {p}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="font-sans text-xs text-muted-foreground">—</span>
      ),
  },
  {
    id: 'qte',
    enableSorting: false,
    header: () => 'Qté',
    cell: ({ row: { original: l } }) => (
      <span
        className="whitespace-nowrap font-mono text-xs font-medium tabular-nums text-foreground"
        title={[
          `Commandée : ${l.qteCommandee}`,
          `Déjà couvert : ${l.qteCommandee - l.qteRestante}`,
          `Reste à faire : ${l.qteRestante}`,
          l.numOfs.length > 0
            ? `OF ${l.numOfs.join(', ')} : ${l.qteFaite} pointés / ${l.qteAProduire} lancés`
            : undefined,
          `Charge : ${l.heures} h`,
        ]
          .filter(Boolean)
          .join('\n')}
      >
        <span className="text-ferme">{l.qteCommandee - l.qteRestante}</span>
        <span className="text-muted-foreground">/{l.qteCommandee}</span>
      </span>
    ),
    meta: { thClass: 'text-right', tdClass: 'text-right' },
  },
  {
    accessorKey: 'heures',
    header: () => 'Charge',
    cell: ({ row: { original: l } }) => (
      <span className="whitespace-nowrap font-mono text-xs font-medium tabular-nums text-foreground">
        {l.heures > 0 ? `${l.heures} h` : '—'}
      </span>
    ),
    meta: { thClass: 'text-right', tdClass: 'text-right' },
  },
]

const stockArticleColumns: ColumnDef<StockArticleRow>[] = [
  {
    accessorKey: 'article',
    header: () => 'Article',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs font-medium text-foreground">{getValue() as string}</span>
    ),
  },
  {
    accessorKey: 'designation',
    header: () => 'Désignation',
    cell: ({ getValue }) => (
      <span className="font-sans text-xs leading-snug text-secondary-foreground">
        {(getValue() as string) || '—'}
      </span>
    ),
  },
  {
    accessorKey: 'categorie',
    header: () => 'Cat.',
    cell: ({ getValue }) => (
      <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.06em] text-secondary-foreground">
        {getValue() as string}
      </span>
    ),
  },
  {
    accessorKey: 'stock',
    header: () => 'Stock',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs tabular-nums text-foreground">
        {fmtQtyDec.format(getValue() as number)}
      </span>
    ),
    meta: { thClass: 'text-right', tdClass: 'whitespace-nowrap text-right' },
  },
  {
    accessorKey: 'pmp',
    header: () => 'PMP',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {fmtPmp.format(getValue() as number)}
      </span>
    ),
    meta: { thClass: 'text-right', tdClass: 'whitespace-nowrap text-right' },
  },
  {
    accessorKey: 'valeur',
    header: () => 'Valeur',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs font-medium tabular-nums text-foreground">
        {fmtEuro.format(getValue() as number)}
      </span>
    ),
    meta: { thClass: 'text-right', tdClass: 'whitespace-nowrap text-right' },
  },
]

function otdColor(taux: number, nbTotal: number): string {
  if (nbTotal === 0) return 'var(--muted-foreground, #666666)'
  if (taux >= 95) return 'var(--color-ferme, #007041)'
  if (taux >= 85) return 'var(--color-suggere, #a46700)'
  return 'var(--destructive, #be1744)'
}

/** Chiffre héros KPI — encre (quieter). */
function KpiHero({
  value,
  unit,
  decimals = 0,
}: {
  value: number
  unit: string
  decimals?: number
}) {
  const label =
    decimals > 0
      ? value.toLocaleString('fr-FR', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : String(Math.round(value))
  return (
    <div className="text-[36px] font-normal leading-none tracking-[-0.04em] tabular-nums text-foreground">
      {label}
      <span className="ml-1 text-[13px] font-normal tracking-normal text-muted-foreground">
        {unit}
      </span>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════ Components
/** Titre de KPI : pastille + nom + méta optionnelle. */
function CardHeader({
  title,
  meta,
  alert = false,
}: {
  title: string
  meta?: string
  /** Pastille accent (orange Cursor) si alerte, neutre sinon. */
  alert?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn('size-1.5 shrink-0 rounded-full', alert ? 'bg-brand' : 'bg-foreground/20')}
        aria-hidden
      />
      <h2 className="min-w-0 truncate text-sm font-normal tracking-[-0.02em] text-foreground">
        {title}
      </h2>
      {meta ? (
        <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">{meta}</span>
      ) : null}
    </div>
  )
}

/** Période datée : « S26 2025 » en maille semaine (la clé `periode` « YYYY-Www »
 *  porte l'année ISO), sinon le label fourni (« janv. 26 »). */
const periodDated = (p: StockValuationPoint) =>
  p.periode.includes('-W') ? `S${p.periode.slice(-2)} ${p.periode.slice(0, 4)}` : p.label

/** Placeholder pour un KPI masqué. En mode édition, il reste un tile réordonnable
 * (pour le replacer) ; hors édition, il est masqué à l'impression. */
function HiddenTile({
  id,
  editMode,
  screenRank,
  onShow,
}: {
  id: KpiId
  editMode: boolean
  screenRank?: number
  onShow: () => void
}) {
  // Affiché uniquement en mode édition : sinon le KPI masqué disparaît totalement.
  if (!editMode) return null
  return (
    <div
      className="lg:col-span-1 transition-all duration-300 ease-out"
      style={
        { order: screenRank ?? 999, viewTransitionName: `kpi-tile-${id}` } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-rule bg-secondary/30 px-4 py-3 transition-[border-color,background-color] duration-200 hover:border-[#2778c1]/40 hover:bg-secondary/50 print:hidden">
        <EyeOff size={15} className="text-muted-foreground" />
        <span className="font-mono text-[10px] font-medium text-muted-foreground">
          {KPI_TITLES[id]}
        </span>
        <span className="text-xs text-muted-foreground">— masqué</span>
        <button
          type="button"
          onClick={onShow}
          className="ml-auto flex min-h-9 items-center gap-1 rounded px-3 font-mono text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Eye size={13} />
          <span>Afficher</span>
        </button>
      </div>
    </div>
  )
}

// Grille maison (issue #87) : react-grid-layout v2 laissait drag et resize
// inertes, et sa v1 est incompatible React 19 (`ReactDOM.findDOMNode`).
import { DashboardGrid, type DashboardGridItem } from '@r/components/dashboard/grid'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'

/**
 * Conteneur de KPI. Le placement est porté par `DashboardGrid` ; ici on ne
 * rend que le chrome de la carte (poignée de déplacement, largeurs rapides,
 * ordre d'impression, masquage).
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
    <div className="group relative flex h-full w-full flex-col">
      {/* La barre occupe sa propre rangée : elle ne masque plus le titre de la
          carte et reste utilisable quand une tuile est réduite. */}
      {editMode && (
        <div className="relative z-[45] flex shrink-0 flex-wrap items-center gap-1.5 rounded border border-rule bg-card px-1.5 py-1 shadow-sm print:hidden">
          <span
            data-grid-drag
            className="flex size-9 items-center justify-center cursor-grab touch-none select-none text-muted-foreground active:cursor-grabbing hover:text-[#2778c1]"
            title="Cliquer et glisser cette poignée pour réordonner la carte"
          >
            <GripVertical size={14} />
          </span>

          {/* Boutons de largeur rapide 1/3, 2/3, Full */}
          <div className="flex items-center gap-0.5 rounded border border-rule bg-secondary px-0.5">
            <button
              type="button"
              onClick={() => onWidth(1)}
              className={cn(
                'min-h-9 min-w-9 px-2 font-mono text-[10px] font-medium transition-colors',
                width === 1
                  ? 'bg-foreground/16 text-foreground rounded-[4px]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Largeur 1/3 (4 colonnes)"
            >
              ⅓
            </button>
            <button
              type="button"
              onClick={() => onWidth(2)}
              className={cn(
                'min-h-9 min-w-9 px-2 font-mono text-[10px] font-medium transition-colors',
                width === 2
                  ? 'bg-foreground/16 text-foreground rounded-[4px]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Largeur 2/3 (8 colonnes)"
            >
              ⅔
            </button>
            <button
              type="button"
              onClick={() => onWidth(3)}
              className={cn(
                'min-h-9 min-w-9 px-2 font-mono text-[10px] font-medium transition-colors',
                width === 3
                  ? 'bg-foreground/16 text-foreground rounded-[4px]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              title="Pleine largeur (12 colonnes)"
            >
              ▭
            </button>
          </div>

          {/* Ordre d'impression */}
          {onPrintMove && (
            <div className="flex items-center gap-0.5 rounded border border-rule bg-secondary px-0.5">
              <span
                className="px-1 font-mono text-[10px] text-muted-foreground"
                title="Ordre impression"
              >
                🖨️ #{printRank + 1}
              </span>
              <button
                type="button"
                onClick={() => onPrintMove(-1)}
                className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                title="Monter dans l'impression"
              >
                <ArrowUp size={11} />
              </button>
              <button
                type="button"
                onClick={() => onPrintMove(1)}
                className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                title="Descendre dans l'impression"
              >
                <ArrowDown size={11} />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onHide}
            className="flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-destructive"
            title="Masquer la carte"
          >
            <EyeOff size={13} />
          </button>
        </div>
      )}

      {/* Ordre d'impression */}
      {!editMode && (
        <span
          className="absolute right-3 top-3 z-10 hidden rounded bg-secondary/80 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground print:block"
          title="Ordre d'impression"
        >
          {printRank + 1}
        </span>
      )}

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  )
}

function Spinner({ label = 'Chargement des données…' }: { label?: string }) {
  return (
    <div className="flex h-[180px] w-full flex-col gap-3 p-4" role="status" aria-live="polite">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
        <span>{label}</span>
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-12" />
      </div>
      <div className="flex flex-1 items-end gap-2 pt-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="w-full rounded-t-sm"
            style={{ height: `${30 + ((i * 11) % 60)}%` }}
          />
        ))}
      </div>
    </div>
  )
}

function FetchErrorState({ message, onRetry }: { message?: string | null; onRetry: () => void }) {
  return (
    <div className="flex min-h-[180px] flex-col items-start justify-center gap-3 p-4" role="alert">
      <p className="text-sm font-medium leading-snug text-destructive">
        {message || 'Impossible de charger les données.'}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Réessayer
      </Button>
    </div>
  )
}

function RefreshingNotice({ label = 'Actualisation en cours…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status">
      <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
      <span>{label}</span>
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
    version: layoutVersion,
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

  const setVisible = useCallback(
    (id: KpiId, visible: boolean) => setStoreVisible(id, visible),
    [setStoreVisible]
  )
  const setWidth = useCallback(
    (id: KpiId, width: KpiWidth) => setStoreWidth(id, width),
    [setStoreWidth]
  )
  const movePrint = useCallback(
    (id: KpiId, dir: -1 | 1) => moveStorePrint(id, dir),
    [moveStorePrint]
  )

  const isVisible = useCallback(
    (id: KpiId) => items.find((it) => it.id === id)?.visible ?? true,
    [items]
  )
  const layoutItem = useCallback((id: KpiId) => items.find((it) => it.id === id), [items])
  const getPrintRank = useCallback((id: KpiId) => printOrder.indexOf(id), [printOrder])

  // Déclaré avant les mémos qui en dépendent (gridLayout, handleLayoutChange).
  const [editMode, setEditMode] = useState(false)

  const gridLayout = useMemo<DashboardGridItem[]>(
    () =>
      items
        .filter((it) => it.visible)
        .map((it) => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h })),
    [items]
  )

  const handleLayoutChange = useCallback(
    (next: DashboardGridItem[]) => {
      setStoreUpdateGridItems(next.map((l) => ({ i: l.id, x: l.x, y: l.y, w: l.w, h: l.h })))
    },
    [setStoreUpdateGridItems]
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
  const [otdSorting, setOtdSorting] = useState<SortingState[]>([])
  const [retardSorting, setRetardSorting] = useState<SortingState[]>([
    { id: 'joursRetard', desc: true },
  ])
  const [stockSorting, setStockSorting] = useState<SortingState[]>([{ id: 'valeur', desc: true }])

  // Stock filters
  const [stockSearch, setStockSearch] = useState('')
  const [stockCatFilter, setStockCatFilter] = useState('')
  const [stockHideZero, setStockHideZero] = useState(false)
  const [stockGrain, setStockGrain] = useState<StockGrain>('mois')
  const [stockRange, setStockRange] = useState<{ start: Date | null; end: Date | null } | null>(
    null
  )
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
      // `version` doit accompagner le payload : sans elle le serveur relit le
      // layout comme de la v1 et redouble les unités de grille.
      const layout: DashboardLayout = { version: layoutVersion, items, printOrder }
      fetch('/api/v1/user/dashboard-layout', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(layout),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .catch(() => toast.error('Échec de la sauvegarde de la disposition'))
    }, 600)
    return () => clearTimeout(timer)
  }, [layoutVersion, items, printOrder])

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
  const kpisRequestError = kpisData.error ? 'Échec du chargement des indicateurs.' : null
  const otdRequestError = otdData.error ? 'Échec du chargement de la ponctualité.' : null
  const profondeur = kpi.profondeur

  const stock = useMemo(
    () => (stockData.data ?? { stockValuation: EMPTY_STOCK }).stockValuation,
    [stockData.data]
  )
  const stockError = useMemo(() => (stockData.data ?? { x3Error: null }).x3Error, [stockData.data])
  const stockRequestError = stockData.error ? 'Échec du chargement du stock.' : null

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
    const sort = stockSorting[0]
    const filtered = stock.articles.filter((a) => {
      if (hideZero && a.stock === 0) return false
      if (cat && a.categorie !== cat) return false
      if (
        needle &&
        !a.article.toLowerCase().includes(needle) &&
        !a.designation.toLowerCase().includes(needle)
      )
        return false
      return true
    })
    if (!sort) return filtered
    const dir = sort.desc ? -1 : 1
    const by = sort.id as keyof StockArticleRow
    return [...filtered].sort((a, b) => {
      const av = a[by]
      const bv = b[by]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [stock.articles, stockSearch, stockCatFilter, stockHideZero, stockSorting])

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
    value: stockRange?.start
      ? { from: stockRange.start, to: stockRange.end ?? undefined }
      : undefined,
    onCommit: (r) => {
      setStockRange({ start: r.from ?? null, end: r.to ?? null })
      setStockCalendarOpen(false)
    },
  })

  return (
    <AppLayout
      title="Tableau de bord"
      active="dashboard"
      subtitle="Tableau de bord"
      theme="cursor"
      scrollable={false}
      maxWidth="full"
      hideFooter
      quietChrome
      mastheadActions={
        <div className="flex items-center gap-1">
          {editMode && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setLayout(DEFAULT_DASHBOARD_LAYOUT)}
              className="text-muted-foreground hover:text-foreground"
              title="Revenir au layout Fold par défaut"
            >
              <RotateCcw size={14} strokeWidth={1.75} />
              <span className="hidden sm:inline">Réinitialiser</span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setEditMode((v) => !v)}
            className={cn(
              editMode
                ? 'font-semibold text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-pressed={editMode}
            title={editMode ? 'Quitter la personnalisation' : 'Réordonner et masquer des KPI'}
          >
            <SlidersHorizontal size={14} strokeWidth={1.75} />
            {editMode ? 'Terminé' : 'Personnaliser'}
          </Button>
        </div>
      }
    >
      <div ref={contentElRef} className="h-full overflow-auto print:overflow-visible">
        <h1 className="sr-only">Tableau de bord</h1>
        {/* En-tête imprimable — masquée à l'écran, visible uniquement à l'impression */}
        <div
          data-print-header
          className="mb-6 hidden items-baseline justify-between border-b border-rule pb-4 print:flex"
        >
          <span className="text-xl font-semibold tracking-tight text-foreground">
            Supply Chain <span className="font-normal text-brand">AERECO</span>
            <span className="ml-3 font-mono text-sm font-normal text-muted-foreground">
              Tableau de bord
            </span>
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(
              new Date(props.referenceDate)
            )}
          </span>
        </div>

        <DashboardGrid
          items={gridLayout}
          editMode={editMode}
          onChange={handleLayoutChange}
          cols={GRID_COLS}
          rowHeight={24.5}
          gap={16}
          minW={6}
          minH={6}
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
                <Card
                  padding="sm"
                  className="dashboard-card h-full overflow-auto"
                  aria-busy={kpisData.loading}
                >
                  <CardHeader title="Charge en retard" alert={kpi.totalHeures > 0} />
                  {kpisData.loading && !kpisData.data ? (
                    <Spinner label="Chargement des indicateurs…" />
                  ) : x3Error ? (
                    <FetchErrorState message={x3Error} onRetry={kpisData.retry} />
                  ) : kpisRequestError && !kpisData.data ? (
                    <FetchErrorState message={kpisRequestError} onRetry={kpisData.retry} />
                  ) : kpi.totalHeures === 0 && kpi.postes.length === 0 ? (
                    <>
                      {kpisData.loading ? <RefreshingNotice /> : null}
                      {kpisRequestError ? (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                          {kpisRequestError}
                        </p>
                      ) : null}
                      <KpiHero value={0} unit="h" />
                      <p className="mt-1 text-sm font-normal text-muted-foreground">Aucun retard</p>
                    </>
                  ) : (
                    <>
                      {kpisData.loading ? <RefreshingNotice /> : null}
                      {kpisRequestError ? (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                          {kpisRequestError}
                        </p>
                      ) : null}
                      <div className="flex items-end justify-between gap-3">
                        <KpiHero
                          value={kpi.totalHeures}
                          unit="h"
                          decimals={Number.isInteger(kpi.totalHeures) ? 0 : 1}
                        />
                        <div className="pb-1.5 text-right text-xs font-normal leading-tight text-muted-foreground">
                          <span className="font-medium tabular-nums text-foreground">
                            {kpi.nbLignes}
                          </span>{' '}
                          ligne
                          {kpi.nbLignes > 1 ? 's' : ''}
                          <span className="mx-1 text-muted-foreground">·</span>
                          <span className="font-medium tabular-nums text-foreground">
                            {kpi.postes.length}
                          </span>{' '}
                          poste
                          {kpi.postes.length > 1 ? 's' : ''}
                        </div>
                      </div>

                      {kpi.postes.length > 0 ? (
                        <div className="mt-4">
                          <ChargeBars postes={kpi.postes} />
                        </div>
                      ) : null}
                    </>
                  )}
                </Card>
              </Tile>
            </div>
          )}

          {/* ═════ KPI — Profondeur de retard ═════ */}
          {isVisible('profondeur') && (
            <div key="profondeur">
              <Tile
                id="profondeur"
                editMode={editMode}
                printRank={getPrintRank('profondeur')}
                width={layoutItem('profondeur')?.width ?? 1}
                onWidth={setWidth.bind(null, 'profondeur')}
                onHide={() => setVisible('profondeur', false)}
                onPrintMove={(dir) => movePrint('profondeur', dir)}
              >
                <Card
                  padding="sm"
                  className="dashboard-card h-full overflow-auto"
                  aria-busy={kpisData.loading}
                >
                  <CardHeader title="Profondeur" alert={(profondeur?.maxJours ?? 0) > 0} />
                  {kpisData.loading && !kpisData.data ? (
                    <Spinner label="Chargement de la profondeur…" />
                  ) : x3Error ? (
                    <FetchErrorState message={x3Error} onRetry={kpisData.retry} />
                  ) : kpisRequestError && !kpisData.data ? (
                    <FetchErrorState message={kpisRequestError} onRetry={kpisData.retry} />
                  ) : (profondeur?.maxJours ?? 0) === 0 ? (
                    <>
                      {kpisData.loading ? <RefreshingNotice /> : null}
                      {kpisRequestError ? (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                          {kpisRequestError}
                        </p>
                      ) : null}
                      <KpiHero value={0} unit="j" />
                    </>
                  ) : (
                    <>
                      {kpisData.loading ? <RefreshingNotice /> : null}
                      {kpisRequestError ? (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                          {kpisRequestError}
                        </p>
                      ) : null}
                      <div className="flex items-end justify-between gap-3">
                        <KpiHero value={profondeur?.maxJours ?? 0} unit="j" />
                        <div className="pb-1.5 text-right text-xs font-normal leading-tight text-muted-foreground">
                          moy.{' '}
                          <span className="font-medium tabular-nums text-foreground">
                            {profondeur?.moyennePondereeHeures ?? 0}
                          </span>{' '}
                          j
                        </div>
                      </div>

                      {(profondeur?.buckets ?? []).some((b) => b.nbLignes > 0) ? (
                        <div className="mt-4">
                          <ProfondeurBars buckets={profondeur?.buckets ?? []} />
                        </div>
                      ) : null}
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
                <Card
                  padding="sm"
                  className="dashboard-card h-full overflow-auto [content-visibility:auto] [contain-intrinsic-size:auto_280px]"
                  aria-busy={otdData.loading}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          otd.length > 0 && otd.every((p) => p.nbTotal === 0 || p.tauxOtif >= 95)
                            ? 'var(--color-ferme, #007041)'
                            : otd.some((p) => p.nbTotal > 0)
                              ? 'var(--color-brand, #f54e00)'
                              : 'color-mix(in srgb, var(--foreground) 20%, transparent)',
                      }}
                    />
                    <h2 className="text-sm font-normal leading-none tracking-[-0.02em] text-foreground">
                      OTIF
                    </h2>
                    {/* Sélecteur de plage */}
                    <div className="ml-auto flex items-center gap-1">
                      <DateWindowPill
                        open={calendarOpen}
                        onOpenChange={setCalendarOpen}
                        selected={{
                          from: otdRange?.start ?? undefined,
                          to: otdRange?.end ?? undefined,
                        }}
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
                    <ToolbarSegmented>
                      <ToolbarSegment
                        active={otdMode === 'demandee'}
                        onClick={() => setOtdMode('demandee')}
                      >
                        Demandée
                      </ToolbarSegment>
                      <ToolbarSegment
                        active={otdMode === 'acceptee'}
                        onClick={() => setOtdMode('acceptee')}
                      >
                        Acceptée
                      </ToolbarSegment>
                    </ToolbarSegmented>
                  </div>

                  {otdData.loading && !otdData.data ? (
                    <Spinner label="Chargement de la ponctualité…" />
                  ) : otdError ? (
                    <FetchErrorState message={otdError} onRetry={otdData.retry} />
                  ) : otdRequestError && !otdData.data ? (
                    <FetchErrorState message={otdRequestError} onRetry={otdData.retry} />
                  ) : otd.length === 0 ? (
                    <>
                      {otdData.loading ? <RefreshingNotice /> : null}
                      {otdRequestError ? (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                          {otdRequestError}
                        </p>
                      ) : null}
                      <p className="text-sm font-normal text-muted-foreground">
                        Aucune ligne dans la période
                      </p>
                    </>
                  ) : (
                    <>
                      {otdData.loading ? <RefreshingNotice /> : null}
                      {otdRequestError ? (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                          {otdRequestError}
                        </p>
                      ) : null}
                      {/* Filtre client + toggle détails */}
                      <div className="mb-2 flex items-center gap-1.5">
                        <InputGroup className="h-9 flex-1">
                          <InputGroupAddon align="inline-start">
                            <Search size={13} className="text-muted-foreground" />
                          </InputGroupAddon>
                          <InputGroupInput
                            type="text"
                            value={clientFilter}
                            onChange={(e) => setClientFilter(e.target.value)}
                            placeholder="Filtrer par client"
                            aria-label="Filtrer les lignes par client"
                            className="h-9 text-xs"
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
                          size="sm"
                          onClick={() => setDetailsOpen((v) => !v)}
                          aria-expanded={detailsOpen}
                          title={detailsOpen ? 'Masquer les détails' : 'Afficher les détails'}
                        >
                          <DynamicIcon
                            name={detailsOpen ? 'expand_more' : 'chevron_right'}
                            size={13}
                            className="text-muted-foreground"
                          />
                          <span>Détails</span>
                        </Button>
                      </div>

                      {otd.map((p, i) => (
                        <div
                          key={p.label}
                          className={cn(
                            'mt-4 border-t border-border/60 pt-4',
                            i === 0 && 'mt-0 border-t-0 pt-0'
                          )}
                        >
                          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                            {p.label}
                          </div>

                          {p.nbTotal === 0 ? (
                            <p className="text-sm font-normal text-muted-foreground">
                              Rien à traiter
                            </p>
                          ) : (
                            <>
                              <div className="flex items-end justify-between gap-3">
                                <div
                                  className="text-2xl font-normal leading-none tracking-[-0.04em] tabular-nums"
                                  style={{ color: otdColor(p.tauxOtif, p.nbTotal) }}
                                >
                                  {p.tauxOtif}
                                  <span className="ml-0.5 text-sm font-medium text-muted-foreground">
                                    %
                                  </span>
                                </div>
                                <div className="pb-1 text-right text-xs font-normal leading-tight text-muted-foreground">
                                  <span className="font-medium tabular-nums text-foreground">
                                    {p.nbOtif}
                                  </span>
                                  /{p.nbTotal}
                                  <br />
                                  hors délai : {p.nbTotal - p.nbOtif}
                                </div>
                              </div>

                              {detailsOpen && p.lignesNon.length > 0 && (
                                <DataTable
                                  columns={otdLigneColumns}
                                  rows={p.lignesNon}
                                  sorting={otdSorting}
                                  onSortingChange={setOtdSorting}
                                  virtualize={false}
                                  tableClass="w-full border-collapse text-left"
                                  scrollContainerClass="-mx-2 mt-4 max-h-[160px] overflow-auto rounded-none border-0 shadow-none"
                                  theadRowClass="bg-transparent"
                                  getRowKey={(l) =>
                                    `${l.numCommande}::${l.article}::${l.posteDeCharge ?? '-'}`
                                  }
                                />
                              )}

                              {detailsOpen && p.lignesNon.length === 0 && (
                                <p className="mt-2 text-sm font-normal text-muted-foreground">
                                  Aucune ligne hors délai
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
                <Card
                  padding="sm"
                  className="dashboard-card h-full overflow-auto [content-visibility:auto] [contain-intrinsic-size:auto_280px]"
                  aria-busy={stockData.loading}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="size-1.5 shrink-0 rounded-full bg-foreground/20" />
                    <h2 className="text-sm font-normal leading-none tracking-[-0.02em] text-foreground">
                      Stock
                    </h2>
                    <div className="ml-auto flex items-center gap-1">
                      <DateWindowPill
                        open={stockCalendarOpen}
                        onOpenChange={setStockCalendarOpen}
                        selected={{
                          from: stockRange?.start ?? undefined,
                          to: stockRange?.end ?? undefined,
                        }}
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
                    <ToolbarSegmented>
                      <ToolbarSegment
                        active={stockGrain === 'mois'}
                        onClick={() => setStockGrain('mois')}
                      >
                        Mois
                      </ToolbarSegment>
                      <ToolbarSegment
                        active={stockGrain === 'semaine'}
                        onClick={() => setStockGrain('semaine')}
                      >
                        Sem.
                      </ToolbarSegment>
                    </ToolbarSegmented>
                  </div>

                  {stockData.loading && !stockData.data ? (
                    <Spinner label="Chargement du stock…" />
                  ) : stockError ? (
                    <FetchErrorState message={stockError} onRetry={stockData.retry} />
                  ) : stockRequestError && !stockData.data ? (
                    <FetchErrorState message={stockRequestError} onRetry={stockData.retry} />
                  ) : stock.series.length === 0 ? (
                    <>
                      {stockData.loading ? <RefreshingNotice /> : null}
                      {stockRequestError ? (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                          {stockRequestError}
                        </p>
                      ) : null}
                      <p className="text-sm font-normal text-muted-foreground">
                        Aucune donnée dans la période
                      </p>
                    </>
                  ) : (
                    <>
                      {stockData.loading ? <RefreshingNotice /> : null}
                      {stockRequestError ? (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                          {stockRequestError}
                        </p>
                      ) : null}
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <div className="text-[36px] font-normal leading-none tracking-[-0.04em] tabular-nums text-foreground">
                            {fmtEuro.format(stock.totalActuel)}
                          </div>
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                            {stock.deltaPct !== 0 && (
                              <span
                                className="font-medium tabular-nums"
                                style={{
                                  color:
                                    stock.deltaPct > 0
                                      ? 'var(--color-brand, #f54e00)'
                                      : 'var(--color-ferme, #007041)',
                                }}
                              >
                                {stock.deltaPct > 0 ? '+' : ''}
                                {stock.deltaPct}%
                              </span>
                            )}
                            <span>vs début de plage</span>
                          </div>
                        </div>
                        <div className="pb-1 text-right text-xs font-normal leading-tight text-muted-foreground">
                          <span className="font-medium tabular-nums text-foreground">
                            {stock.nbArticles}
                          </span>{' '}
                          art.
                        </div>
                      </div>

                      <StockSparklineChart series={stock.series} />

                      <div className="mt-4">
                        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
                          Top catégories
                        </div>
                        <CategoriesBars categories={stock.categories} />
                      </div>
                    </>
                  )}
                </Card>
              </Tile>
            </div>
          )}

          {/* ═════ KPI #4 — Lignes en retard ═════ */}
          {isVisible('lignes') && (
            <div key="lignes" id="kpi-lignes">
              <Tile
                id="lignes"
                editMode={editMode}
                printRank={getPrintRank('lignes')}
                width={layoutItem('lignes')?.width ?? 2}
                onWidth={setWidth.bind(null, 'lignes')}
                onHide={() => setVisible('lignes', false)}
                onPrintMove={(dir) => movePrint('lignes', dir)}
              >
                <Card
                  padding="sm"
                  className="dashboard-card h-full overflow-auto"
                  aria-busy={kpisData.loading}
                >
                  <CardHeader
                    title="Lignes en retard"
                    meta={`${kpi.nbLignes}`}
                    alert={kpi.nbLignes > 0}
                  />
                  {kpisData.loading && !kpisData.data ? (
                    <Spinner label="Chargement des lignes en retard…" />
                  ) : x3Error ? (
                    <FetchErrorState message={x3Error} onRetry={kpisData.retry} />
                  ) : kpisRequestError && !kpisData.data ? (
                    <FetchErrorState message={kpisRequestError} onRetry={kpisData.retry} />
                  ) : kpi.lignes.length === 0 ? (
                    <>
                      {kpisData.loading ? <RefreshingNotice /> : null}
                      {kpisRequestError ? (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                          {kpisRequestError}
                        </p>
                      ) : null}
                      <p className="text-sm font-normal text-muted-foreground">
                        Aucune ligne dans la période
                      </p>
                    </>
                  ) : (
                    <>
                      {kpisData.loading ? <RefreshingNotice /> : null}
                      {kpisRequestError ? (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                          {kpisRequestError}
                        </p>
                      ) : null}
                      <DataTable
                        columns={retardLigneColumns}
                        rows={kpi.lignes}
                        sorting={retardSorting}
                        onSortingChange={setRetardSorting}
                        virtualize={false}
                        tableClass="w-full border-collapse text-left"
                        scrollContainerClass="-mx-2 overflow-auto print:overflow-visible rounded-none border-0 shadow-none"
                        theadRowClass="bg-transparent"
                        getRowKey={(l) =>
                          `${l.numCommande}::${l.article}::${l.dateExpIso ?? l.dateExp}`
                        }
                      />
                    </>
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
                <Card
                  padding="sm"
                  className="dashboard-card h-full overflow-auto [content-visibility:auto] [contain-intrinsic-size:auto_280px]"
                  aria-busy={stockData.loading}
                >
                  <CardHeader
                    title="Articles"
                    meta={`${filteredArticles.length}/${stock.nbArticles}`}
                  />
                  {stockData.loading && !stockData.data ? (
                    <Spinner label="Chargement des articles…" />
                  ) : stockError ? (
                    <FetchErrorState message={stockError} onRetry={stockData.retry} />
                  ) : stockRequestError && !stockData.data ? (
                    <FetchErrorState message={stockRequestError} onRetry={stockData.retry} />
                  ) : (
                    <>
                      {stockData.loading ? <RefreshingNotice /> : null}
                      {stockRequestError ? (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                          {stockRequestError}
                        </p>
                      ) : null}
                      {/* Barre de filtres */}
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <InputGroup className="h-9 flex-1">
                          <InputGroupAddon align="inline-start">
                            <Search size={13} className="text-muted-foreground" />
                          </InputGroupAddon>
                          <InputGroupInput
                            type="text"
                            value={stockSearch}
                            onChange={(e) => setStockSearch(e.target.value)}
                            placeholder="Article ou désignation"
                            aria-label="Filtrer les articles"
                            className="h-9 text-xs"
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
                          onValueChange={(val) =>
                            setStockCatFilter(val === 'all' ? '' : (val ?? ''))
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            className="h-9 border-border bg-card font-mono text-xs font-medium text-foreground"
                          >
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
                            'min-h-9 rounded-[8px] border px-2.5 font-mono text-xs font-medium transition-colors',
                            stockHideZero
                              ? 'border-foreground/20 bg-foreground/16 text-foreground'
                              : 'border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                          )}
                        >
                          Stock ≠ 0
                        </button>
                      </div>

                      <DataTable
                        columns={stockArticleColumns}
                        rows={filteredArticles}
                        sorting={stockSorting}
                        onSortingChange={setStockSorting}
                        virtualize={false}
                        tableClass="w-full border-collapse text-left"
                        scrollContainerClass="-mx-2 overflow-auto print:overflow-visible rounded-none border-0 shadow-none"
                        theadRowClass="bg-transparent"
                        onRowClick={(a) => setStockArticle(a.article)}
                        getRowKey={(a) => `${a.article}::${a.categorie}`}
                      />
                    </>
                  )}
                </Card>
              </Tile>
            </div>
          )}
        </DashboardGrid>

        {/* Section cartes masquées en mode édition */}
        {editMode && items.some((it) => !it.visible) && (
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-6 print:hidden">
            <span className="font-mono text-xs font-normal text-muted-foreground">
              Cartes masquées :
            </span>
            {items
              .filter((it) => !it.visible)
              .map((it) => (
                <Button
                  key={it.id}
                  type="button"
                  variant="outline"
                  size="sm"
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
