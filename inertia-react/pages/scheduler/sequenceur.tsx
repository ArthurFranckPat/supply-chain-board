import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Head, router } from '@inertiajs/react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  CircleCheck,
  Factory,
  FlaskConical,
  Info,
  Package,
  RefreshCw,
  Search,
  TriangleAlert,
} from 'lucide-react'
import { toast } from 'sonner'

import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import { route } from '@r/lib/routes'
import { X3Link } from '@r/components/x3-link'
import type { SortingState } from '@r/components/ui/data-table'
import {
  PILL,
  Segment,
  SegmentButton,
  ToolbarRow,
  ToolbarSpacer,
  FilterMenu,
} from '@r/components/vision/toolbar'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from '@r/components/ui/combobox'
import {
  type EngagementRow,
  type Urgency,
  URGENCY_RANK,
  fmtDateFr,
  fmtH,
  fmtJ,
  saturation,
  urgencyColor,
  urgencyOf,
} from '@r/lib/board/engagement-format'
import type { FeasStatus, PosteNature, PosteNatureFilterKey } from '@r/lib/board/types'
import { fetchBoardFeasibility } from '@r/lib/board/feasibility-map'
import OfDetailSheet from '@r/components/of/of-detail-sheet'
import SequenceurFirmBar, { type BatchItem } from '@r/components/sequenceur/sequenceur-firm-bar'

/**
 * Page « Séquenceur » — board /programme en table (#46/#100 unifiés).
 * Filtre poste côté client (plus de route `/sequenceur/:poste`).
 */

interface PosteSummary {
  code: string
  label: string
  count: number
  totalHours: number
  weeklyCapacityHours: number | null
  atelier: string
  atelierLabel: string
  nature: PosteNature
}

type SequenceurRow = EngagementRow & {
  posteCode: string
  posteLabel: string
  status?: number
  statusLabel?: string
}

type FeasFilter = 'all' | 'ok' | 'qc' | 'blocked' | 'unknown'
/** Statuts WIPSTA X3 affichés — 1 ferme / 2 planifié / 3 suggéré. */
type StatusKey = 1 | 2 | 3
const ALL_STATUSES: StatusKey[] = [1, 2, 3]

const ALL_POSTE_NATURES: PosteNatureFilterKey[] = ['assemblage_pf', 'assemble_sous_ensemble']

const POSTE_NATURE_CHIPS: { k: PosteNatureFilterKey; label: string }[] = [
  { k: 'assemblage_pf', label: 'Assemblage PF' },
  { k: 'assemble_sous_ensemble', label: 'Sous-ensemble' },
]

const STATUS_FILTER_CHIPS: { k: StatusKey; label: string }[] = [
  { k: 1, label: 'Ferme' },
  { k: 2, label: 'Planifié' },
  { k: 3, label: 'Suggéré' },
]

// Classes littérales (pas de `bg-${k}` dynamique — Tailwind v4 scanne le
// source statiquement, une interpolation ne serait pas détectée).
const STATUS_DOT_CLASS: Record<StatusKey, string> = {
  1: 'bg-ferme',
  2: 'bg-planifie',
  3: 'bg-suggere',
}

/** Couleur de libellé de statut — même sémantique que /programme. */
function statusTextClass(status: number | undefined): string {
  if (status === 1) return 'text-ferme'
  if (status === 2) return 'text-planifie'
  if (status === 3) return 'text-suggere'
  return 'text-muted-foreground'
}

/** OF affermissable en un clic (planifié/suggéré) — les fermes sont déjà lancés. */
function affirmable(status: number | undefined): boolean {
  return status === 2 || status === 3
}

/** Split charge affichée : ferme (WIPSTA 1) vs lançable (planifié/suggéré). */
function splitChargeHours(rows: { hours: number; status?: number }[]): {
  ferme: number
  lancable: number
} {
  let ferme = 0
  let lancable = 0
  for (const r of rows) {
    if (r.status === 1) ferme += r.hours
    else if (affirmable(r.status)) lancable += r.hours
  }
  return {
    ferme: Math.round(ferme * 100) / 100,
    lancable: Math.round(lancable * 100) / 100,
  }
}

interface SequenceurPageProps {
  postes: PosteSummary[]
  ateliers: { code: string; label: string }[]
  rows: SequenceurRow[]
  /** Fenêtre matching/faisabilité — alignée loadOrderImpacts /programme. */
  feasibilityWindow: { from: string; to: string } | null
  x3Error: string | null
}

const ROW_GRID_ALL =
  'grid-cols-[2rem_6rem_7rem_5.5rem_6.5rem_1.3fr_5.5rem_6rem_1.2fr_5rem_4rem_4rem]'
const ROW_GRID_ONE = 'grid-cols-[2rem_7rem_5.5rem_6.5rem_1.3fr_5.5rem_6rem_1.2fr_5rem_4rem_4rem]'

/** Filtres persistés au refresh (sessionStorage). */
const FILTERS_STORAGE_KEY = 'sequenceur:filters'

type StoredFilters = {
  ateliers: string[]
  posteNatures: PosteNatureFilterKey[]
  query: string
  urgencyFilter: Urgency | 'all'
  feasFilter: FeasFilter
  statusFilter: StatusKey[]
  /** Poste sélectionné (filtre client) — aussi synchronisé en `?poste=`. */
  poste: string | null
}

