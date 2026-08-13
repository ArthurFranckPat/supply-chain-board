/**
 * Page « Suivi des commandes » (issue #19) — port React de
 * inertia/pages/scheduler/tracking.tsx (axe allocation / expédition).
 *
 * Shell Inertia rendu instantanément (SuiviController.board) ; les lignes
 * (calcul lourd) sont chargées en différé par fetch JSON. Shell (fetch +
 * toolbar + switch) — le rendu de chaque mode vit dans
 * components/tracking/*-view.tsx (issue #52).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { fr } from 'react-day-picker/locale'
import { CalendarDays, ChevronDown, Columns3, Lock, SlidersHorizontal, X } from 'lucide-react'
import { Popover } from '@base-ui/react/popover'

import type {
  SuiviPageProps,
  SuiviStatusKey,
  ProactiveVerdictKey,
  SuiviRowsResponse,
  ProactiveRowsResponse,
  SuiviDisplayRow,
  ProactiveDisplayRow,
} from '@r/lib/suivi/types'
import { toIso, startOfDay } from '@r/lib/vision/date-utils'
import { EMPTY, PROACTIVE_EMPTY, PROACTIVE_COLUMNS, REACTIVE_COLUMNS, fmtMs, suiviRowKey, type SuiviColumnMeta } from '@r/lib/suivi/tracking-shared'

import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@r/components/ui/sheet'
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSegmented,
  ToolbarSegment,
  ToolbarSearch,
  ToolbarRefresh,
  ToolbarSpacer,
  ToolbarFilterChip,
  ToolbarMetric,
} from '@r/components/ui/toolbar'
import { Pill } from '@r/components/ui/pill'
import { Button } from '@r/components/ui/button'
import { Separator } from '@r/components/ui/separator'
import { Calendar } from '@r/components/ui/calendar'
import { useRangeCalendar } from '@r/lib/use-range-calendar'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { ReactiveView } from '@r/components/tracking/reactive-view'
import { ProactiveView } from '@r/components/tracking/proactive-view'
import { SuiviDetailSheet } from '@r/components/tracking/suivi-detail-sheet'
import OfDetailSheet from '@r/components/of/of-detail-sheet'

// Fenêtre chargée côté serveur (toujours today-90j/+30j, fixe). Le filtrage
// par plage est un filtre CLIENT sur ces données déjà chargées, pas un re-fetch.
const LATE_LOOKBACK_DAYS = 90
const DEFAULT_FORWARD_DAYS = 7
/** Miroir de SUIVI_FORWARD_DAYS (app/services/suivi_service.ts) : au-delà, le
 *  serveur n'a jamais chargé la donnée — une plage plus lointaine rend une table
 *  vide qu'il faut savoir expliquer autrement que par « aucun résultat ». */
const SERVER_FORWARD_DAYS = 30

/** Au-delà, la donnée affichée est signalée comme périmée. En deçà, aucun
 *  indicateur : un écran qui commente son bon fonctionnement fait du bruit. */
const PEREMPTION_MIN = 5

const TODAY = startOfDay(new Date())
const TODAY_ISO = toIso(TODAY)
const addDays = (n: number) => {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + n)
  return d
}

/** Visibilité des colonnes (menu « Colonnes ») — clé localStorage versionnée. */
const COLUMNS_KEY = 'scb.suivi.columns.v1'
const COLUMN_CATALOGS: Record<'proactif' | 'reactif', SuiviColumnMeta[]> = {
  proactif: PROACTIVE_COLUMNS,
  reactif: REACTIVE_COLUMNS,
}
const LATE_FLOOR_ISO = toIso(addDays(-LATE_LOOKBACK_DAYS))
const SERVER_CEILING_ISO = toIso(addDays(SERVER_FORWARD_DAYS))
const DEFAULT_RANGE_END = addDays(DEFAULT_FORWARD_DAYS)

/** Types de commande cochés au chargement — SOURCE UNIQUE (état initial + réinitialisation). */
const DEFAULT_TYPES = ['MTS', 'MTO', 'NOR'] as const

// Libellés de la pill fenêtre de dates — repris de l'ancien DateWindowPill
// (components/vision/toolbar.tsx). Tableau statique plutôt qu'Intl :
// déterministe, pas de coût de locale-loading par rendu.
const MONTHS_SHORT_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]

