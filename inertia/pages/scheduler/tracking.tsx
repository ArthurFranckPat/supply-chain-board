import { createMemo, createSignal, For, Show, type Component } from 'solid-js'

import type { SuiviPageProps, SuiviStatusKey, ProactiveVerdictKey } from '@/lib/suivi/types'
import { Masthead } from '@/components/masthead'
import { Calendar, type DateRange } from '@/components/ui/calendar'
import { parseIso, toIso, startOfDay } from '@/lib/vision/date-utils'
import { EMPTY, PROACTIVE_EMPTY, fmtMs } from '@/lib/suivi/tracking-shared'
import { useTimedFetch } from '@/lib/suivi/use-timed-fetch'
import { ReactiveView } from '@/components/tracking/reactive-view'
import { ProactiveView } from '@/components/tracking/proactive-view'
import type { SuiviRowsResponse, ProactiveRowsResponse } from '@/lib/suivi/types'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody } from '@/components/ui/sheet'
import { SuiviDetailSheet } from '@/components/tracking/suivi-detail-sheet'
import type { SuiviDisplayRow, ProactiveDisplayRow } from '@/lib/suivi/types'

/**
 * Page « Suivi des commandes » (issue #19) — axe allocation / expédition.
 *
 * Shell Inertia rendu instantanément (SuiviController.board) ; les lignes (calcul
 * lourd : assignation des 4 statuts + causes + signal CQ depuis X3) sont chargées
 * en différé par fetch JSON (SuiviController.rows). Même motif que la page
 * ruptures (scheduler/shortages). Registre Papier harmonisé avec shortage-table
 * + Rangée rupture (design_system §07).
 *
 * Shell (fetch + toolbar + switch) — le rendu de chaque mode (réactif/proactif)
 * vit dans components/tracking/*-view.tsx (issue #52).
 */

// Fenêtre chargée côté serveur (toujours today-90j/+30j, fixe — cf SuiviController). Le filtrage
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