function readStoredFilters(): StoredFilters {
  const defaults: StoredFilters = {
    ateliers: [],
    posteNatures: [...ALL_POSTE_NATURES],
    query: '',
    urgencyFilter: 'all',
    feasFilter: 'all',
    statusFilter: [...ALL_STATUSES],
    poste: null,
  }
  try {
    const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY)
    if (!raw) {
      // Migration clé atelier seule (avant bundling des filtres).
      const legacy = sessionStorage.getItem('sequenceur:ateliers')
      if (legacy) {
        defaults.ateliers = JSON.parse(legacy) as string[]
      }
      return defaults
    }
    const parsed = JSON.parse(raw) as Partial<StoredFilters>
    return {
      ateliers: Array.isArray(parsed.ateliers) ? parsed.ateliers : [],
      posteNatures:
        Array.isArray(parsed.posteNatures) && parsed.posteNatures.length > 0
          ? (parsed.posteNatures.filter((n) =>
              ALL_POSTE_NATURES.includes(n)
            ) as PosteNatureFilterKey[])
          : [...ALL_POSTE_NATURES],
      query: typeof parsed.query === 'string' ? parsed.query : '',
      urgencyFilter:
        parsed.urgencyFilter === 'overdue' ||
        parsed.urgencyFilter === 'week' ||
        parsed.urgencyFilter === 'later' ||
        parsed.urgencyFilter === 'all'
          ? parsed.urgencyFilter
          : 'all',
      feasFilter:
        parsed.feasFilter === 'ok' ||
        parsed.feasFilter === 'qc' ||
        parsed.feasFilter === 'blocked' ||
        parsed.feasFilter === 'unknown' ||
        parsed.feasFilter === 'all'
          ? parsed.feasFilter
          : 'all',
      statusFilter:
        Array.isArray(parsed.statusFilter) && parsed.statusFilter.length > 0
          ? (parsed.statusFilter.filter((s) =>
              ALL_STATUSES.includes(s as StatusKey)
            ) as StatusKey[])
          : [...ALL_STATUSES],
      poste: typeof parsed.poste === 'string' && parsed.poste ? parsed.poste : null,
    }
  } catch {
    return defaults
  }
}

function writeStoredFilters(patch: Partial<StoredFilters>) {
  try {
    const cur = readStoredFilters()
    const next = { ...cur, ...patch }
    sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // sessionStorage indisponible — filtre session React seule.
  }
}

function natureOk(nature: PosteNature | undefined, filter: Set<PosteNatureFilterKey>): boolean {
  const n = nature ?? 'autre'
  if (n === 'autre') {
    return filter.has('assemblage_pf') && filter.has('assemble_sous_ensemble')
  }
  return filter.has(n)
}

/** Poste initial : `?poste=` prime sur sessionStorage. */
function readInitialPoste(stored: StoredFilters): string | null {
  try {
    const q = new URLSearchParams(window.location.search).get('poste')?.trim()
    if (q) return q
  } catch {
    // SSR / pas de window
  }
  return stored.poste
}

function syncPosteQueryParam(poste: string | null) {
  try {
    const url = new URL(window.location.href)
    if (poste) url.searchParams.set('poste', poste)
    else url.searchParams.delete('poste')
    url.searchParams.delete('vue')
    window.history.replaceState({}, '', url)
  } catch {
    // ignore
  }
}

function feasBadge(st: FeasStatus['st'] | 'unknown' | undefined, ofStatus?: number) {
  if (st === 'ok') {
    // OF ferme (WIPSTA 1) : déjà lancé — vert ferme.
    // Planifié/suggéré : lançable — teal planifié (aligné split charge).
    const launched = ofStatus === 1
    return {
      label: launched ? 'Lancé' : 'Lançable',
      className: launched ? 'bg-ferme/15 text-ferme' : 'bg-planifie/15 text-planifie',
      icon: CircleCheck,
    }
  }
  if (st === 'qc')
    return {
      label: 'Sous CQ',
      className: 'bg-suggere/15 text-suggere',
      icon: FlaskConical,
    }
  if (st === 'blocked')
    return {
      label: 'Bloqué',
      className: 'bg-destructive/10 text-destructive',
      icon: TriangleAlert,
    }
  return {
    label: 'N/D',
    className: 'bg-secondary text-muted-foreground',
    icon: RefreshCw,
  }
}

/** Rang faisabilité pour le tri colonne (aligné sur le tri défaut post-calcul). */
function feasRank(st: FeasStatus['st'] | undefined): number {
  if (st === 'ok') return 0
  if (st === 'qc') return 1
  if (st === 'blocked') return 2
  return 3
}

/**
 * Tri manuel colonnes — même cycle que /suivi (DataTable) : asc → desc → off.
 * Appliqué uniquement quand `sorting` est non vide ; sinon le tri métier défaut
 * (faisabilité → poste → urgence → livraison) reste en place.
 */
function sortSequenceurRows(
  rows: SequenceurRow[],
  sorting: SortingState[],
  feasibility: Record<string, FeasStatus>
): SequenceurRow[] {
  if (sorting.length === 0) return rows
  const { id, desc } = sorting[0]
  const sorted = [...rows]
  sorted.sort((a, b) => {
    let cmp = 0
    switch (id) {
      case 'poste':
        cmp = a.posteCode.localeCompare(b.posteCode)
        break
      case 'numOf':
        cmp = a.numOf.localeCompare(b.numOf)
        break
      case 'status':
        cmp = (a.status ?? 0) - (b.status ?? 0)
        break
      case 'article':
        cmp = a.article.localeCompare(b.article)
        break
      case 'designation':
        cmp = (a.designation ?? '').localeCompare(b.designation ?? '', 'fr')
        break
      case 'avancement': {
        const av = (r: SequenceurRow) => (r.launched > 0 ? r.done / r.launched : -1)
        cmp = av(a) - av(b)
        break
      }
      case 'faisabilite':
        cmp = feasRank(feasibility[a.numOf]?.st) - feasRank(feasibility[b.numOf]?.st)
        break
      case 'commande': {
        const cmd = (r: SequenceurRow) => r.commandes[0]?.numCommande ?? ''
        cmp = cmd(a).localeCompare(cmd(b))
        break
      }
      case 'livraison': {
        const da = a.livraisonIso ?? '9999-12-31'
        const db = b.livraisonIso ?? '9999-12-31'
        cmp = da.localeCompare(db)
        break
      }
      case 'heures':
      case 'jours':
        cmp = a.hours - b.hours
        break
      default:
        return 0
    }
    if (cmp !== 0) return desc ? -cmp : cmp
    return a.numOf.localeCompare(b.numOf)
  })
  return sorted
}

function toggleSortingState(sorting: SortingState[], columnId: string): SortingState[] {
  const existing = sorting.find((s) => s.id === columnId)
  if (!existing) return [{ id: columnId, desc: false }]
  if (!existing.desc) return [{ id: columnId, desc: true }]
  return []
}

