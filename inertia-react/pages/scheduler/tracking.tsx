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
import { Search } from 'lucide-react'

import type {
  SuiviPageProps,
  SuiviStatusKey,
  ProactiveVerdictKey,
  SuiviRowsResponse,
  ProactiveRowsResponse,
  SuiviDisplayRow,
  ProactiveDisplayRow,
} from '@/lib/suivi/types'
import { toIso, startOfDay } from '@/lib/vision/date-utils'
import { EMPTY, PROACTIVE_EMPTY, fmtMs } from '@/lib/suivi/tracking-shared'

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
  PILL,
  Segment,
  SegmentButton,
  DateWindowPill,
  RefreshPill,
  ToolbarRow,
  ToolbarSpacer,
  FilterMenu,
  FilterMenuSectionLabel,
} from '@r/components/vision/toolbar'
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
  const [mode, setMode] = useState<'reactif' | 'proactif'>('reactif')
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
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set(['MTS', 'MTO']))
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
      r = r.filter((row) => terms.every((t) => row.filter.includes(t)))
    }
    return r
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proView.rows, query, verdictFilter, typeFilter, atelierFilter, dateRange])

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

  const selectedRowKey = selectedRow
    ? `${selectedRow.row.numCommande}::${selectedRow.row.article}`
    : null

  const loading = mode === 'reactif' ? rowsLoading : proLoading
  const lastMs = mode === 'reactif' ? rowsMs : proMs
  const liveElapsed = mode === 'reactif' ? elapsed : proElapsed

  const chipCount = (on: boolean, count?: number) =>
    count !== undefined && count > 0 ? (
      <span
        className={cn(
          'rounded-full px-1.5 py-px text-[8px] font-extrabold leading-none tabular-nums',
          on ? 'bg-brand/15 text-brand' : 'bg-foreground/[0.06] text-muted-foreground'
        )}
      >
        {count}
      </span>
    ) : null

  const statusChip = (k: SuiviStatusKey | 'all', label: string, count?: number) => {
    const on = statusFilter === k
    return (
      <SegmentButton active={on} onClick={() => setStatusFilter(on ? 'all' : k)}>
        {label}
        {chipCount(on, count)}
      </SegmentButton>
    )
  }

  const verdictChip = (k: ProactiveVerdictKey | 'all', label: string, count?: number) => {
    const on = verdictFilter === k
    return (
      <SegmentButton active={on} onClick={() => setVerdictFilter(on ? 'all' : k)}>
        {label}
        {chipCount(on, count)}
      </SegmentButton>
    )
  }

  // Filtres secondaires uniquement (hors recherche, qui reste toujours
  // visible dans la rangée) — pilote la pastille du déclencheur FilterMenu.
  const filtersActive =
    (mode === 'reactif' && statusFilter !== 'all') ||
    (mode === 'proactif' && verdictFilter !== 'all') ||
    !typeFilter.has('MTS') ||
    !typeFilter.has('MTO') ||
    atelierFilter.size > 0
  const isFiltered = !!query.trim() || filtersActive
  const filteredCount = mode === 'reactif' ? reactiveFilteredRows.length : proFilteredRows.length
  const totalCount = mode === 'reactif' ? view.total : proView.total

  const resetFilters = () => {
    setQuery('')
    setStatusFilter('all')
    setVerdictFilter('all')
    setTypeFilter(new Set(['MTS', 'MTO']))
    setAtelierFilter(new Set())
  }

  return (
    <AppLayout
      title="Suivi"
      active="tracking"
      subtitle="Suivi · Allocation & expédition"
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <>
          <div className="text-[12px] font-bold capitalize not-italic text-brand">
            {refLabel}
          </div>
          <div>
            <b className="font-bold text-foreground">{totalCount}</b> lignes ouvertes
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
        <ToolbarRow className="select-none" noWrap>
          {/* Bascule Réactif / Proactif */}
          <Segment role="radiogroup" ariaLabel="Vue" className="shrink-0">
            <SegmentButton
              role="radio"
              active={mode === 'reactif'}
              onClick={() => setMode('reactif')}
              title="Suivi as-is : statuts allocation/expédition + causes de retard"
            >
              Réactif
            </SegmentButton>
            <SegmentButton
              role="radio"
              active={mode === 'proactif'}
              onClick={() => setMode('proactif')}
              title="Réalisabilité projetée : consommation séquentielle des composants entre OFs"
            >
              Proactif
            </SegmentButton>
          </Segment>

          {/* Fenêtre — sélecteur de plage (filtre client, pas de re-fetch). */}
          <DateWindowPill
            open={dateOpen}
            onOpenChange={setDateOpen}
            selected={{ from: dateRange.start ?? undefined, to: dateRange.end ?? undefined }}
            onSelect={applyRange}
            align="right"
            title="Filtrer par plage de dates d'expédition (les lignes en retard restent toujours visibles)"
          />

          {/* Filtres — déclencheur unique (Statut/Verdict selon la vue +
              Type + Atelier). Avant : 3-4 <Segment> empilés forçaient un
              scroll horizontal sur la rangée (voir commentaire retiré) ;
              consolidés ici, la rangée ne déborde plus jamais. */}
          <FilterMenu
            label="Filtres"
            indicators={
              filtersActive ? <span className="ml-0.5 size-1.5 rounded-full bg-brand" aria-hidden="true" /> : null
            }
          >
            {mode === 'reactif' && (
              <>
                <FilterMenuSectionLabel>Statut</FilterMenuSectionLabel>
                <Segment className="w-full flex-wrap">
                  {statusChip('all', 'Tous', view.total)}
                  {statusChip('ret', 'Retard', view.statusCounts.RETARD_PROD)}
                  {statusChip('alc', 'À allouer', view.statusCounts.ALLOCATION_A_FAIRE)}
                  {statusChip('exp', 'À expédier', view.statusCounts.A_EXPEDIER)}
                </Segment>
                <div className="my-2.5 border-t border-rule-soft" />
              </>
            )}
            {mode === 'proactif' && (
              <>
                <FilterMenuSectionLabel>Verdict</FilterMenuSectionLabel>
                <Segment className="w-full flex-wrap">
                  {verdictChip('all', 'Tous', proView.total)}
                  {verdictChip('blocked', 'Bloquée', proView.verdictCounts.blocked)}
                  {verdictChip('uncov', 'Sans couverture', proView.verdictCounts.uncov)}
                  {verdictChip('late', 'Retard', proView.verdictCounts.late)}
                  {verdictChip('risk', 'À risque', proView.verdictCounts.risk)}
                </Segment>
                <div className="my-2.5 border-t border-rule-soft" />
              </>
            )}
            <FilterMenuSectionLabel>Type</FilterMenuSectionLabel>
            <Segment className="w-full justify-between">
              {['MTS', 'MTO', 'NOR'].map((t) => (
                <SegmentButton key={t} active={typeFilter.has(t)} onClick={() => toggleType(t)}>
                  {t}
                </SegmentButton>
              ))}
            </Segment>
            {/* Filtre atelier (#36) — chips STOLOC. Transverse aux 2 vues. */}
            {ateliers.length > 0 && (
              <>
                <div className="my-2.5 border-t border-rule-soft" />
                <div className="flex items-center justify-between">
                  <FilterMenuSectionLabel>Atelier</FilterMenuSectionLabel>
                  {atelierFilter.size > 0 && (
                    <button
                      type="button"
                      className="rounded-md px-1.5 py-1 font-mono text-2xs font-bold tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => setAtelierFilter(new Set())}
                      title="Réinitialiser le filtre atelier"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <Segment className="w-full flex-wrap">
                  {ateliers.map((a) => (
                    <SegmentButton
                      key={a.code}
                      active={atelierFilter.has(a.code)}
                      onClick={() => toggleAtelier(a.code)}
                      title={a.label}
                    >
                      {a.label.replace(/^ATELIER\s+/i, '')}
                    </SegmentButton>
                  ))}
                </Segment>
              </>
            )}
          </FilterMenu>

          <ToolbarSpacer />

          {/* Recherche — déplacée depuis le Masthead pour cohérence avec
              les autres pages (la recherche vit dans la toolbar, pas dans
              la barre de navigation globale). Reste toujours visible : pas
              un filtre secondaire, pas de consolidation derrière un clic. */}
          <div className={cn(PILL, 'shrink-0')}>
            <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[200px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
              placeholder="Commande, article, client…"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
          {/* Compteur filtré */}
          {isFiltered && (
            <span className="font-mono text-xs font-bold tabular-nums text-brand">
              {filteredCount}{' '}
              <span className="font-medium text-muted-foreground">/ {totalCount}</span>
            </span>
          )}
          {/* Durée de chargement X3 */}
          {loading && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {fmtMs(liveElapsed)}
            </span>
          )}
          {!loading && lastMs !== null && (
            <span
              className="font-mono text-xs tabular-nums text-muted-foreground/60"
              title="Durée dernier chargement X3"
            >
              {fmtMs(lastMs)}
            </span>
          )}
          <RefreshPill loading={loading} onClick={() => setBust((b) => b + 1)} />
        </ToolbarRow>

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