const Tracking: Component<SuiviPageProps> = (props) => {
  // Calcul lourd différé : fetch client-side, relancé au bust (bouton refresh → ?refresh=N
  // invalide le cache serveur). rowsHref/proactiveRowsHref sont statiques (plus de referenceDate
  // serveur) — le filtrage par date est désormais un filtre client, cf dateRange plus bas.
  const [bust, setBust] = createSignal(0)

  const {
    data,
    ms: rowsMs,
    elapsed,
  } = useTimedFetch<SuiviRowsResponse>(
    () => `${props.rowsHref}${bust() ? `?refresh=${bust()}` : ''}`
  )
  const view = createMemo(() => data() ?? EMPTY)

  // ── Vue proactive (réalisabilité des commandes via le moteur séquentiel) ──
  const [mode, setMode] = createSignal<'reactif' | 'proactif'>('reactif')
  const {
    data: proData,
    ms: proMs,
    elapsed: proElapsed,
  } = useTimedFetch<ProactiveRowsResponse>(
    () => `${props.proactiveRowsHref}${bust() ? `?refresh=${bust()}` : ''}`
  )
  const proView = createMemo(() => proData() ?? PROACTIVE_EMPTY)

  // Plage de dates d'expédition affichée — filtre CLIENT pur (pas de re-fetch). Les lignes déjà
  // en retard (expé < aujourd'hui) restent TOUJOURS visibles hors plage, plafonnées à -90j
  // (LATE_LOOKBACK_DAYS) depuis aujourd'hui — jamais depuis la plage choisie.
  const [dateRange, setDateRange] = createSignal<DateRange>({ start: TODAY, end: DEFAULT_RANGE_END })
  const inRangeOrLate = (dateExpIso: string | null): boolean => {
    if (!dateExpIso) return true
    const { start, end } = dateRange()
    if (start && end) {
      const s = toIso(start)
      const e = toIso(end)
      if (dateExpIso >= s && dateExpIso <= e) return true
    }
    return dateExpIso < TODAY_ISO && dateExpIso >= LATE_FLOOR_ISO
  }

  // Filtres côté client. Recherche/type/atelier transverses aux 2 vues ;
  // statut/verdict spécifiques à leur mode.
  const [query, setQuery] = createSignal('')
  const [statusFilter, setStatusFilter] = createSignal<SuiviStatusKey | 'all'>('all')
  const [verdictFilter, setVerdictFilter] = createSignal<ProactiveVerdictKey | 'all'>('all')
  const [typeFilter, setTypeFilter] = createSignal<Set<string>>(new Set(['MTS', 'MTO']))
  // Filtre atelier (#36) : ensemble de STOLOC retenus (vide = tous). Transverse aux 2 vues.
  const [atelierFilter, setAtelierFilter] = createSignal<Set<string>>(new Set())

  const [selectedRow, setSelectedRow] = createSignal<{
    type: 'reactif' | 'proactif'
    row: SuiviDisplayRow | ProactiveDisplayRow
  } | null>(null)

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
  const ateliers = createMemo(() => (mode() === 'proactif' ? proView().ateliers : view().ateliers))

  // Filtrage (le tri est de la responsabilité de chaque vue — cf reactive-view/proactive-view).
  const reactiveFilteredRows = createMemo(() => {
    const all = view().rows
    const q = query().trim().toLowerCase()
    const sf = statusFilter()
    const tf = typeFilter()
    const af = atelierFilter()
    let r = all.filter(
      (row) =>
        (sf === 'all' || row.statusKey === sf) &&
        tf.has(row.type) &&
        (af.size === 0 || af.has(row.atelier)) &&
        inRangeOrLate(row.dateExpIso)
    )
    if (q) {
      const terms = q.split(/\s+/)
      r = r.filter((row) => terms.every((t) => row.filter.includes(t)))
    }
    return r
  })
  const proFilteredRows = createMemo(() => {
    const all = proView().rows
    const q = query().trim().toLowerCase()
    const vf = verdictFilter()
    const tf = typeFilter()
    const af = atelierFilter()
    let r = all.filter(
      (row) =>
        (vf === 'all' || row.verdictKey === vf) &&
        tf.has(row.type) &&
        (af.size === 0 || af.has(row.atelier)) &&
        inRangeOrLate(row.dateExpIso)
    )
    if (q) {
      const terms = q.split(/\s+/)
      r = r.filter((row) => terms.every((t) => row.filter.includes(t)))
    }
    return r
  })

  // Toujours "aujourd'hui" réel (verdicts/statuts calculés par rapport à maintenant, jamais
  // simulés — cf SuiviController).
  const refLabel = () =>
    TODAY.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

  // Jamais de ISO (aaaa-mm-jj) affiché à l'écran — toujours jj/mm/aaaa (règle projet).
  const fmtFrDate = (iso: string) => {
    const d = parseIso(iso)
    return d ? d.toLocaleDateString('fr-FR') : iso
  }
  const rangeLabel = () => {
    const { start, end } = dateRange()
    if (!start || !end) return '—'
    return `${fmtFrDate(toIso(start))} → ${fmtFrDate(toIso(end))}`
  }

  // Sélecteur de plage — filtre client (dateRange), pas de re-fetch ni de navigation.
  const [dateOpen, setDateOpen] = createSignal(false)
  const applyRange = (r: DateRange) => {
    setDateRange(r)
    if (r.start && r.end) setDateOpen(false)
  }

  const selectedRowKey = createMemo(() => {
    const sel = selectedRow()
    if (!sel) return null
    return `${sel.row.numCommande}::${sel.row.article}`
  })

  const statusChip = (k: SuiviStatusKey | 'all', label: string, count?: number) => {
    const on = statusFilter() === k
    return (
      <button
        type="button"
        class={`inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider transition-colors ${
          on ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setStatusFilter(on ? 'all' : k)}
      >
        {label}
        <Show when={count !== undefined && count! > 0}>
          <span class={`rounded-full px-1.5 py-px text-[8px] font-extrabold tabular-nums leading-none ${on ? 'bg-brand/15 text-brand' : 'bg-foreground/[0.06] text-muted-foreground'}`}>
            {count}
          </span>
        </Show>
      </button>
    )
  }

  const verdictChip = (k: ProactiveVerdictKey | 'all', label: string, count?: number) => {
    const on = verdictFilter() === k
    return (
      <button
        type="button"
        class={`inline-flex items-center gap-1 rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider transition-colors ${
          on ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setVerdictFilter(on ? 'all' : k)}
      >
        {label}
        <Show when={count !== undefined && count! > 0}>
          <span class={`rounded-full px-1.5 py-px text-[8px] font-extrabold tabular-nums leading-none ${on ? 'bg-brand/15 text-brand' : 'bg-foreground/[0.06] text-muted-foreground'}`}>
            {count}
          </span>
        </Show>
      </button>
    )
  }

  // Filtered count helpers
  const isFiltered = createMemo(() => {
    if (query().trim()) return true
    if (mode() === 'reactif' && statusFilter() !== 'all') return true
    if (mode() === 'proactif' && verdictFilter() !== 'all') return true
    if (!typeFilter().has('MTS') || !typeFilter().has('MTO')) return true
    if (atelierFilter().size > 0) return true
    return false
  })
  const filteredCount = createMemo(() => mode() === 'reactif' ? reactiveFilteredRows().length : proFilteredRows().length)
  const totalCount = createMemo(() => mode() === 'reactif' ? view().total : proView().total)

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Suivi · Allocation & expédition"
        active="tracking"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold capitalize not-italic text-brand">
              {refLabel()}
            </div>
            <div>
              <b class="font-bold text-foreground">
                {mode() === 'reactif' ? view().total : proView().total}
              </b>{' '}
              lignes ouvertes
            </div>
          </>
        }
        actions={
          <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
            <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
            <input
              class="w-[200px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
              placeholder="Commande, article, client…"
              type="text"
              autocomplete="off"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
        }
      />

      {/* ═══ Toolbar ═══ */}
      {/*
        overflow-x-auto est isolé aux CHIPS (sous-div ci-dessous), pas à toute la rangée :
        overflow-x non-visible force overflow-y à 'auto' aussi (quirk CSS) — sur toute la
        rangée, ça coupait net le popover du sélecteur de date (absolute top-full) posé dans
        le groupe actions à droite, qui débordait verticalement de la rangée scrollable.
      */}
      <div class="flex flex-none items-center gap-2.5 border-b border-rule px-7 py-2 select-none">
        <div class="flex min-w-0 flex-1 items-center gap-2.5 overflow-x-auto no-scrollbar">
        {/* Bascule Réactif / Proactif */}
        <div class="inline-flex shrink-0 items-center rounded-md border border-rule bg-card p-0.5">
          <button
            type="button"
            class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider transition-colors ${
              mode() === 'reactif'
                ? 'bg-brand-soft text-brand'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('reactif')}
            title="Suivi as-is : statuts allocation/expédition + causes de retard"
          >
            Réactif
          </button>
          <button
            type="button"
            class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider transition-colors ${
              mode() === 'proactif'
                ? 'bg-brand-soft text-brand'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('proactif')}
            title="Réalisabilité projetée : consommation séquentielle des composants entre OFs"
          >
            Proactif
          </button>
        </div>
        <Show when={mode() === 'reactif'}>
          <div class="inline-flex shrink-0 items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
              Statut
            </span>
            {statusChip('all', 'Tous', view().total)}
            {statusChip('ret', 'Retard', view().statusCounts.RETARD_PROD)}
            {statusChip('alc', 'À allouer', view().statusCounts.ALLOCATION_A_FAIRE)}
            {statusChip('exp', 'À expédier', view().statusCounts.A_EXPEDIER)}
          </div>
        </Show>
        <Show when={mode() === 'proactif'}>
          <div class="inline-flex shrink-0 items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
              Verdict
            </span>
            {verdictChip('all', 'Tous', proView().total)}
            {verdictChip('blocked', 'Bloquée', proView().verdictCounts.blocked)}
            {verdictChip('uncov', 'Sans couverture', proView().verdictCounts.uncov)}
            {verdictChip('late', 'Retard', proView().verdictCounts.late)}
            {verdictChip('risk', 'À risque', proView().verdictCounts.risk)}
          </div>
        </Show>
        <div class="inline-flex shrink-0 items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
            Type
          </span>
          <For each={['MTS', 'MTO', 'NOR']}>
            {(t) => (
              <button
                type="button"
                class={`rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold tracking-wider transition-colors ${
                  typeFilter().has(t)
                    ? 'bg-brand-soft text-brand'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => toggleType(t)}
              >
                {t}
              </button>
            )}
          </For>
        </div>
        {/* Filtre atelier (#36) — chips STOLOC, apparaît dès qu'un atelier est connu. Transverse aux 2 vues. */}
        <Show when={ateliers().length > 0}>
          <div class="inline-flex shrink-0 flex-nowrap items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
              Atelier
            </span>
            <For each={ateliers()}>
              {(a) => (
                <button
                  type="button"
                  class={`rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold tracking-wider transition-colors ${
                    atelierFilter().has(a.code)
                      ? 'bg-brand-soft text-brand'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => toggleAtelier(a.code)}
                  title={a.label}
                >
                  {a.label.replace(/^ATELIER\s+/i, '')}
                </button>
              )}
            </For>
            <Show when={atelierFilter().size > 0}>
              <button
                type="button"
                class="rounded-[5px] px-1.5 py-1 font-mono text-[10px] font-bold tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setAtelierFilter(new Set())}
                title="Réinitialiser le filtre atelier"
              >
                ✕
              </button>
            </Show>
          </div>
        </Show>
        </div>
        <div class="ml-auto shrink-0 flex items-center gap-2">
          {/* Compteur filtré */}
          <Show when={isFiltered()}>
            <span class="font-mono text-[11px] font-bold tabular-nums text-brand">
              {filteredCount()} <span class="text-muted-foreground font-medium">/ {totalCount()}</span>
            </span>
          </Show>
          {/* Durée de chargement X3 */}
          <Show when={mode() === 'reactif' ? data.loading : proData.loading}>
            <span class="font-mono text-[11px] tabular-nums text-muted-foreground">
              {fmtMs(mode() === 'reactif' ? elapsed() : proElapsed())}
            </span>
          </Show>
          <Show
            when={
              mode() === 'reactif'
                ? !data.loading && rowsMs() !== null
                : !proData.loading && proMs() !== null
            }
          >
            <span
              class="font-mono text-[11px] tabular-nums text-muted-foreground/60"
              title="Durée dernier chargement X3"
            >
              {fmtMs((mode() === 'reactif' ? rowsMs() : proMs())!)}
            </span>
          </Show>
          <button
            type="button"
            onClick={() => setBust((b) => b + 1)}
            disabled={mode() === 'reactif' ? data.loading : proData.loading}
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-brand disabled:opacity-50"
            title="Recharger les données X3 (cache → re-fetch live)"
          >
            <span
              class="material-symbols-outlined text-[14px] text-muted-foreground"
              classList={{ 'animate-spin': mode() === 'reactif' ? data.loading : proData.loading }}
            >
              refresh
            </span>
            Actualiser
          </button>
          <div class="relative">
            <button
              type="button"
              onClick={() => setDateOpen((o) => !o)}
              class={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors hover:border-brand ${
                dateOpen() ? 'border-brand bg-brand-soft/20 text-brand' : 'border-rule bg-card'
              }`}
              title="Filtrer par plage de dates d'expédition (les lignes en retard restent toujours visibles)"
            >
              <span class="material-symbols-outlined text-[14px] text-muted-foreground">
                calendar_month
              </span>
              {rangeLabel()}
              <span class="material-symbols-outlined text-[16px] text-muted-foreground">
                expand_more
              </span>
            </button>
            <Show when={dateOpen()}>
              <button
                type="button"
                tabIndex={-1}
                class="fixed inset-0 z-40 cursor-default"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setDateOpen(false)}
              />
              <div class="absolute right-0 top-full z-50 mt-2">
                <Calendar mode="range" range={dateRange()} onRangeChange={applyRange} />
              </div>
            </Show>
          </div>
        </div>
      </div>

      <Show
        when={mode() === 'reactif'}
        fallback={
          <ProactiveView
            view={proView}
            filteredRows={proFilteredRows}
            loading={() => proData.loading}
            error={() => !!proData.error}
            onResetFilters={() => {
              setQuery('')
              setStatusFilter('all')
              setVerdictFilter('all')
              setTypeFilter(new Set(['MTS', 'MTO']))
              setAtelierFilter(new Set())
            }}
            onRowClick={(row) => setSelectedRow({ type: 'proactif', row })}
            selectedRowKey={selectedRowKey}
          />
        }
      >
        <ReactiveView
          view={view}
          filteredRows={reactiveFilteredRows}
          loading={() => data.loading}
          error={() => !!data.error}
          onResetFilters={() => {
            setQuery('')
            setStatusFilter('all')
            setVerdictFilter('all')
            setTypeFilter(new Set(['MTS', 'MTO']))
            setAtelierFilter(new Set())
          }}
          onRowClick={(row) => setSelectedRow({ type: 'reactif', row })}
          selectedRowKey={selectedRowKey}
        />
      </Show>

      {/* Drawer diagnostic de ligne */}
      <Sheet open={selectedRow() !== null} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <Show when={selectedRow()}>
          {(sel) => (
            <SheetContent class="sm:max-w-xl overflow-y-auto no-scrollbar">
              <SheetHeader>
                <SheetTitle>Diagnostic de la ligne</SheetTitle>
                <SheetDescription>
                  Détails opérationnels et goulets d'étranglement de la commande client.
                </SheetDescription>
              </SheetHeader>
              <SheetBody>
                <SuiviDetailSheet type={sel().type} row={sel().row} />
              </SheetBody>
            </SheetContent>
          )}
        </Show>
      </Sheet>
    </div>
  )
}

export default Tracking
