import { createMemo, createResource, createSignal, onCleanup, Show, createEffect, type Component } from 'solid-js'
import { cx } from '@/libs/cva'
import { Masthead } from '@/components/masthead'
import { Calendar, type DateRange } from '@/components/ui/calendar'
import { ReceptionTableau, ReceptionCalendrier } from '@/components/receptions/reception-views'
import type { ReceptionsRowsResponse, ReceptionViewKind } from '@/lib/receptions/types'

/**
 * Page « Réceptions fournisseurs » : planning des réceptions attendues + charge palettes
 * par jour pour anticiper la charge du service réception.
 *
 * Deux vues commutables :
 *  - **Tableau**   : 1 ligne par réception attendue (date, fournisseur, article, qté, palettes).
 *  - **Calendrier**: charge agrégée par jour (histogramme palettes) + drill-down vers le tableau.
 *
 * Coquille Inertia instantanée ; le calcul lourd (X3 + palette + agrégation) est chargé
 * en différé via fetch JSON sur `rowsHref`. Même motif que /expeditions et /ruptures.
 */

const fold = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const EMPTY: ReceptionsRowsResponse = {
  rows: [],
  chargeByDay: [],
  stats: { totalPalettes: 0, totalLignes: 0, totalFournisseurs: 0, picPalettes: 0, picJour: null, lignesEstimees: 0, lignesSansCoef: 0 },
  range: { from: '', to: '', horizonDays: 0 },
  x3Error: null,
}

interface ReceptionsPageProps {
  from: string
  to: string
  horizon: number
  rowsHref: string
  todayHref: string
  defaultHorizon: number
}