function formatShort(d?: Date): string | null {
  if (!d) return null
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT_FR[d.getMonth()]}`
}

function formatWindowLabel(from?: Date, to?: Date): string {
  const f = formatShort(from)
  const t = formatShort(to)
  if (!f && !t) return '—'
  if (!f) return t ?? '—'
  if (!t) return f
  return `${f} → ${t}`
}

/** Libellé de section du panneau Filtres — source unique (5 usages). */
const SECTION_LABEL =
  'px-0.5 pb-1 font-mono text-2xs font-medium uppercase tracking-wide text-muted-foreground'

interface DateRange {
  start: Date | null
  end: Date | null
}

/**
 * État de la page dans l'URL — ce que l'on regarde doit survivre à un F5 et
 * pouvoir se transmettre à un collègue (« regarde ces 12 bloquées sur l'atelier
 * BDH »). Sans ça, chaque rechargement ramenait Proactif / fenêtre +7 j / filtres
 * par défaut, et aucune vue n'était partageable.
 *
 * Seuls les écarts au défaut sont écrits : une page non filtrée garde une URL nue.
 * Dates en ISO — côté machine, jamais à l'écran (l'écran reste en jj/mm/aaaa).
 */
interface UrlState {
  mode: 'reactif' | 'proactif'
  query: string
  statusFilter: SuiviStatusKey | 'all'
  verdictFilter: ProactiveVerdictKey | 'all'
  types: Set<string>
  ateliers: Set<string>
  showSubAssemblies: boolean
  searchBom: boolean
  range: DateRange
}

const DEFAULT_URL_STATE = (): UrlState => ({
  mode: 'proactif',
  query: '',
  statusFilter: 'all',
  verdictFilter: 'all',
  types: new Set(DEFAULT_TYPES),
  ateliers: new Set(),
  showSubAssemblies: true,
  searchBom: false,
  range: { start: TODAY, end: DEFAULT_RANGE_END },
})

const parseIsoDate = (v: string | null): Date | null => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function readUrlState(): UrlState {
  const s = DEFAULT_URL_STATE()
  if (typeof window === 'undefined') return s
  const p = new URLSearchParams(window.location.search)

  if (p.get('vue') === 'reactif' || p.get('vue') === 'proactif')
    s.mode = p.get('vue') as UrlState['mode']
  s.query = p.get('q') ?? ''
  const statut = p.get('statut')
  if (statut === 'exp' || statut === 'alc' || statut === 'ret' || statut === 'ras')
    s.statusFilter = statut
  const verdict = p.get('verdict')
  if (['time', 'stock', 'late', 'blocked', 'uncov', 'risk'].includes(verdict ?? ''))
    s.verdictFilter = verdict as ProactiveVerdictKey
  const types = p.get('type')
  if (types !== null) s.types = new Set(types.split(',').filter(Boolean))
  const ateliers = p.get('atelier')
  if (ateliers !== null) s.ateliers = new Set(ateliers.split(',').filter(Boolean))
  if (p.get('se') === '0') s.showSubAssemblies = false
  if (p.get('bom') === '1') s.searchBom = true
  const du = parseIsoDate(p.get('du'))
  const au = parseIsoDate(p.get('au'))
  if (du || au) s.range = { start: du, end: au }

  return s
}

function writeUrlState(s: UrlState) {
  if (typeof window === 'undefined') return
  const d = DEFAULT_URL_STATE()
  const p = new URLSearchParams()

  if (s.mode !== d.mode) p.set('vue', s.mode)
  if (s.query.trim()) p.set('q', s.query.trim())
  if (s.statusFilter !== 'all') p.set('statut', s.statusFilter)
  if (s.verdictFilter !== 'all') p.set('verdict', s.verdictFilter)
  if (!sameSet(s.types, d.types)) p.set('type', [...s.types].join(','))
  if (s.ateliers.size > 0) p.set('atelier', [...s.ateliers].join(','))
  if (!s.showSubAssemblies) p.set('se', '0')
  if (s.searchBom) p.set('bom', '1')
  const du = s.range.start ? toIso(s.range.start) : null
  const au = s.range.end ? toIso(s.range.end) : null
  if (du !== toIso(d.range.start!) || au !== toIso(d.range.end!)) {
    if (du) p.set('du', du)
    if (au) p.set('au', au)
  }

  const qs = p.toString()
  // `replaceState` et pas `pushState` : régler un filtre n'est pas une
  // navigation, et empiler 40 entrées d'historique rendrait le bouton Retour
  // inutilisable pour sortir de la page.
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${qs ? `?${qs}` : ''}`
  )
}

const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((v) => b.has(v))

