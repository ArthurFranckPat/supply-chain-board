/**
 * Page « Suivi des commandes » (issue #19) — port React de
 * inertia/pages/scheduler/tracking.tsx (axe allocation / expédition).
 *
 * Shell Inertia rendu instantanément (SuiviController.board) ; les lignes
 * (calcul lourd) sont chargées en différé par fetch JSON. Shell (fetch +
 * toolbar + switch) — le rendu de chaque mode vit dans
 * components/tracking/*-view.tsx (issue #52).
 */
import { useMemo, useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { fr } from 'react-day-picker/locale'
import { CalendarDays, ChevronDown, SlidersHorizontal } from 'lucide-react'
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
import { EMPTY, PROACTIVE_EMPTY, fmtMs, suiviRowKey } from '@r/lib/suivi/tracking-shared'

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

const TODAY = startOfDay(new Date())
const TODAY_ISO = toIso(TODAY)
const LATE_FLOOR_ISO = (() => {
  const d = new Date(TODAY)
  d.setDate(d.getDate() - LATE_LOOKBACK_DAYS)
  return toIso(d)
})()
const DEFAULT_RANGE_END = (() => {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + DEFAULT_FORWARD_DAYS)
  return d
})()

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
  'px-0.5 pb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground'

interface DateRange {
  start: Date | null
  end: Date | null
}