const Receptions: Component<ReceptionsPageProps> = (props) => {
  const [view, setView] = createSignal<ReceptionViewKind>('tableau')
  const [range, setRange] = createSignal<DateRange | null>(null)
  const [calendarOpen, setCalendarOpen] = createSignal(false)
  const [query, setQuery] = createSignal('')
  const [selectedDay, setSelectedDay] = createSignal<string | null>(null)
  const [bust, setBust] = createSignal(0)
  const [loadMs, setLoadMs] = createSignal<number | null>(null)
  const [elapsed, setElapsed] = createSignal(0)

  const fmtDay = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

  const rangeLabel = createMemo(() => {
    const r = range()
    if (!r?.start) return `${fmtDay(new Date(props.from))} → ${fmtDay(new Date(props.to))}`
    if (!r.end || r.start.toDateString() === r.end.toDateString()) return fmtDay(r.start)
    return `${fmtDay(r.start)} → ${fmtDay(r.end)}`
  })

  const url = createMemo(() => {
    const u = new URL(props.rowsHref, window.location.origin)
    const r = range()
    if (r?.start) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      u.searchParams.set('from', fmt(r.start))
      u.searchParams.set('to', fmt(r.end ?? r.start))
    }
    if (bust()) u.searchParams.set('refresh', String(bust()))
    return `${u.pathname}?${u.searchParams.toString()}`
  })

  const [data] = createResource(
    url,
    async (u): Promise<ReceptionsRowsResponse> => {
      const start = Date.now()
      const res = await fetch(u, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ReceptionsRowsResponse
      setLoadMs(Date.now() - start)
      return json
    },
  )

  createEffect(() => {
    if (!data.loading) { setElapsed(0); return }
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Date.now() - t0), 200)
    onCleanup(() => clearInterval(id))
  })

  const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

  const viewData = createMemo(() => data() ?? EMPTY)
  const stats = createMemo(() => viewData().stats)
  const x3Error = createMemo(() => viewData().x3Error)
  const charge = createMemo(() => viewData().chargeByDay)

  // Filtrage par recherche + jour sélectionné (drill-down calendrier).
  const filteredRows = createMemo(() => {
    const q = fold(query())
    const day = selectedDay()
    let rows = viewData().rows
    if (day) rows = rows.filter((r) => r.date === day)
    if (q) {
      rows = rows.filter(
        (r) =>
          fold(r.fournisseurNom).includes(q) ||
          fold(r.fournisseur).includes(q) ||
          fold(r.article).includes(q) ||
          fold(r.designation).includes(q) ||
          fold(r.noCommande).includes(q),
      )
    }
    return rows
  })

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Réceptions · Commandes fournisseurs"
        active="receptions"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold capitalize not-italic text-brand">{rangeLabel()}</div>
            <div>
              <b class="font-bold text-foreground">{stats().totalPalettes}</b> palette{stats().totalPalettes > 1 ? 's' : ''}
              {' · '}
              <b class="font-bold text-foreground">{stats().totalLignes}</b> réception{stats().totalLignes > 1 ? 's' : ''}
            </div>
          </>
        }
      />

      {/* ═══ Toolbar ═══ */}
      <div class="flex flex-none flex-wrap items-center gap-2.5 border-b border-rule px-7 py-2">
        {/* Sélecteur de plage */}
        <div class="relative">
          <div class="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCalendarOpen((v) => !v)}
              class="flex items-center gap-1.5 rounded border border-rule bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:bg-secondary/60"
            >
              <span class="material-symbols-outlined text-[14px] text-muted-foreground">calendar_today</span>
              <span>{rangeLabel()}</span>
            </button>
            <Show when={range()?.start}>
              <button
                type="button"
                onClick={() => { setRange(null); setCalendarOpen(false) }}
                class="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                title="Réinitialiser"
              >
                <span class="material-symbols-outlined text-[14px]">close</span>
              </button>
            </Show>
          </div>
          <Show when={calendarOpen()}>
            <div class="fixed inset-0 z-10" onClick={() => setCalendarOpen(false)} />
            <div class="absolute left-0 top-full z-20 mt-1">
              <Calendar
                mode="range"
                range={range() ?? { start: null, end: null }}
                onRangeChange={(r) => {
                  setRange(r)
                  if (r.start && r.end) setCalendarOpen(false)
                }}
              />
            </div>
          </Show>
        </div>

        {/* Recherche */}
        <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
          <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
          <input
            class="w-[180px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
            placeholder="Fournisseur, article, commande…"
            type="text"
            autocomplete="off"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </div>

        <div class="ml-auto flex items-center gap-2">
          <Show when={data.loading}>
            <span class="font-mono text-[11px] tabular-nums text-muted-foreground">{fmtMs(elapsed())}</span>
          </Show>
          <Show when={!data.loading && loadMs() !== null}>
            <span class="font-mono text-[11px] tabular-nums text-muted-foreground/60" title="Durée dernier chargement X3">
              {fmtMs(loadMs()!)}
            </span>
          </Show>
          <button
            type="button"
            onClick={() => setBust((b) => b + 1)}
            disabled={data.loading}
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-brand disabled:opacity-50"
            title="Recharger les données X3"
          >
            <span class="material-symbols-outlined text-[14px] text-muted-foreground" classList={{ 'animate-spin': data.loading }}>refresh</span>
            Actualiser
          </button>
        </div>
      </div>

      {/* ═══ Toggle vue ═══ */}
      <div class="flex flex-none items-center gap-2.5 border-b border-rule-soft px-7 py-1.5">
        <div class="flex items-center overflow-hidden rounded-md border border-rule bg-card">
          <ViewTab active={view() === 'tableau'} onClick={() => setView('tableau')} icon="table_rows" label="Tableau" />
          <ViewTab active={view() === 'calendrier'} onClick={() => setView('calendrier')} icon="bar_chart" label="Charge par jour" />
        </div>

        {/* Filtre jour actif (drill-down) */}
        <Show when={selectedDay()}>
          <span class="flex items-center gap-1.5 rounded-md border border-brand/30 bg-brand/5 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brand">
            <span class="material-symbols-outlined text-[13px]">filter_alt</span>
            {charge().find((c) => c.day === selectedDay())?.dayFmt ?? selectedDay()}
            <button type="button" onClick={() => setSelectedDay(null)} class="hover:opacity-70">
              <span class="material-symbols-outlined text-[12px]">close</span>
            </button>
          </span>
        </Show>

        <div class="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          <Show when={stats().lignesEstimees > 0}>
            <span
              class="flex items-center gap-1 text-planifie"
              title="Lignes dont le coef palette a été estimé (stock actuel SM* ou historique STOJOU)"
            >
              <span class="material-symbols-outlined text-[13px]">insights</span>
              {stats().lignesEstimees} estimé{stats().lignesEstimees > 1 ? 's' : ''}
            </span>
          </Show>
          <Show when={stats().lignesSansCoef > 0}>
            <span class="flex items-center gap-1 text-destructive" title="Lignes sans coef palette ni estimation — charge réellement sous-estimée">
              <span class="material-symbols-outlined text-[13px]">warning</span>
              {stats().lignesSansCoef} coef manquant{stats().lignesSansCoef > 1 ? 's' : ''}
            </span>
          </Show>
          <span>{filteredRows().length} ligne{filteredRows().length > 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* ═══ X3 injoignable ═══ */}
      <Show when={x3Error()}>
        <div class="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-destructive">warning</span>
          <span class="font-bold">Erreur chargement réceptions :</span>
          <span class="font-mono">{x3Error()}</span>
        </div>
      </Show>

      {/* ═══ Vue ═══ */}
      <Show
        when={!data.loading}
        fallback={
          <div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
            <span class="text-[13px] font-medium">Calcul des réceptions…</span>
          </div>
        }
      >
        <Show
          when={!data.error}
          fallback={
            <div class="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
              <span class="material-symbols-outlined text-[20px]">error</span>
              Échec du calcul des réceptions.
            </div>
          }
        >
          <Show
            when={viewData().rows.length > 0 || x3Error()}
            fallback={
              <div class="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
                <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">
                  {x3Error() ? 'cloud_off' : 'inventory_2'}
                </span>
                <span class="font-fraunces text-[14px] italic text-muted-foreground">
                  {x3Error() ? 'Données indisponibles (X3 injoignable).' : 'Aucune réception planifiée sur la période.'}
                </span>
              </div>
            }
          >
            <Show
              when={view() === 'tableau'}
              fallback={
              <ReceptionCalendrier
                charge={charge}
                selectedDay={selectedDay}
                onSelectDay={(day) => {
                  setSelectedDay(day)
                  if (day) setView('tableau')
                }}
              />
              }
            >
              <ReceptionTableau
                rows={filteredRows}
                emptyState={
                  <div class="flex flex-col items-center justify-center gap-2 p-10 text-center">
                    <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">inbox</span>
                    <span class="font-fraunces text-[14px] italic text-muted-foreground">
                      {selectedDay() ? 'Aucune réception ce jour.' : 'Aucune réception sur la période.'}
                    </span>
                  </div>
                }
              />
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  )
}

/** Onglet de bascule de vue (tableau / calendrier). */
const ViewTab: Component<{ active: boolean; onClick: () => void; icon: string; label: string }> = (p) => (
  <button
    type="button"
    onClick={p.onClick}
    class={cx(
      'flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
      p.active ? 'bg-brand/10 text-brand' : 'text-muted-foreground hover:text-foreground',
    )}
  >
    <span class="material-symbols-outlined text-[14px]">{p.icon}</span>
    {p.label}
  </button>
)

export default Receptions