export default function Tracking(props: SuiviPageProps) {
  // Tout l'état de filtrage est amorcé depuis l'URL : recharger la page ou
  // ouvrir un lien reçu doit rendre EXACTEMENT la même vue.
  const [initial] = useState(readUrlState)

  // Calcul lourd différé : fetch client-side, relancé au bust (bouton refresh
  // → ?refresh=N invalide le cache serveur).
  const [bust, setBust] = useState(0)

  // ── Vue proactive (réalisabilité des commandes via le moteur séquentiel) ──
  // Vue par défaut : c'est celle qui porte la réalisabilité, donc l'usage quotidien.
  const [mode, setMode] = useState<'reactif' | 'proactif'>(initial.mode)

  /**
   * Chargement décalé du mode non affiché.
   *
   * Les deux endpoints partaient en parallèle au montage — deux calculs X3 (donc
   * deux `ZSOAPSQL` en O(n²)) en concurrence, pour une seule vue regardée. Ici le
   * mode actif part seul ; l'autre est préchargé une fois le premier rendu, ce qui
   * garde la bascule instantanée sans faire payer deux fois le premier écran.
   */
  const [prefetchOther, setPrefetchOther] = useState(false)
  const [visited, setVisited] = useState<Set<string>>(new Set([initial.mode]))
  const wants = (m: 'reactif' | 'proactif') => visited.has(m) || prefetchOther

  const rowsUrl = wants('reactif') ? `${props.rowsHref}${bust ? `?refresh=${bust}` : ''}` : null
  const proUrl = wants('proactif')
    ? `${props.proactiveRowsHref}${bust ? `?refresh=${bust}` : ''}`
    : null

  const {
    data,
    loading: rowsLoading,
    error: rowsError,
    ms: rowsMs,
    elapsed,
    at: rowsAt,
  } = useTimedFetch<SuiviRowsResponse>(rowsUrl)
  const view = data ?? EMPTY

  const {
    data: proData,
    loading: proLoading,
    error: proError,
    ms: proMs,
    elapsed: proElapsed,
    at: proAt,
  } = useTimedFetch<ProactiveRowsResponse>(proUrl)
  const proView = proData ?? PROACTIVE_EMPTY

  const activeLoaded = mode === 'reactif' ? data !== null : proData !== null
  useEffect(() => {
    if (!activeLoaded || prefetchOther) return
    const id = window.setTimeout(() => setPrefetchOther(true), 1000)
    return () => window.clearTimeout(id)
  }, [activeLoaded, prefetchOther])

  const switchMode = (m: 'reactif' | 'proactif') => {
    setMode(m)
    setVisited((prev) => (prev.has(m) ? prev : new Set(prev).add(m)))
  }

  // Plage de dates d'expédition affichée — filtre CLIENT pur (pas de re-fetch).
  // Les lignes déjà en retard restent TOUJOURS visibles hors plage, plafonnées
  // à -90j depuis aujourd'hui.
  const [dateRange, setDateRange] = useState<DateRange>(initial.range)
  const inRangeOrLate = (dateExpIso: string | null): boolean => {
    if (!dateExpIso) return true
    const { start, end } = dateRange
    if (start && end) {
      const s = toIso(start)
      const e = toIso(end)
      if (dateExpIso >= s && dateExpIso <= e) return true
    }
    return dateExpIso < TODAY_ISO && dateExpIso >= LATE_FLOOR_ISO
  }

  // Filtres côté client. Recherche/type/atelier transverses aux 2 vues ;
  // statut/verdict spécifiques à leur mode.
  const [query, setQuery] = useState(initial.query)
  const [statusFilter, setStatusFilter] = useState<SuiviStatusKey | 'all'>(initial.statusFilter)
  const [verdictFilter, setVerdictFilter] = useState<ProactiveVerdictKey | 'all'>(
    initial.verdictFilter
  )
  // Vue proactif : inclure les sous-ensembles (semi-finis) dans la colonne « Composants en
  // rupture ». Défaut ON — un SE suspendu à un OF bloque la commande autant qu'un acheté.
  const [showSubAssemblies, setShowSubAssemblies] = useState(initial.showSubAssemblies)
  // Étend la recherche à TOUTE la nomenclature de l'article (« quelles commandes embarquent ce
  // composant ? »). Défaut OFF : sans lui, un résultat veut dire « ce composant bloque cette
  // commande » — fondre les deux rendrait la réponse ambiguë.
  const [searchBom, setSearchBom] = useState(initial.searchBom)
  const [typeFilter, setTypeFilter] = useState<Set<string>>(initial.types)
  // Filtre atelier (#36) : ensemble de STOLOC retenus (vide = tous).
  const [atelierFilter, setAtelierFilter] = useState<Set<string>>(initial.ateliers)

  // Reflet de l'état dans l'URL, à chaque changement de filtre.
  useEffect(() => {
    writeUrlState({
      mode,
      query,
      statusFilter,
      verdictFilter,
      types: typeFilter,
      ateliers: atelierFilter,
      showSubAssemblies,
      searchBom,
      range: dateRange,
    })
  }, [
    mode,
    query,
    statusFilter,
    verdictFilter,
    typeFilter,
    atelierFilter,
    showSubAssemblies,
    searchBom,
    dateRange,
  ])

  const [selectedRow, setSelectedRow] = useState<{
    type: 'reactif' | 'proactif'
    row: SuiviDisplayRow | ProactiveDisplayRow
  } | null>(null)

  // Détail OF (faisabilité) au clic sur un n° d'OF (colonne Couverture, proactif).
  const [selectedOf, setSelectedOf] = useState<string | null>(null)
  const [ofDetailOpen, setOfDetailOpen] = useState(false)

  // Rappels stables : ils entrent dans les dépendances du `useMemo` qui construit
  // les colonnes. Recréés à chaque rendu, ils rendraient cette mémoïsation nulle.
  const onSelectOf = useCallback((numOf: string) => {
    setSelectedOf(numOf)
    setOfDetailOpen(true)
  }, [])
  const openReactiveRow = useCallback(
    (row: SuiviDisplayRow) => setSelectedRow({ type: 'reactif', row }),
    []
  )
  const openProactiveRow = useCallback(
    (row: ProactiveDisplayRow) => setSelectedRow({ type: 'proactif', row }),
    []
  )
  const refresh = useCallback(() => setBust((b) => b + 1), [])

  const toggleType = (t: string) =>
    setTypeFilter((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })

  const toggleAtelier = (code: string) =>
    setAtelierFilter((prev) => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })

  // Ateliers de la vue active (réactif/proactif), pour les chips de filtre.
  const ateliers = mode === 'proactif' ? proView.ateliers : view.ateliers

  // Filtrage (le tri est de la responsabilité de chaque vue).
  const reactiveFilteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let r = view.rows.filter(
      (row) =>
        (statusFilter === 'all' || row.statusKey === statusFilter) &&
        typeFilter.has(row.type) &&
        (atelierFilter.size === 0 || atelierFilter.has(row.atelier)) &&
        inRangeOrLate(row.dateExpIso)
    )
    if (q) {
      const terms = q.split(/\s+/)
      r = r.filter((row) => terms.every((t) => row.filter.includes(t)))
    }
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.rows, query, statusFilter, typeFilter, atelierFilter, dateRange])

  const proFilteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let r = proView.rows.filter(
      (row) =>
        (verdictFilter === 'all' || row.verdictKey === verdictFilter) &&
        typeFilter.has(row.type) &&
        (atelierFilter.size === 0 || atelierFilter.has(row.atelier)) &&
        inRangeOrLate(row.dateExpIso)
    )
    if (q) {
      const terms = q.split(/\s+/)
      // Chip Nomenclature complète : un terme peut matcher soit l'index de la ligne (dont les
      // composants EN RUPTURE), soit la nomenclature complète de l'article.
      r = r.filter((row) => {
        const bom = searchBom ? (proView.bomIndex[row.article] ?? '') : ''
        return terms.every((t) => row.filter.includes(t) || bom.includes(t))
      })
    }
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    proView.rows,
    proView.bomIndex,
    query,
    verdictFilter,
    typeFilter,
    atelierFilter,
    dateRange,
    searchBom,
  ])

  // Toujours "aujourd'hui" réel (verdicts/statuts calculés par rapport à maintenant).
  const refLabel = TODAY.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  // Sélecteur de plage — filtre client (dateRange), pas de re-fetch ni de navigation.
  const [dateOpen, setDateOpen] = useState(false)
  const applyRange = (r: DayPickerRange | undefined) => {
    const next: DateRange = { start: r?.from ?? null, end: r?.to ?? null }
    setDateRange(next)
    if (next.start && next.end) setDateOpen(false)
  }
  const rangeCal = useRangeCalendar({
    open: dateOpen,
    value: dateRange.start ? { from: dateRange.start, to: dateRange.end ?? undefined } : undefined,
    onCommit: applyRange,
  })

  // Panneau Filtres (Statut/Verdict, Composants en rupture, Type, Atelier).
  const [filterOpen, setFilterOpen] = useState(false)

  // ── Visibilité des colonnes (menu « Colonnes ») ──
  // Persistée par mode, versionnée. Les colonnes verrouillées (identité de
  // ligne) restent toujours présentes, quel que soit l'état sauvegardé.
  const loadColumnVisibility = (): Record<'proactif' | 'reactif', string[]> => {
    const all = (catalog: SuiviColumnMeta[]) => catalog.map((c) => c.id)
    const fallback = {
      proactif: all(PROACTIVE_COLUMNS),
      reactif: all(REACTIVE_COLUMNS),
    }
    if (typeof window === 'undefined') return fallback
    try {
      const raw = window.localStorage.getItem(COLUMNS_KEY)
      if (!raw) return fallback
      const parsed = JSON.parse(raw) as Partial<Record<'proactif' | 'reactif', unknown>>
      const sanitize = (catalog: SuiviColumnMeta[], saved: unknown): string[] => {
        const wanted =
          Array.isArray(saved) && saved.length > 0
            ? (saved.filter((x) => typeof x === 'string') as string[])
            : all(catalog)
        // Les colonnes verrouillées (identité de ligne) sont toujours présentes,
        // même si le stockage est corrompu ou périmé.
        return catalog
          .filter((c) => wanted.includes(c.id) || c.locked)
          .map((c) => c.id)
      }
      return {
        proactif: sanitize(PROACTIVE_COLUMNS, parsed.proactif),
        reactif: sanitize(REACTIVE_COLUMNS, parsed.reactif),
      }
    } catch {
      return fallback
    }
  }

  const [colVis, setColVis] = useState<Record<'proactif' | 'reactif', string[]>>(loadColumnVisibility)
  const [colOpen, setColOpen] = useState(false)

  // Sauvegarde différée (250 ms) — les verrouillées sont ré-injectées au load,
  // inutile de les stocker deux fois.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(COLUMNS_KEY, JSON.stringify(colVis))
      } catch {
        /* localStorage indisponible : la préférence ne persiste pas */
      }
    }, 250)
    return () => clearTimeout(t)
  }, [colVis])

  const toggleColumn = (id: string) => {
    setColVis((prev) => {
      const order = COLUMN_CATALOGS[mode].map((c) => c.id)
      const cur = prev[mode]
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      return { ...prev, [mode]: order.filter((x) => next.includes(x)) }
    })
  }

  const resetColumns = () =>
    setColVis((prev) => ({
      ...prev,
      [mode]: COLUMN_CATALOGS[mode].map((c) => c.id),
    }))

  const selectedRowKey = selectedRow ? suiviRowKey(selectedRow.row) : null

  const loading = mode === 'reactif' ? rowsLoading : proLoading
  const lastMs = mode === 'reactif' ? rowsMs : proMs
  const liveElapsed = mode === 'reactif' ? elapsed : proElapsed
  const lastAt = mode === 'reactif' ? rowsAt : proAt

  /**
   * Péremption — et rien tant que la donnée est fraîche.
   *
   * Trois formulations ont été essayées avant celle-ci : la durée du chargement
   * (« 320ms », un instrument de développeur, personne ne décide rien avec) puis
   * l'heure du chargement (« 22:58 » — l'utilisateur connaît l'heure qu'il est,
   * c'est à lui de faire la soustraction). La seule chose qu'un indicateur de
   * fraîcheur doive dire est : « ce que tu lis n'est plus d'actualité ». Donc il
   * ne dit rien tant que ça l'est, et parle en âge quand ça ne l'est plus.
   * L'heure exacte et la durée restent au survol, pour le diagnostic.
   */
  const [maintenant, setMaintenant] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const ageMin = lastAt === null ? null : Math.floor((maintenant - lastAt) / 60_000)
  const perime = ageMin !== null && ageMin >= PEREMPTION_MIN
  const staleness = loading
    ? fmtMs(liveElapsed)
    : perime
      ? `il y a ${ageMin! < 60 ? `${ageMin} min` : `${Math.floor(ageMin! / 60)} h`}`
      : null
  const stalenessTitle = loading
    ? 'Chargement X3 en cours'
    : lastAt
      ? `Données chargées à ${new Date(lastAt).toLocaleTimeString('fr-FR')}${
          lastMs !== null ? ` · durée ${fmtMs(lastMs)}` : ''
        }`
      : undefined

  // Les chips de statut et de verdict portent leur propre gravité : le point
  // dit la sévérité, le nombre dit le volume. C'est ce qui permet à la
  // distribution de rester lisible sans occuper la rangée.
  type Gravite = 'critical' | 'warning' | 'ok' | 'neutral'

  const statusChip = (k: SuiviStatusKey | 'all', label: string, tone: Gravite, count?: number) => {
    const on = statusFilter === k
    return (
      <ToolbarFilterChip
        label={label}
        count={count}
        tone={tone}
        active={on}
        onClick={() => setStatusFilter(on ? 'all' : k)}
      />
    )
  }

  const verdictChip = (
    k: ProactiveVerdictKey | 'all',
    label: string,
    tone: Gravite,
    count?: number
  ) => {
    const on = verdictFilter === k
    return (
      <ToolbarFilterChip
        label={label}
        count={count}
        tone={tone}
        active={on}
        onClick={() => setVerdictFilter(on ? 'all' : k)}
      />
    )
  }

  // Filtres secondaires uniquement (hors recherche, qui reste toujours
  // visible dans la rangée) — pilote le compteur du déclencheur Filtres.
  // Un filtre est « actif » quand il s'ÉCARTE du défaut — pas quand il est simplement coché.
  // Sous-ensembles et NOR étant activés au chargement, c'est leur décochage qui compte.
  // Un COMPTE et non un point : « des filtres sont actifs » n'aide personne à
  // savoir s'il en reste un ou quatre à défaire.
  const activeFilterCount =
    (mode === 'reactif' && statusFilter !== 'all' ? 1 : 0) +
    (mode === 'proactif' && verdictFilter !== 'all' ? 1 : 0) +
    (mode === 'proactif' && !showSubAssemblies ? 1 : 0) +
    (mode === 'proactif' && searchBom ? 1 : 0) +
    (DEFAULT_TYPES.some((t) => !typeFilter.has(t)) ? 1 : 0) +
    (atelierFilter.size > 0 ? 1 : 0)
  const filtersActive = activeFilterCount > 0
  const isFiltered = !!query.trim() || filtersActive
  const filteredCount = mode === 'reactif' ? reactiveFilteredRows.length : proFilteredRows.length
  const totalCount = mode === 'reactif' ? view.total : proView.total

  // La plage demandée commence après la dernière date que le serveur charge :
  // la table sera vide, mais ce n'est pas « aucun résultat », c'est « hors
  // fenêtre ». Les deux se réparent différemment.
  const horsFenetre = !!dateRange.start && toIso(dateRange.start) > SERVER_CEILING_ISO

  const resetFilters = () => {
    const d = DEFAULT_URL_STATE()
    setQuery(d.query)
    setStatusFilter(d.statusFilter)
    setVerdictFilter(d.verdictFilter)
    setShowSubAssemblies(d.showSubAssemblies)
    setSearchBom(d.searchBom)
    setTypeFilter(new Set(d.types))
    setAtelierFilter(new Set(d.ateliers))
    // La fenêtre de dates EST un filtre. L'oublier ici laissait « Réinitialiser
    // les filtres » rendre une table toujours vide, sans rien dire.
    setDateRange(d.range)
  }

  /** Récapitulatif imprimé : une feuille doit dire de quoi elle est l'extrait. */
  const printContext = (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule pb-2 font-mono text-2xs text-foreground">
      <span className="font-semibold uppercase tracking-wide">
        Suivi Commandes
      </span>
      <span>{refLabel}</span>
      <span>
        Fenêtre {formatWindowLabel(dateRange.start ?? undefined, dateRange.end ?? undefined)}
      </span>
      {query.trim() && <span>Recherche « {query.trim()} »</span>}
      {mode === 'reactif' && statusFilter !== 'all' && <span>Statut {statusFilter}</span>}
      {mode === 'proactif' && verdictFilter !== 'all' && <span>Verdict {verdictFilter}</span>}
      {DEFAULT_TYPES.some((t) => !typeFilter.has(t)) && (
        <span>Types {[...typeFilter].join(', ') || 'aucun'}</span>
      )}
      {atelierFilter.size > 0 && <span>Ateliers {[...atelierFilter].join(', ')}</span>}
      <span className="ml-auto tabular-nums">
        {filteredCount} / {totalCount} lignes
      </span>
    </div>
  )

  return (
    <AppLayout
      title="Suivi"
      active="tracking"
      subtitle="Suivi Commandes"
      theme="cursor"
      dense
      scrollable={false}
      // Pas de `meta` : le volume appartient à la rangée, où il est le résultat
      // des contrôles qui l'entourent et change quand on les touche. Ici il
      // disait « 675 lignes ouvertes » pendant que la rangée disait « 12 / 675 »
      // — le même nombre à deux endroits, dans deux formats, dont celui-ci
      // devenait faux dès qu'un filtre était posé.
    >
      {/* AppLayout (dense, scrollable=false) rend ses children en flux bloc
          normal (pas de flex-col) : sans ce wrapper, les `flex-1`/`h-full` de
          la toolbar et de la vue en dessous ne se dimensionnent contre rien
          et la table déborde hors de l'écran sans scroll possible. */}
      <div className="flex h-full min-h-0 flex-col">
        {/* ═══ Toolbar ═══ */}
        <Toolbar data-print-toolbar className="select-none flex-nowrap px-5 py-2 min-h-[48px]">
          {/* Contrôles de vue : bascule de mode, fenêtre, filtres — groupe
              serré (gap-1.5), séparé de la recherche/actions par le spacer. */}
          <ToolbarGroup>
            {/* Bascule Réactif / Proactif */}
            <ToolbarSegmented>
              <ToolbarSegment
                active={mode === 'reactif'}
                onClick={() => switchMode('reactif')}
                title="Suivi as-is : statuts allocation/expédition + causes de retard"
              >
                Réactif
              </ToolbarSegment>
              <ToolbarSegment
                active={mode === 'proactif'}
                onClick={() => switchMode('proactif')}
                title="Réalisabilité projetée : consommation séquentielle des composants entre OFs"
              >
                Proactif
              </ToolbarSegment>
            </ToolbarSegmented>

            {/* Fenêtre — sélecteur de plage (filtre client, pas de re-fetch). */}
            <Popover.Root open={dateOpen} onOpenChange={setDateOpen}>
              <Popover.Trigger
                render={
                  <Pill
                    variant="outline"
                    className="gap-1.5"
                    data-print-keep
                    title="Filtrer par plage de dates d'expédition (les lignes en retard restent toujours visibles)"
                    aria-label={`Fenêtre : ${formatWindowLabel(
                      dateRange.start ?? undefined,
                      dateRange.end ?? undefined
                    )}`}
                  >
                    <CalendarDays size={14} strokeWidth={1.75} className="text-muted-foreground" />
                    <span className="whitespace-nowrap font-mono tabular-nums">
                      {formatWindowLabel(dateRange.start ?? undefined, dateRange.end ?? undefined)}
                    </span>
                    <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
                  </Pill>
                }
              />
              {/* Positioner base-ui = évitement de collision natif : le panneau ne sort
                plus du viewport (l'ancien `absolute right-0` rognait le 1er mois sur
                écran étroit). `--available-width` + overflow = filet de sécurité. */}
              <Popover.Portal>
                <Popover.Positioner
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  collisionPadding={8}
                  className="z-50"
                >
                  <Popover.Popup
                    data-slot="popover-content"
                    className="max-w-(--available-width) overflow-x-auto rounded-lg border border-rule bg-popover shadow-float"
                  >
                    <Calendar
                      mode="range"
                      locale={fr}
                      numberOfMonths={2}
                      selected={rangeCal.selected}
                      onSelect={rangeCal.onSelect}
                    />
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>

            {/* Filtres — déclencheur unique (Statut/Verdict selon la vue +
              Type + Atelier). Consolider derrière un seul pill évite
              l'empilement de segmented controls dans la rangée, qui
              forçait un scroll horizontal. */}
            <Popover.Root open={filterOpen} onOpenChange={setFilterOpen}>
              <Popover.Trigger
                render={
                  <Pill
                    variant={filtersActive ? 'active' : 'outline'}
                    className="gap-1.5"
                    title={
                      filtersActive
                        ? `${activeFilterCount} filtre${activeFilterCount > 1 ? 's' : ''} actif${activeFilterCount > 1 ? 's' : ''}`
                        : 'Filtres'
                    }
                  >
                    <SlidersHorizontal
                      size={14}
                      strokeWidth={1.75}
                      className="text-muted-foreground"
                    />
                    Filtres
                    {filtersActive ? (
                      <span className="rounded-full bg-brand px-1.5 py-px text-3xs font-semibold leading-none text-white tabular-nums">
                        {activeFilterCount}
                      </span>
                    ) : null}
                    <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
                  </Pill>
                }
              />
              <Popover.Portal>
                <Popover.Positioner
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  collisionPadding={8}
                  className="z-50"
                >
                  <Popover.Popup data-slot="filter-menu-panel" className="w-[280px] p-2">
                    {mode === 'reactif' && (
                      <>
                        <div className={SECTION_LABEL}>Statut</div>
                        <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
                          {statusChip('all', 'Tous', 'neutral', view.total)}
                          {statusChip('ret', 'Retard', 'critical', view.statusCounts.RETARD_PROD)}
                          {statusChip(
                            'alc',
                            'À allouer',
                            'warning',
                            view.statusCounts.ALLOCATION_A_FAIRE
                          )}
                          {statusChip('exp', 'À expédier', 'ok', view.statusCounts.A_EXPEDIER)}
                        </ToolbarSegmented>
                        <Separator className="my-2" />
                      </>
                    )}
                    {mode === 'proactif' && (
                      <>
                        <div className={SECTION_LABEL}>Verdict</div>
                        <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
                          {verdictChip('all', 'Tous', 'neutral', proView.total)}
                          {verdictChip(
                            'blocked',
                            'Bloquée',
                            'critical',
                            proView.verdictCounts.blocked
                          )}
                          {verdictChip(
                            'uncov',
                            'Sans couverture',
                            'critical',
                            proView.verdictCounts.uncov
                          )}
                          {verdictChip('late', 'Retard', 'warning', proView.verdictCounts.late)}
                          {verdictChip('risk', 'À risque', 'warning', proView.verdictCounts.risk)}
                        </ToolbarSegmented>
                        <Separator className="my-2" />
                        <div className={SECTION_LABEL}>Composants en rupture</div>
                        <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
                          <ToolbarSegment
                            active={showSubAssemblies}
                            onClick={() => setShowSubAssemblies((v) => !v)}
                            title="Inclure les sous-ensembles (semi-finis) fabriqués en rupture, en plus des composants achetés"
                          >
                            Sous-ensembles
                          </ToolbarSegment>
                          <ToolbarSegment
                            active={searchBom}
                            onClick={() => setSearchBom((v) => !v)}
                            title="Étendre la recherche à toute la nomenclature de l'article : remonte les commandes qui EMBARQUENT le composant cherché, même s'il n'est pas en rupture"
                          >
                            Nomenclature complète
                          </ToolbarSegment>
                        </ToolbarSegmented>
                        <Separator className="my-2" />
                      </>
                    )}
                    <div className={SECTION_LABEL}>Type</div>
                    <ToolbarSegmented semantics="toggles" flat className="w-full">
                      {DEFAULT_TYPES.map((t) => (
                        <ToolbarSegment
                          key={t}
                          active={typeFilter.has(t)}
                          onClick={() => toggleType(t)}
                        >
                          {t}
                        </ToolbarSegment>
                      ))}
                    </ToolbarSegmented>
                    {/* Filtre atelier (#36) — chips STOLOC. Transverse aux 2 vues. */}
                    {ateliers.length > 0 && (
                      <>
                        <Separator className="my-2" />
                        <div className="flex items-center justify-between">
                          <div className={SECTION_LABEL}>Atelier</div>
                          {atelierFilter.size > 0 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => setAtelierFilter(new Set())}
                              title="Réinitialiser le filtre atelier"
                              aria-label="Réinitialiser le filtre atelier"
                            >
                              <X size={12} strokeWidth={2} aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                        <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
                          {ateliers.map((a) => (
                            <ToolbarSegment
                              key={a.code}
                              active={atelierFilter.has(a.code)}
                              onClick={() => toggleAtelier(a.code)}
                              title={a.label}
                            >
                              {a.label.replace(/^ATELIER\s+/i, '')}
                            </ToolbarSegment>
                          ))}
                        </ToolbarSegmented>
                      </>
                    )}
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>

            {/* Colonnes — visibilité. La colonne d'index (N°) est toujours
                rendue ; l'identité de ligne (Commande · Client) est verrouillée.
                Préférence persistée par mode (localStorage versionné). */}
            <Popover.Root open={colOpen} onOpenChange={setColOpen}>
              <Popover.Trigger
                render={
                  <Pill
                    variant="outline"
                    className="gap-1.5"
                    title="Afficher ou masquer des colonnes"
                    aria-label="Colonnes visibles"
                  >
                    <Columns3 size={14} strokeWidth={1.75} className="text-muted-foreground" />
                    Colonnes
                  </Pill>
                }
              />
              <Popover.Portal>
                <Popover.Positioner
                  side="bottom"
                  align="end"
                  sideOffset={8}
                  collisionPadding={8}
                  className="z-50"
                >
                  <Popover.Popup data-slot="filter-menu-panel" className="w-[280px] p-2">
                    <div className={SECTION_LABEL}>Colonnes visibles</div>
                    <div className="flex flex-col">
                      {COLUMN_CATALOGS[mode].map((c) => {
                        const checked = colVis[mode].includes(c.id)
                        return (
                          <label
                            key={c.id}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted',
                              c.locked && 'cursor-default opacity-70 hover:bg-transparent'
                            )}
                            title={
                              c.locked
                                ? 'Toujours affichée — identité de ligne'
                                : c.label
                            }
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={c.locked}
                              onChange={() => toggleColumn(c.id)}
                              style={{ accentColor: 'var(--accent)' }}
                              className="size-3.5"
                            />
                            <span className="flex-1 truncate">{c.label}</span>
                            {c.locked && (
                              <Lock
                                size={10}
                                strokeWidth={2}
                                className="text-muted-foreground/60"
                                aria-hidden="true"
                              />
                            )}
                          </label>
                        )
                      })}
                    </div>
                    <Separator className="my-2" />
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="w-full justify-start text-muted-foreground hover:text-foreground"
                      onClick={resetColumns}
                    >
                      Réinitialiser les colonnes
                    </Button>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>

            {/* Aucun raccourci de filtre dans la rangée : TOUT ce qui filtre vit
                sous le déclencheur « Filtres ». Les compteurs de gravité y sont
                portés par les chips elles-mêmes (point + libellé + volume) — la
                rangée n'a plus qu'à dire ce qu'on regarde et ce qu'on en fait. */}
          </ToolbarGroup>

          <ToolbarSpacer />

          {/* Recherche — déplacée depuis le Masthead pour cohérence avec
              les autres pages (la recherche vit dans la toolbar, pas dans
              la barre de navigation globale). Reste toujours visible : pas
              un filtre secondaire, pas de consolidation derrière un clic. */}
          <ToolbarSearch
            value={query}
            onChange={setQuery}
            placeholder="Commande, article, client…"
          />
          {/* Volume — uniquement sous filtre, et sans le total. Le total ne se
              décide pas : il ne bouge pas, il n'apprend rien, et il occupait la
              rangée en permanence. Ce qui compte est ce que le filtrage a
              laissé. */}
          {isFiltered && (
            <ToolbarMetric emphasis title={`sur ${totalCount} lignes ouvertes`}>
              {filteredCount} <span className="font-normal text-muted-foreground">lignes</span>
            </ToolbarMetric>
          )}
          {staleness && (
            <ToolbarMetric title={stalenessTitle} tone={perime ? 'warning' : undefined}>
              {staleness}
            </ToolbarMetric>
          )}
          <ToolbarRefresh loading={loading} onClick={refresh} />
        </Toolbar>

        {mode === 'reactif' ? (
          <ReactiveView
            view={view}
            filteredRows={reactiveFilteredRows}
            loading={rowsLoading}
            error={!!rowsError}
            onRetry={refresh}
            isFiltered={isFiltered}
            horsFenetre={horsFenetre}
            onResetFilters={resetFilters}
            onRowClick={openReactiveRow}
            selectedRowKey={selectedRowKey}
            visibleColumnIds={colVis.reactif}
            printContext={printContext}
          />
        ) : (
          <ProactiveView
            view={proView}
            filteredRows={proFilteredRows}
            loading={proLoading}
            error={!!proError}
            onRetry={refresh}
            isFiltered={isFiltered}
            horsFenetre={horsFenetre}
            onResetFilters={resetFilters}
            onRowClick={openProactiveRow}
            selectedRowKey={selectedRowKey}
            onSelectOf={onSelectOf}
            showSubAssemblies={showSubAssemblies}
            visibleColumnIds={colVis.proactif}
            printContext={printContext}
          />
        )}
      </div>

      {/* Drawer diagnostic de ligne */}
      <Sheet open={selectedRow !== null} onOpenChange={(open) => !open && setSelectedRow(null)}>
        {selectedRow && (
          <SheetContent className="no-scrollbar overflow-y-auto sm:max-w-xl">
            <SheetHeader>
              <SheetTitle>Diagnostic de la ligne</SheetTitle>
              <SheetDescription>
                Détails opérationnels et goulets d'étranglement de la commande client.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4">
              <SuiviDetailSheet type={selectedRow.type} row={selectedRow.row} />
            </div>
          </SheetContent>
        )}
      </Sheet>

      {/* Drawer détail OF (faisabilité) — n° d'OF cliqué en colonne Couverture (proactif). */}
      <OfDetailSheet num={selectedOf} open={ofDetailOpen} onOpenChange={setOfDetailOpen} />
    </AppLayout>
  )
}