/** En-tête cliquable — mêmes icônes / cycle que `DataTable` (/suivi). */
function SortHeader({
  id,
  label,
  sorting,
  onToggle,
  className,
}: {
  id: string
  label: ReactNode
  sorting: SortingState[]
  onToggle: (id: string) => void
  className?: string
}) {
  const sorted = sorting.find((s) => s.id === id)
  return (
    <span
      role="button"
      tabIndex={0}
      aria-sort={sorted ? (sorted.desc ? 'descending' : 'ascending') : undefined}
      className={cn(
        'inline-flex cursor-pointer select-none items-center gap-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded',
        sorted && 'font-bold text-foreground',
        className
      )}
      onClick={() => onToggle(id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(id)
        }
      }}
    >
      <span>{label}</span>
      {!sorted ? (
        <ChevronsUpDown size={12} strokeWidth={1.75} className="text-muted-foreground/50" />
      ) : sorted.desc ? (
        <ArrowDown size={12} strokeWidth={1.75} className="text-primary" />
      ) : (
        <ArrowUp size={12} strokeWidth={1.75} className="text-primary" />
      )}
    </span>
  )
}

export default function Sequenceur(props: SequenceurPageProps) {
  const anchorRef = useComboboxAnchor()
  const stored = useMemo(() => readStoredFilters(), [])
  const [posteQuery, setPosteQuery] = useState('')
  const [urgencyFilter, setUrgencyFilter] = useState<Urgency | 'all'>(stored.urgencyFilter)
  const [query, setQuery] = useState(stored.query)
  const [atelierFilter, setAtelierFilter] = useState<Set<string>>(() => new Set(stored.ateliers))
  const [posteNatureFilter, setPosteNatureFilter] = useState<Set<PosteNatureFilterKey>>(
    () => new Set(stored.posteNatures)
  )
  const [statusFilter, setStatusFilter] = useState<Set<StatusKey>>(
    () => new Set(stored.statusFilter)
  )
  const [feasFilter, setFeasFilter] = useState<FeasFilter>(stored.feasFilter)
  const [feasibility, setFeasibility] = useState<Record<string, FeasStatus>>({})
  const [feasLoading, setFeasLoading] = useState(false)
  const [feasDone, setFeasDone] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batch, setBatch] = useState<Record<string, BatchItem>>({})
  const [batchRunning, setBatchRunning] = useState(false)
  const [detailOf, setDetailOf] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  /** Tri colonnes (comme /suivi) — vide = tri métier défaut. */
  const [sorting, setSorting] = useState<SortingState[]>([])
  const customSort = sorting.length > 0
  const toggleColumnSort = useCallback((columnId: string) => {
    setSorting((prev) => toggleSortingState(prev, columnId))
  }, [])

  const toggleAtelier = (code: string) => {
    setAtelierFilter((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      writeStoredFilters({ ateliers: [...next] })
      return next
    })
  }

  const togglePosteNature = (n: PosteNatureFilterKey) => {
    setPosteNatureFilter((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      writeStoredFilters({ posteNatures: [...next] })
      return next
    })
  }

  const toggleStatus = (k: StatusKey) => {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      writeStoredFilters({ statusFilter: [...next] })
      return next
    })
  }

  const setQueryPersisted = (value: string) => {
    setQuery(value)
    writeStoredFilters({ query: value })
  }

  const setUrgencyPersisted = (value: Urgency | 'all') => {
    setUrgencyFilter(value)
    writeStoredFilters({ urgencyFilter: value })
  }

  const setFeasFilterPersisted = (value: FeasFilter) => {
    setFeasFilter(value)
    writeStoredFilters({ feasFilter: value })
  }

  const posteAtelier = useMemo(
    () => new Map(props.postes.map((p) => [p.code, p.atelier])),
    [props.postes]
  )
  const posteNature = useMemo(
    () => new Map(props.postes.map((p) => [p.code, p.nature])),
    [props.postes]
  )
  const posteByCode = useMemo(() => new Map(props.postes.map((p) => [p.code, p])), [props.postes])
  const posteRank = useMemo(() => new Map(props.postes.map((p, i) => [p.code, i])), [props.postes])

  const [posteFilter, setPosteFilter] = useState<string | null>(() => readInitialPoste(stored))

  // Sync URL une fois au montage si sessionStorage avait un poste sans query.
  useEffect(() => {
    syncPosteQueryParam(posteFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset sélection / faisabilité quand le dataset change.
  useEffect(() => {
    setSelected(new Set())
    setBatch({})
    setFeasibility({})
    setFeasDone(false)
  }, [props.rows])

  function selectPoste(poste: string | null) {
    setPosteFilter(poste)
    writeStoredFilters({ poste })
    syncPosteQueryParam(poste)
  }

  const activePoste = posteFilter ? props.postes.find((p) => p.code === posteFilter) : null
  const showPosteCol = !posteFilter
  /** Urgence / buckets livraison utiles dès qu'un poste est filtré. */
  const detail = !!posteFilter

  const filteredPostes = useMemo(() => {
    const q = posteQuery.trim().toLowerCase()
    return props.postes
      .filter((p) => natureOk(p.nature, posteNatureFilter))
      .filter((p) => atelierFilter.size === 0 || atelierFilter.has(p.atelier))
      .filter((p) => !q || p.code.toLowerCase().includes(q) || p.label.toLowerCase().includes(q))
  }, [props.postes, posteQuery, atelierFilter, posteNatureFilter])

  const runFeasibility = useCallback(async () => {
    if (feasLoading || props.rows.length === 0 || !props.feasibilityWindow) return
    const { from, to } = props.feasibilityWindow
    setFeasLoading(true)
    try {
      const { map } = await fetchBoardFeasibility({
        from,
        to,
        mode: 'sequential',
        ...(posteFilter ? { workstation: posteFilter } : {}),
      })
      // Ne garder que les OF candidats affichés (réponse board = fenêtre STRDAT entière).
      const scoped: Record<string, FeasStatus> = {}
      let nbOk = 0
      let nbBlocked = 0
      let nbQc = 0
      for (const r of props.rows) {
        const st = map[r.numOf]
        if (!st) continue
        scoped[r.numOf] = st
        if (st.st === 'ok') nbOk++
        else if (st.st === 'qc') nbQc++
        else if (st.st === 'blocked') nbBlocked++
      }
      setFeasibility(scoped)
      setFeasDone(true)
      if (nbOk > 0) setFeasFilterPersisted('ok')
      const parts = [
        nbBlocked > 0 ? `${nbBlocked} bloqué(s)` : null,
        nbQc > 0 ? `${nbQc} sous CQ` : null,
        `${nbOk} lançable(s)`,
      ].filter(Boolean)
      toast(parts.join(' · '))
    } catch (err) {
      toast(`Échec faisabilité : ${(err as Error).message}`)
    } finally {
      setFeasLoading(false)
    }
  }, [feasLoading, props.rows, props.feasibilityWindow, posteFilter])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = props.rows
      .filter((r) => !posteFilter || r.posteCode === posteFilter)
      .filter((r) => natureOk(posteNature.get(r.posteCode), posteNatureFilter))
      .filter(
        (r) => atelierFilter.size === 0 || atelierFilter.has(posteAtelier.get(r.posteCode) ?? '')
      )
      .filter((r) => statusFilter.has((r.status ?? 1) as StatusKey))
      .filter(
        (r) => !detail || urgencyFilter === 'all' || urgencyOf(r.livraisonIso) === urgencyFilter
      )
      .filter((r) => {
        if (feasFilter === 'all') return true
        const st = feasibility[r.numOf]?.st
        if (feasFilter === 'unknown') return !st
        return st === feasFilter
      })
      .filter((r) => {
        if (!q) return true
        const haystack = [
          r.numOf,
          r.article,
          r.designation ?? '',
          r.posteCode,
          r.statusLabel ?? '',
          ...r.commandes.flatMap((c) => [c.numCommande, c.client ?? '']),
        ]
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })

    // Tri colonne utilisateur (comme /suivi) — remplace le tri métier.
    if (sorting.length > 0) {
      return sortSequenceurRows(rows, sorting, feasibility)
    }

    return [...rows].sort((a, b) => {
      if (feasDone) {
        // Lançables d'abord, puis CQ, bloqués, inconnus.
        const ra = feasRank(feasibility[a.numOf]?.st)
        const rb = feasRank(feasibility[b.numOf]?.st)
        if (ra !== rb) return ra - rb
      }
      if (showPosteCol) {
        const ra = posteRank.get(a.posteCode) ?? Infinity
        const rb = posteRank.get(b.posteCode) ?? Infinity
        if (ra !== rb) return ra - rb
      }
      const aNoCmd = detail && a.commandes.length === 0
      const bNoCmd = detail && b.commandes.length === 0
      if (aNoCmd !== bNoCmd) return aNoCmd ? 1 : -1
      const ua = urgencyOf(a.livraisonIso)
      const ub = urgencyOf(b.livraisonIso)
      if (URGENCY_RANK[ua] !== URGENCY_RANK[ub]) return URGENCY_RANK[ua] - URGENCY_RANK[ub]
      if (!a.livraisonIso && !b.livraisonIso) return a.numOf.localeCompare(b.numOf)
      if (!a.livraisonIso) return 1
      if (!b.livraisonIso) return -1
      return a.livraisonIso.localeCompare(b.livraisonIso) || a.numOf.localeCompare(b.numOf)
    })
  }, [
    props.rows,
    detail,
    posteFilter,
    atelierFilter,
    posteAtelier,
    posteNature,
    posteNatureFilter,
    statusFilter,
    urgencyFilter,
    query,
    posteRank,
    showPosteCol,
    feasFilter,
    feasibility,
    feasDone,
    sorting,
  ])

  const feasCounts = useMemo(() => {
    let ok = 0
    let qc = 0
    let blocked = 0
    let unknown = 0
    for (const r of props.rows) {
      if (posteFilter && r.posteCode !== posteFilter) continue
      if (!natureOk(posteNature.get(r.posteCode), posteNatureFilter)) continue
      if (atelierFilter.size > 0 && !atelierFilter.has(posteAtelier.get(r.posteCode) ?? ''))
        continue
      if (!statusFilter.has((r.status ?? 1) as StatusKey)) continue
      const st = feasibility[r.numOf]?.st
      if (st === 'ok') ok++
      else if (st === 'qc') qc++
      else if (st === 'blocked') blocked++
      else unknown++
    }
    return { ok, qc, blocked, unknown }
  }, [
    props.rows,
    posteFilter,
    atelierFilter,
    posteAtelier,
    posteNature,
    posteNatureFilter,
    statusFilter,
    feasibility,
  ])

  // Sélectionnables (affermissables) parmi les lignes affichées + faisabilité ok —
  // seul périmètre légitime pour « Tout sélectionner » (les fermes ne s'affermissent pas).
  const affirmableOkCount = useMemo(
    () =>
      filteredRows.filter((r) => affirmable(r.status) && feasibility[r.numOf]?.st === 'ok').length,
    [filteredRows, feasibility]
  )

  const rowGroups = useMemo(() => {
    // Groupes poste uniquement en tri défaut (ou tri explicite sur poste) —
    // sinon un tri colonne (livraison, heures…) serait cassé par les blocs.
    const sortByPoste = sorting[0]?.id === 'poste'
    if (!showPosteCol || (customSort && !sortByPoste)) {
      return [{ posteCode: null as string | null, rows: filteredRows }]
    }
    const groups: { posteCode: string; rows: SequenceurRow[] }[] = []
    for (const r of filteredRows) {
      const last = groups[groups.length - 1]
      if (!last || last.posteCode !== r.posteCode) {
        groups.push({ posteCode: r.posteCode, rows: [r] })
      } else {
        last.rows.push(r)
      }
    }
    return groups
  }, [filteredRows, showPosteCol, customSort, sorting])

  const totalHours = Math.round(filteredRows.reduce((s, r) => s + r.hours, 0) * 100) / 100
  const chargeSplit = useMemo(() => splitChargeHours(filteredRows), [filteredRows])
  const sat = activePoste
    ? saturation(activePoste.totalHours, activePoste.weeklyCapacityHours)
    : null
  const weeksEngaged =
    activePoste && activePoste.weeklyCapacityHours
      ? Math.round((activePoste.totalHours / activePoste.weeklyCapacityHours) * 10) / 10
      : null

  const rowGrid = showPosteCol ? ROW_GRID_ALL : ROW_GRID_ONE

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllLaunchable() {
    const next = new Set<string>()
    for (const r of filteredRows) {
      if (affirmable(r.status) && feasibility[r.numOf]?.st === 'ok') next.add(r.numOf)
    }
    setSelected(next)
  }

  async function batchFirm(ids: string[]) {
    if (batchRunning || ids.length === 0) return
    setBatchRunning(true)
    setBatch(Object.fromEntries(ids.map((id) => [id, { st: 'running' as const }])))
    let nbOk = 0
    let nbErr = 0
    let nbPrintKo = 0
    const firmed: string[] = []
    for (const id of ids) {
      try {
        const res = await fetch(route('planning.order_firm', { orderNum: id }), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: true }),
        })
        const data = (await res.json()) as {
          ok: boolean
          mfgNum?: string
          error?: string
          print?: { ok: boolean }
        }
        if (data.ok && data.mfgNum) {
          if (data.print && !data.print.ok) nbPrintKo++
          setBatch((s) => ({ ...s, [id]: { st: 'ok', msg: data.mfgNum } }))
          firmed.push(id)
          nbOk++
        } else {
          setBatch((s) => ({
            ...s,
            [id]: { st: 'error', msg: data.error ?? 'Refusé par X3' },
          }))
          nbErr++
        }
      } catch (e) {
        setBatch((s) => ({ ...s, [id]: { st: 'error', msg: (e as Error).message } }))
        nbErr++
      }
    }
    setBatchRunning(false)
    const firmText =
      nbErr === 0 ? `${nbOk} OF affermi(s)` : `${nbOk} affermi(s) · ${nbErr} échec(s)`
    toast(nbPrintKo > 0 ? `${firmText} · ${nbPrintKo} dossier(s) non imprimé(s)` : firmText)
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of firmed) next.delete(id)
      return next
    })
    if (nbOk > 0) setTimeout(() => router.reload(), 1500)
  }

  return (
    <AppLayout
      title="Séquenceur"
      active="sequenceur"
      subtitle="Board tabulaire · OF ferme / planifié / suggéré par poste"
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <div>
          <b className="font-bold text-foreground">{filteredRows.length}</b> OF ·{' '}
          <b className="font-bold text-foreground">{fmtH(totalHours)}</b> h{' · '}
          <b className="font-bold text-ferme">{fmtH(chargeSplit.ferme)}</b> h ferme
          {' · '}
          <b className="font-bold text-planifie">{fmtH(chargeSplit.lancable)}</b> h lançable
          {feasDone && (
            <>
              {' '}
              · <b className="font-bold text-ferme">{feasCounts.ok}</b> faisables
            </>
          )}
        </div>
      }
    >
      <Head title="Séquenceur" />
      <div className="flex h-full min-h-0 flex-col">
        {props.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-brand/30 bg-brand-soft px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-brand" />
            <span className="font-bold">Matching partiel :</span>
            <span className="font-mono">{props.x3Error}</span>
          </div>
        )}

        <ToolbarRow className="text-xs font-semibold text-secondary-foreground">
          <div ref={anchorRef}>
            <Combobox
              value={posteFilter ?? ''}
              onValueChange={(v) => selectPoste(v ? String(v) : null)}
              onInputValueChange={setPosteQuery}
            >
              <ComboboxInput placeholder="Tous les postes" className="w-[220px]" showClear />
              <ComboboxContent anchor={anchorRef}>
                <ComboboxList>
                  {filteredPostes.length === 0 ? (
                    <ComboboxEmpty>Aucun poste ne correspond.</ComboboxEmpty>
                  ) : (
                    filteredPostes.map((p) => (
                      <ComboboxItem key={p.code} value={p.code}>
                        <span className="font-mono text-[12px] font-semibold">{p.code}</span>
                        <span className="truncate text-muted-foreground">{p.label}</span>
                        {p.count > 0 && (
                          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                            {p.count}
                          </span>
                        )}
                      </ComboboxItem>
                    ))
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          {props.ateliers.length > 0 && (
            <Segment className="flex-wrap">
              {props.ateliers.map((a) => (
                <SegmentButton
                  key={a.code}
                  active={atelierFilter.has(a.code)}
                  onClick={() => toggleAtelier(a.code)}
                  title={a.code}
                >
                  {a.label}
                </SegmentButton>
              ))}
            </Segment>
          )}

          <FilterMenu
            label="Poste"
            indicators={
              POSTE_NATURE_CHIPS.some(({ k }) => posteNatureFilter.has(k)) ? (
                <span
                  className="ml-0.5 text-[10px] font-semibold text-muted-foreground"
                  aria-hidden="true"
                >
                  {POSTE_NATURE_CHIPS.filter(({ k }) => posteNatureFilter.has(k))
                    .map(({ k }) => (k === 'assemblage_pf' ? 'PF' : 'S/E'))
                    .join('+')}
                </span>
              ) : null
            }
          >
            <Segment className="w-full justify-between">
              {POSTE_NATURE_CHIPS.map(({ k, label }) => (
                <SegmentButton
                  key={k}
                  active={posteNatureFilter.has(k)}
                  onClick={() => togglePosteNature(k)}
                >
                  {label}
                </SegmentButton>
              ))}
            </Segment>
          </FilterMenu>

          <FilterMenu
            label="Statut"
            indicators={
              STATUS_FILTER_CHIPS.some(({ k }) => statusFilter.has(k)) ? (
                <span className="ml-0.5 flex items-center gap-0.5" aria-hidden="true">
                  {STATUS_FILTER_CHIPS.filter(({ k }) => statusFilter.has(k)).map(({ k }) => (
                    <span key={k} className={cn('size-1.5 rounded-full', STATUS_DOT_CLASS[k])} />
                  ))}
                </span>
              ) : null
            }
          >
            <Segment className="w-full justify-between">
              {STATUS_FILTER_CHIPS.map(({ k, label }) => (
                <SegmentButton key={k} active={statusFilter.has(k)} onClick={() => toggleStatus(k)}>
                  {label}
                </SegmentButton>
              ))}
            </Segment>
          </FilterMenu>

          <Segment role="radiogroup" ariaLabel="Faisabilité">
            {(
              [
                ['all', 'Tous', null as number | null],
                ['ok', 'Lançables', feasDone ? feasCounts.ok : null],
                ['qc', 'Sous CQ', feasDone ? feasCounts.qc : null],
                ['blocked', 'Bloqués', feasDone ? feasCounts.blocked : null],
              ] as const
            ).map(([id, label, count]) => (
              <SegmentButton
                key={id}
                role="radio"
                active={feasFilter === id}
                onClick={() => setFeasFilterPersisted(id)}
              >
                {label}
                {count !== null && count > 0 && (
                  <span className="ml-1 tabular-nums opacity-70">{count}</span>
                )}
              </SegmentButton>
            ))}
          </Segment>

          {detail ? (
            <Segment role="radiogroup" ariaLabel="Urgence">
              {(
                [
                  ['all', 'Toutes'],
                  ['overdue', 'En retard'],
                  ['week', 'Cette semaine'],
                  ['later', 'À venir'],
                ] as const
              ).map(([id, label]) => (
                <SegmentButton
                  key={id}
                  role="radio"
                  active={urgencyFilter === id}
                  onClick={() => setUrgencyPersisted(id)}
                >
                  {label}
                </SegmentButton>
              ))}
            </Segment>
          ) : (
            <span className="font-mono text-2xs italic text-muted-foreground">
              Sélectionnez un poste pour filtrer par urgence de livraison
            </span>
          )}

          <ToolbarSpacer />

          <button
            type="button"
            className={cn(PILL, 'gap-1.5')}
            onClick={() => void runFeasibility()}
            disabled={feasLoading || props.rows.length === 0}
            title="Calculer la faisabilité matières"
          >
            <RefreshCw size={15} strokeWidth={1.75} className={cn(feasLoading && 'animate-spin')} />
            {feasLoading ? 'Calcul…' : 'Faisabilité'}
          </button>
          {feasDone && affirmableOkCount > 0 && (
            <button
              type="button"
              className={cn(PILL, 'gap-1.5')}
              onClick={selectAllLaunchable}
              disabled={batchRunning}
            >
              <Check size={15} strokeWidth={1.75} />
              Tout sélectionner ({affirmableOkCount})
            </button>
          )}

          <div className={PILL}>
            <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[220px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
              placeholder="OF, article, commande, client…"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => setQueryPersisted(e.currentTarget.value)}
            />
          </div>
        </ToolbarRow>

        {!posteFilter && (
          <div className="flex flex-none items-center gap-2 overflow-x-auto border-b border-rule bg-secondary/40 px-7 py-2.5">
            {filteredPostes.map((p) => {
              const s = saturation(p.totalHours, p.weeklyCapacityHours)
              return (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => selectPoste(p.code)}
                  className="flex flex-none items-center gap-2 rounded-lg border border-rule bg-card px-3 py-1.5 font-mono text-xs text-foreground transition-colors hover:border-brand/50"
                  title={p.label}
                >
                  <span className="font-bold">{p.code}</span>
                  <span className="text-muted-foreground">{p.count} OF</span>
                  {s.pct !== null && (
                    <span
                      className={cn(
                        'font-bold',
                        s.level === 'ok' && 'text-ferme',
                        s.level === 'high' && 'text-suggere',
                        s.level === 'crit' && 'text-danger'
                      )}
                    >
                      {s.pct}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {activePoste && (
          <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-secondary px-7 py-3">
            <Package size={18} strokeWidth={1.75} className="text-brand" />
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[13px] font-bold text-foreground">
                {activePoste.code}
              </span>
              <span className="text-[13px] font-medium text-muted-foreground">
                {activePoste.label}
              </span>
            </div>
            <span className="flex-1" />
            <div className="flex items-center gap-3">
              <div className="flex items-baseline gap-1">
                <span className="text-[17px] font-bold tabular-nums text-foreground">
                  {fmtH(activePoste.totalHours)}
                </span>
                <span className="font-mono text-[10px] font-semibold text-muted-foreground">h</span>
                {weeksEngaged !== null && (
                  <span className="ml-1 font-mono text-[11px] font-semibold text-muted-foreground">
                    ≈ {fmtJ(activePoste.totalHours)} j
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 font-mono text-[11px] font-semibold">
                <span className="text-ferme">{fmtH(chargeSplit.ferme)} h ferme</span>
                <span className="text-planifie">{fmtH(chargeSplit.lancable)} h lançable</span>
              </div>
              {sat && sat.pct !== null && (
                <div className="flex items-center gap-2">
                  <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-rule-soft">
                    <div
                      className={cn(
                        'absolute inset-y-0 left-0 rounded-full transition-all',
                        sat.level === 'ok' && 'bg-ferme',
                        sat.level === 'high' && 'bg-suggere',
                        sat.level === 'crit' && 'bg-danger'
                      )}
                      style={{ width: `${Math.min(100, sat.pct)}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'font-mono text-[11px] font-bold tabular-nums',
                      sat.level === 'ok' && 'text-ferme',
                      sat.level === 'high' && 'text-suggere',
                      sat.level === 'crit' && 'text-danger'
                    )}
                  >
                    {sat.pct}%
                  </span>
                </div>
              )}
            </div>
            {feasDone && (
              <div className="flex items-center gap-3 font-mono text-[11px] font-semibold">
                <span className="text-ferme">{feasCounts.ok} faisables</span>
                {feasCounts.qc > 0 && <span className="text-suggere">{feasCounts.qc} sous CQ</span>}
                {feasCounts.blocked > 0 && (
                  <span className="text-destructive">{feasCounts.blocked} bloqués</span>
                )}
              </div>
            )}
            {/* Entrée cockpit (#119) : le passé constaté du poste filtré. */}
            <button
              type="button"
              onClick={() => router.visit(`${route('cockpit.index')}?poste=${activePoste.code}`)}
              className="flex items-center gap-1.5 rounded-full border border-rule bg-card px-3 py-1 font-mono text-[11px] font-semibold text-foreground transition-colors hover:border-brand/50"
              title={`Cockpit du poste ${activePoste.code}`}
            >
              <Factory size={14} strokeWidth={1.75} className="text-brand" />
              Cockpit
            </button>
          </div>
        )}

        {filteredRows.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-muted-foreground">
            <Package size={26} strokeWidth={1.75} />
            <span className="text-[13px] font-medium">
              {feasFilter === 'ok'
                ? 'Aucun OF lançable pour ces filtres.'
                : 'Aucun OF pour ces filtres.'}
            </span>
            {feasLoading && (
              <span className="flex items-center gap-1.5 font-mono text-[11px]">
                <RefreshCw size={14} className="animate-spin" /> Calcul de faisabilité…
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-none items-center gap-2 border-b border-border bg-secondary/50 px-7 py-1.5 font-mono text-[10px] text-muted-foreground">
              <Info size={14} strokeWidth={1.75} />
              <span>
                Board tabulaire : mêmes OF que /programme. Lancez la faisabilité pour repérer les
                lançables / bloqués.
              </span>
            </div>
            {feasLoading && (
              <div className="flex flex-none items-center gap-2 border-b border-brand/20 bg-brand-soft/40 px-7 py-1.5 font-mono text-[10px] text-foreground">
                <RefreshCw size={14} strokeWidth={1.75} className="animate-spin text-brand" />
                <span>Calcul de faisabilité matières (même moteur que /programme)…</span>
              </div>
            )}
            <div className="flex-1 overflow-auto pb-20">
              <div
                className={cn(
                  'sticky top-0 z-10 grid items-center gap-3 border-b border-border bg-secondary px-7 py-2 font-mono text-[9px] font-bold tracking-wider text-muted-foreground',
                  rowGrid
                )}
              >
                <span />
                {showPosteCol && (
                  <SortHeader
                    id="poste"
                    label="POSTE"
                    sorting={sorting}
                    onToggle={toggleColumnSort}
                  />
                )}
                <SortHeader id="numOf" label="OF" sorting={sorting} onToggle={toggleColumnSort} />
                <SortHeader
                  id="status"
                  label="STATUT"
                  sorting={sorting}
                  onToggle={toggleColumnSort}
                />
                <SortHeader
                  id="article"
                  label="ARTICLE"
                  sorting={sorting}
                  onToggle={toggleColumnSort}
                />
                <SortHeader
                  id="designation"
                  label="DÉSIGNATION"
                  sorting={sorting}
                  onToggle={toggleColumnSort}
                />
                <SortHeader
                  id="avancement"
                  label="AVANCEMENT"
                  sorting={sorting}
                  onToggle={toggleColumnSort}
                  className="justify-end"
                />
                <SortHeader
                  id="faisabilite"
                  label="FAISABILITÉ"
                  sorting={sorting}
                  onToggle={toggleColumnSort}
                />
                <SortHeader
                  id="commande"
                  label="COMMANDE(S)"
                  sorting={sorting}
                  onToggle={toggleColumnSort}
                />
                <SortHeader
                  id="livraison"
                  label="LIVRAISON"
                  sorting={sorting}
                  onToggle={toggleColumnSort}
                />
                <SortHeader
                  id="heures"
                  label="HEURES"
                  sorting={sorting}
                  onToggle={toggleColumnSort}
                  className="justify-end"
                />
                <SortHeader
                  id="jours"
                  label="JOURS"
                  sorting={sorting}
                  onToggle={toggleColumnSort}
                  className="justify-end"
                />
              </div>

              {rowGroups.map((group) => {
                const poste = group.posteCode ? posteByCode.get(group.posteCode) : null
                const groupHours = group.rows.reduce((s, r) => s + r.hours, 0)
                const groupCharge = splitChargeHours(group.rows)
                return (
                  <div key={group.posteCode ?? 'all'}>
                    {showPosteCol && poste && (
                      <div className="flex items-center gap-2 border-b border-border bg-secondary/70 px-7 py-1.5 font-mono text-[10px] font-bold text-foreground">
                        <span className="text-brand">{poste.code}</span>
                        <span className="truncate text-muted-foreground">{poste.label}</span>
                        <span className="ml-auto flex items-center gap-2.5 text-muted-foreground">
                          <span>{group.rows.length}</span>
                          <span>{fmtH(groupHours)} h</span>
                          <span className="text-ferme">{fmtH(groupCharge.ferme)} h ferme</span>
                          <span className="text-planifie">
                            {fmtH(groupCharge.lancable)} h lançable
                          </span>
                        </span>
                      </div>
                    )}
                    {group.rows.map((r, i) => {
                      const u = urgencyOf(r.livraisonIso)
                      const bucket = detail && r.commandes.length === 0 ? 'none' : u
                      const prevBucket =
                        i > 0
                          ? detail && group.rows[i - 1].commandes.length === 0
                            ? 'none'
                            : urgencyOf(group.rows[i - 1].livraisonIso)
                          : null
                      const showSep =
                        detail && !customSort && (prevBucket === null || prevBucket !== bucket)
                      let bucketCount = 0
                      if (showSep) {
                        for (let j = i; j < group.rows.length; j++) {
                          const rj = group.rows[j]
                          const bj =
                            detail && rj.commandes.length === 0
                              ? 'none'
                              : urgencyOf(rj.livraisonIso)
                          if (bj !== bucket) break
                          bucketCount++
                        }
                      }
                      const sepLabel =
                        bucket === 'none'
                          ? 'Sans commande'
                          : bucket === 'overdue'
                            ? 'En retard'
                            : bucket === 'week'
                              ? 'Cette semaine'
                              : 'À venir'
                      const avancement =
                        r.launched > 0 ? Math.min(100, Math.round((r.done / r.launched) * 100)) : 0
                      const feas = feasibility[r.numOf]
                      const badge = feasBadge(
                        feas?.st ?? (feasDone ? 'unknown' : undefined),
                        r.status
                      )
                      const BadgeIcon = badge.icon
                      const canSelect = affirmable(r.status)
                      const isSelected = selected.has(r.numOf)
                      const batchItem = batch[r.numOf]
                      return (
                        <div key={`${r.posteCode}-${r.numOf}`}>
                          {showSep && (
                            <div
                              className={cn(
                                'flex items-center gap-2 px-7 pt-3 pb-1.5 font-mono text-[10px] font-bold uppercase tracking-wider',
                                bucket === 'none' && 'text-muted-foreground',
                                bucket === 'overdue' && 'text-danger',
                                bucket === 'week' && 'text-brand',
                                bucket === 'later' && 'text-muted-foreground'
                              )}
                            >
                              <span
                                className={cn(
                                  'inline-block h-0.5 flex-none w-4 rounded-full',
                                  bucket === 'none' && 'bg-rule',
                                  bucket === 'overdue' && 'bg-danger',
                                  bucket === 'week' && 'bg-brand',
                                  bucket === 'later' && 'bg-rule'
                                )}
                              />
                              {sepLabel}
                              <span className="ml-auto font-semibold normal-case tracking-normal text-muted-foreground tabular-nums">
                                {bucketCount}
                              </span>
                            </div>
                          )}
                          <div
                            className={cn(
                              'grid items-center gap-3 border-b border-rule-soft px-7 py-2 transition-colors',
                              rowGrid,
                              detail && r.commandes.length === 0 && 'opacity-60',
                              isSelected && 'bg-brand-soft/40',
                              batchItem?.st === 'ok' && 'bg-ferme/10',
                              batchItem?.st === 'error' && 'bg-destructive/5',
                              'hover:bg-secondary/50'
                            )}
                          >
                            {canSelect ? (
                              <label className="flex cursor-pointer items-center justify-center">
                                <input
                                  type="checkbox"
                                  className="size-3.5 accent-[var(--brand)]"
                                  checked={isSelected}
                                  disabled={batchRunning}
                                  onChange={() => toggleSelect(r.numOf)}
                                  aria-label={`Sélectionner ${r.numOf}`}
                                />
                              </label>
                            ) : (
                              <span />
                            )}
                            {showPosteCol && (
                              <span className="truncate font-mono text-[11px] font-bold text-foreground">
                                {r.posteCode}
                              </span>
                            )}
                            <button
                              type="button"
                              className="truncate text-left font-mono text-[12px] font-bold text-foreground hover:text-brand hover:underline"
                              onClick={() => {
                                setDetailOf(r.numOf)
                                setDetailOpen(true)
                              }}
                            >
                              {r.numOf}
                            </button>
                            <span
                              className={cn(
                                'truncate font-mono text-[10px] font-semibold',
                                statusTextClass(r.status)
                              )}
                            >
                              {r.statusLabel ?? '—'}
                            </span>
                            <span className="truncate font-mono text-[11px] font-bold text-foreground">
                              {r.article}
                            </span>
                            <span
                              className="truncate text-[12px] text-foreground/80"
                              title={r.designation ?? undefined}
                            >
                              {r.designation ?? '—'}
                            </span>
                            <div className="flex items-center gap-2">
                              <div className="relative h-2.5 w-full">
                                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-rule-soft">
                                  <div
                                    className={cn(
                                      'absolute inset-y-0 left-0 rounded-full',
                                      avancement >= 100 && 'bg-ferme',
                                      avancement > 0 && avancement < 100 && 'bg-planifie'
                                    )}
                                    style={{ width: `${avancement}%` }}
                                  />
                                </div>
                              </div>
                              <span className="flex-none font-mono text-[10px] leading-none tabular-nums text-muted-foreground">
                                {r.done}/{r.launched}
                              </span>
                            </div>
                            <span
                              className={cn(
                                'inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold',
                                badge.className
                              )}
                              title={
                                feas?.st === 'blocked'
                                  ? `Rupture : ${feas.missing.join(', ') || 'composant(s)'}`
                                  : feas?.st === 'qc'
                                    ? 'Couverture dépendante du stock sous CQ'
                                    : undefined
                              }
                            >
                              <BadgeIcon
                                size={12}
                                strokeWidth={2}
                                className={cn(!feas && feasLoading && 'animate-spin')}
                              />
                              {badge.label}
                            </span>
                            <div className="min-w-0">
                              {r.commandes.length === 0 ? (
                                <span className="font-mono text-[11px] text-muted-foreground">
                                  —
                                </span>
                              ) : (
                                r.commandes.map((c) => (
                                  <div key={c.numCommande + (c.ligne ?? '')} className="min-w-0">
                                    <div
                                      className="flex items-center gap-1.5 overflow-hidden"
                                      title={`${c.numCommande}${c.ligne ? `·L${c.ligne}` : ''}${c.client ? ` — ${c.client}` : ''}`}
                                    >
                                      <X3Link
                                        fonction="GESSOH"
                                        cle={c.numCommande}
                                        title={`Ouvrir la commande ${c.numCommande} dans Sage X3`}
                                        className="shrink-0 whitespace-nowrap font-mono text-[11px] font-bold leading-tight text-foreground"
                                      >
                                        {c.numCommande}
                                      </X3Link>
                                      {c.ligne && (
                                        <span className="shrink-0 whitespace-nowrap font-mono text-[10px] font-medium leading-tight text-muted-foreground">
                                          ·L{c.ligne}
                                        </span>
                                      )}
                                    </div>
                                    {c.client && (
                                      <div className="truncate text-[10px] font-medium leading-tight text-muted-foreground">
                                        {c.client}
                                      </div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                            <span
                              className={cn(
                                'font-mono text-[11px] font-bold tabular-nums',
                                urgencyColor(u)
                              )}
                            >
                              {r.livraisonIso ? fmtDateFr(r.livraisonIso) : '—'}
                            </span>
                            <span className="text-right font-mono text-[11px] font-bold tabular-nums text-foreground">
                              {fmtH(r.hours)}
                            </span>
                            <span className="text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                              {fmtJ(r.hours)}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      <SequenceurFirmBar
        selected={[...selected]}
        feasibility={feasibility}
        batch={batch}
        batchRunning={batchRunning}
        onFirm={(ids) => void batchFirm(ids)}
        onClear={() => {
          setSelected(new Set())
          setBatch({})
        }}
      />

      <OfDetailSheet
        num={detailOf}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onFirmed={() => {
          setDetailOpen(false)
          setTimeout(() => router.reload(), 800)
        }}
      />
    </AppLayout>
  )
}