export default function Tracking(props: SuiviPageProps) {
  // Calcul lourd différé : fetch client-side, relancé au bust (bouton refresh
  // → ?refresh=N invalide le cache serveur).
  const [bust, setBust] = useState(0)

  const rowsUrl = `${props.rowsHref}${bust ? `?refresh=${bust}` : ''}`
  const proUrl = `${props.proactiveRowsHref}${bust ? `?refresh=${bust}` : ''}`

  const {
    data,
    loading: rowsLoading,
    error: rowsError,
    ms: rowsMs,
    elapsed,
  } = useTimedFetch<SuiviRowsResponse>(rowsUrl)
  const view = data ?? EMPTY

  // ── Vue proactive (réalisabilité des commandes via le moteur séquentiel) ──
  // Vue par défaut : c'est celle qui porte la réalisabilité, donc l'usage quotidien.
  const [mode, setMode] = useState<'reactif' | 'proactif'>('proactif')
  const {
    data: proData,
    loading: proLoading,
    error: proError,
    ms: proMs,
    elapsed: proElapsed,
  } = useTimedFetch<ProactiveRowsResponse>(proUrl)
  const proView = proData ?? PROACTIVE_EMPTY

  // Plage de dates d'expédition affichée — filtre CLIENT pur (pas de re-fetch).
  // Les lignes déjà en retard restent TOUJOURS visibles hors plage, plafonnées
  // à -90j depuis aujourd'hui.
  const [dateRange, setDateRange] = useState<DateRange>({
    start: TODAY,
    end: DEFAULT_RANGE_END,
  })
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
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SuiviStatusKey | 'all'>('all')
  const [verdictFilter, setVerdictFilter] = useState<ProactiveVerdictKey | 'all'>('all')
  // Vue proactif : inclure les sous-ensembles (semi-finis) dans la colonne « Composants en
  // rupture ». Défaut ON — un SE suspendu à un OF bloque la commande autant qu'un acheté.
  const [showSubAssemblies, setShowSubAssemblies] = useState(true)
  // Étend la recherche à TOUTE la nomenclature de l'article (« quelles commandes embarquent ce
  // composant ? »). Défaut OFF : sans lui, un résultat veut dire « ce composant bloque cette
  // commande » — fondre les deux rendrait la réponse ambiguë.
  const [searchBom, setSearchBom] = useState(false)
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set(DEFAULT_TYPES))
  // Filtre atelier (#36) : ensemble de STOLOC retenus (vide = tous).
  const [atelierFilter, setAtelierFilter] = useState<Set<string>>(new Set())

  const [selectedRow, setSelectedRow] = useState<{
    type: 'reactif' | 'proactif'
    row: SuiviDisplayRow | ProactiveDisplayRow
  } | null>(null)

  // Détail OF (faisabilité) au clic sur un n° d'OF (colonne Couverture, proactif).
  const [selectedOf, setSelectedOf] = useState<string | null>(null)
  const [ofDetailOpen, setOfDetailOpen] = useState(false)
  const onSelectOf = (numOf: string) => {
    setSelectedOf(numOf)
    setOfDetailOpen(true)
  }

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

  const selectedRowKey = selectedRow ? suiviRowKey(selectedRow.row) : null

  const loading = mode === 'reactif' ? rowsLoading : proLoading
  const lastMs = mode === 'reactif' ? rowsMs : proMs
  const liveElapsed = mode === 'reactif' ? elapsed : proElapsed
  const shownMs = loading ? liveElapsed : lastMs

  const chipCount = (on: boolean, count?: number) =>
    count !== undefined && count > 0 ? (
      <span
        className={cn(
          'rounded-full px-1.5 py-px text-[8px] font-bold leading-none tabular-nums',
          on ? 'bg-brand/15 text-brand' : 'bg-foreground/[0.06] text-muted-foreground'
        )}
      >
        {count}
      </span>
    ) : null

  const statusChip = (k: SuiviStatusKey | 'all', label: string, count?: number) => {
    const on = statusFilter === k
    return (
      <ToolbarSegment active={on} onClick={() => setStatusFilter(on ? 'all' : k)}>
        {label}
        {chipCount(on, count)}
      </ToolbarSegment>
    )
  }

  const verdictChip = (k: ProactiveVerdictKey | 'all', label: string, count?: number) => {
    const on = verdictFilter === k
    return (
      <ToolbarSegment active={on} onClick={() => setVerdictFilter(on ? 'all' : k)}>
        {label}
        {chipCount(on, count)}
      </ToolbarSegment>
    )
  }

  // Filtres secondaires uniquement (hors recherche, qui reste toujours
  // visible dans la rangée) — pilote la pastille du déclencheur Filtres.
  // Un filtre est « actif » quand il s'ÉCARTE du défaut — pas quand il est simplement coché.
  // Sous-ensembles et NOR étant activés au chargement, c'est leur décochage qui compte.
  const filtersActive =
    (mode === 'reactif' && statusFilter !== 'all') ||
    (mode === 'proactif' && verdictFilter !== 'all') ||
    (mode === 'proactif' && !showSubAssemblies) ||
    (mode === 'proactif' && searchBom) ||
    DEFAULT_TYPES.some((t) => !typeFilter.has(t)) ||
    atelierFilter.size > 0
  const isFiltered = !!query.trim() || filtersActive
  const filteredCount = mode === 'reactif' ? reactiveFilteredRows.length : proFilteredRows.length
  const totalCount = mode === 'reactif' ? view.total : proView.total

  const resetFilters = () => {
    setQuery('')
    setStatusFilter('all')
    setVerdictFilter('all')
    setShowSubAssemblies(true)
    setSearchBom(false)
    setTypeFilter(new Set(DEFAULT_TYPES))
    setAtelierFilter(new Set())
  }

  return (
    <AppLayout
      title="Suivi"
      active="tracking"
      subtitle="Suivi · Allocation & expédition"
      theme="cursor"
      dense
      scrollable={false}
      meta={
        <>
          <div className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-brand">
            {refLabel}
          </div>
          <div className="text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">{totalCount}</span> lignes ouvertes
          </div>
        </>
      }
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
                onClick={() => setMode('reactif')}
                title="Suivi as-is : statuts allocation/expédition + causes de retard"
              >
                Réactif
              </ToolbarSegment>
              <ToolbarSegment
                active={mode === 'proactif'}
                onClick={() => setMode('proactif')}
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
                    title="Filtres"
                  >
                    <SlidersHorizontal
                      size={14}
                      strokeWidth={1.75}
                      className="text-muted-foreground"
                    />
                    Filtres
                    {filtersActive ? (
                      <span className="ml-0.5 size-1.5 rounded-full bg-brand" aria-hidden="true" />
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
                        <ToolbarSegmented className="w-full flex-wrap">
                          {statusChip('all', 'Tous', view.total)}
                          {statusChip('ret', 'Retard', view.statusCounts.RETARD_PROD)}
                          {statusChip('alc', 'À allouer', view.statusCounts.ALLOCATION_A_FAIRE)}
                          {statusChip('exp', 'À expédier', view.statusCounts.A_EXPEDIER)}
                        </ToolbarSegmented>
                        <Separator className="my-2" />
                      </>
                    )}
                    {mode === 'proactif' && (
                      <>
                        <div className={SECTION_LABEL}>Verdict</div>
                        <ToolbarSegmented className="w-full flex-wrap">
                          {verdictChip('all', 'Tous', proView.total)}
                          {verdictChip('blocked', 'Bloquée', proView.verdictCounts.blocked)}
                          {verdictChip('uncov', 'Sans couverture', proView.verdictCounts.uncov)}
                          {verdictChip('late', 'Retard', proView.verdictCounts.late)}
                          {verdictChip('risk', 'À risque', proView.verdictCounts.risk)}
                        </ToolbarSegmented>
                        <Separator className="my-2" />
                        <div className={SECTION_LABEL}>Composants en rupture</div>
                        <ToolbarSegmented className="w-full flex-wrap">
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
                    <ToolbarSegmented className="w-full justify-between">
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
                              className="font-mono text-[10px] text-muted-foreground hover:text-foreground"
                              onClick={() => setAtelierFilter(new Set())}
                              title="Réinitialiser le filtre atelier"
                            >
                              ✕
                            </Button>
                          )}
                        </div>
                        <ToolbarSegmented className="w-full flex-wrap">
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
          </ToolbarGroup>

          <ToolbarSpacer />

          {/* Recherche — déplacée depuis le Masthead pour cohérence avec
              les autres pages (la recherche vit dans la toolbar, pas dans
              la barre de navigation globale). Reste toujours visible : pas
              un filtre secondaire, pas de consolidation derrière un clic. */}
          <ToolbarSearch
            value={query}
            onChange={setQuery}
            placeholder="Commande, article, client, composant…"
          />
          {/* Compteur filtré */}
          {isFiltered && (
            <span className="font-mono text-xs font-medium tabular-nums text-foreground">
              {filteredCount} <span className="text-muted-foreground">/ {totalCount}</span>
            </span>
          )}
          {/* Durée de chargement X3 — live pendant le fetch, dernier résultat ensuite. */}
          {shownMs !== null && (
            <span
              className="font-mono text-xs tabular-nums text-muted-foreground"
              title={loading ? 'Chargement X3 en cours' : 'Durée dernier chargement X3'}
            >
              {fmtMs(shownMs)}
            </span>
          )}
          <ToolbarRefresh loading={loading} onClick={() => setBust((b) => b + 1)} />
        </Toolbar>

        {mode === 'reactif' ? (
          <ReactiveView
            view={view}
            filteredRows={reactiveFilteredRows}
            loading={rowsLoading}
            error={!!rowsError}
            onResetFilters={resetFilters}
            onRowClick={(row) => setSelectedRow({ type: 'reactif', row })}
            selectedRowKey={selectedRowKey}
          />
        ) : (
          <ProactiveView
            view={proView}
            filteredRows={proFilteredRows}
            loading={proLoading}
            error={!!proError}
            onResetFilters={resetFilters}
            onRowClick={(row) => setSelectedRow({ type: 'proactif', row })}
            selectedRowKey={selectedRowKey}
            onSelectOf={onSelectOf}
            showSubAssemblies={showSubAssemblies}
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
