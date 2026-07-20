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
import { fr } from 'react-day-picker/locale'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { Search, RefreshCw, Calendar as CalendarIcon, ChevronDown } from 'lucide-react'

import type {
  SuiviPageProps,
  SuiviStatusKey,
  ProactiveVerdictKey,
  SuiviRowsResponse,
  ProactiveRowsResponse,
  SuiviDisplayRow,
  ProactiveDisplayRow,
} from '@/lib/suivi/types'
import { parseIso, toIso, startOfDay } from '@/lib/vision/date-utils'
import { EMPTY, PROACTIVE_EMPTY, fmtMs } from '@/lib/suivi/tracking-shared'

import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import { Calendar } from '@r/components/ui/calendar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@r/components/ui/sheet'
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

  // Jamais de ISO (aaaa-mm-jj) affiché à l'écran — toujours jj/mm/aaaa (règle projet).
  const fmtFrDate = (iso: string) => {
    const d = parseIso(iso)
    return d ? d.toLocaleDateString('fr-FR') : iso
  }
  const rangeLabel = (() => {
    const { start, end } = dateRange
    if (!start || !end) return '—'
    return `${fmtFrDate(toIso(start))} → ${fmtFrDate(toIso(end))}`
  })()

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

  const chipCls = (on: boolean) =>
    `inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider transition-colors ${
      on ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
    }`

  const chipCount = (on: boolean, count?: number) =>
    count !== undefined && count > 0 ? (
      <span
        className={`rounded-full px-1.5 py-px text-[8px] font-extrabold leading-none tabular-nums ${
          on ? 'bg-brand/15 text-brand' : 'bg-foreground/[0.06] text-muted-foreground'
        }`}
      >
        {count}
      </span>
    ) : null

  const statusChip = (k: SuiviStatusKey | 'all', label: string, count?: number) => {
    const on = statusFilter === k
    return (
      <button type="button" className={chipCls(on)} onClick={() => setStatusFilter(on ? 'all' : k)}>
        {label}
        {chipCount(on, count)}
      </button>
    )
  }

  const verdictChip = (k: ProactiveVerdictKey | 'all', label: string, count?: number) => {
    const on = verdictFilter === k
    return (
      <button
        type="button"
        className={chipCls(on)}
        onClick={() => setVerdictFilter(on ? 'all' : k)}
      >
        {label}
        {chipCount(on, count)}
      </button>
    )
  }

  const isFiltered =
    !!query.trim() ||
    (mode === 'reactif' && statusFilter !== 'all') ||
    (mode === 'proactif' && verdictFilter !== 'all') ||
    !typeFilter.has('MTS') ||
    !typeFilter.has('MTO') ||
    atelierFilter.size > 0
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

        {/* ═══ Toolbar ═══ */}
        {/* overflow-x-auto isolé aux CHIPS (sous-div) : sur toute la rangée, il
            couperait le popover du sélecteur de date (quirk overflow CSS). */}
        <div className="flex flex-none select-none items-center gap-2.5 border-b border-rule px-7 py-2">
          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto">
            {/* Bascule Réactif / Proactif */}
            <div className="inline-flex shrink-0 items-center rounded-md border border-rule bg-card p-0.5">
              <button
                type="button"
                className={chipCls(mode === 'reactif')}
                onClick={() => setMode('reactif')}
                title="Suivi as-is : statuts allocation/expédition + causes de retard"
              >
                Réactif
              </button>
              <button
                type="button"
                className={chipCls(mode === 'proactif')}
                onClick={() => setMode('proactif')}
                title="Réalisabilité projetée : consommation séquentielle des composants entre OFs"
              >
                Proactif
              </button>
            </div>
            {mode === 'reactif' && (
              <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rule bg-card p-0.5">
                <span className="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                  Statut
                </span>
                {statusChip('all', 'Tous', view.total)}
                {statusChip('ret', 'Retard', view.statusCounts.RETARD_PROD)}
                {statusChip('alc', 'À allouer', view.statusCounts.ALLOCATION_A_FAIRE)}
                {statusChip('exp', 'À expédier', view.statusCounts.A_EXPEDIER)}
              </div>
            )}
            {mode === 'proactif' && (
              <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rule bg-card p-0.5">
                <span className="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                  Verdict
                </span>
                {verdictChip('all', 'Tous', proView.total)}
                {verdictChip('blocked', 'Bloquée', proView.verdictCounts.blocked)}
                {verdictChip('uncov', 'Sans couverture', proView.verdictCounts.uncov)}
                {verdictChip('late', 'Retard', proView.verdictCounts.late)}
                {verdictChip('risk', 'À risque', proView.verdictCounts.risk)}
              </div>
            )}
            <div className="inline-flex shrink-0 items-center gap-1 rounded-md border border-rule bg-card p-0.5">
              <span className="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                Type
              </span>
              {['MTS', 'MTO', 'NOR'].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={chipCls(typeFilter.has(t))}
                  onClick={() => toggleType(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            {/* Filtre atelier (#36) — chips STOLOC. Transverse aux 2 vues. */}
            {ateliers.length > 0 && (
              <div className="inline-flex shrink-0 flex-nowrap items-center gap-1 rounded-md border border-rule bg-card p-0.5">
                <span className="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
                  Atelier
                </span>
                {ateliers.map((a) => (
                  <button
                    key={a.code}
                    type="button"
                    className={chipCls(atelierFilter.has(a.code))}
                    onClick={() => toggleAtelier(a.code)}
                    title={a.label}
                  >
                    {a.label.replace(/^ATELIER\s+/i, '')}
                  </button>
                ))}
                {atelierFilter.size > 0 && (
                  <button
                    type="button"
                    className="rounded-[5px] px-1.5 py-1 font-mono text-[10px] font-bold tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setAtelierFilter(new Set())}
                    title="Réinitialiser le filtre atelier"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Recherche — déplacée depuis le Masthead pour cohérence avec
                les autres pages (la recherche vit dans la toolbar, pas dans
                la barre de navigation globale). */}
            <div className="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
              <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
              <input
                className="w-[200px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
                placeholder="Commande, article, client…"
                type="text"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
            {/* Compteur filtré */}
            {isFiltered && (
              <span className="font-mono text-[11px] font-bold tabular-nums text-brand">
                {filteredCount}{' '}
                <span className="font-medium text-muted-foreground">/ {totalCount}</span>
              </span>
            )}
            {/* Durée de chargement X3 */}
            {loading && (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {fmtMs(liveElapsed)}
              </span>
            )}
            {!loading && lastMs !== null && (
              <span
                className="font-mono text-[11px] tabular-nums text-muted-foreground/60"
                title="Durée dernier chargement X3"
              >
                {fmtMs(lastMs)}
              </span>
            )}
            <button
              type="button"
              onClick={() => setBust((b) => b + 1)}
              disabled={loading}
              className="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-brand disabled:opacity-50"
              title="Recharger les données X3 (cache → re-fetch live)"
            >
              <RefreshCw size={14} strokeWidth={1.75} className={cn('text-muted-foreground', loading && 'animate-spin')} />
              Actualiser
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDateOpen((o) => !o)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors hover:border-brand ${
                  dateOpen ? 'border-brand bg-brand-soft/20 text-brand' : 'border-rule bg-card'
                }`}
                title="Filtrer par plage de dates d'expédition (les lignes en retard restent toujours visibles)"
              >
                <CalendarIcon size={14} strokeWidth={1.75} className="text-muted-foreground" />
                {rangeLabel}
                <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
              </button>
              {dateOpen && (
                <>
                  <button
                    type="button"
                    tabIndex={-1}
                    className="fixed inset-0 z-40 cursor-default"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setDateOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-50 mt-2 rounded-lg border bg-card shadow-lg">
                    <Calendar
                      mode="range"
                      locale={fr}
                      numberOfMonths={2}
                      selected={{
                        from: dateRange.start ?? undefined,
                        to: dateRange.end ?? undefined,
                      }}
                      onSelect={applyRange}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

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
