import { createEffect, createMemo, createResource, createSignal, onCleanup, Show, type Component } from 'solid-js'
import { cx } from '@/libs/cva'
import { Masthead } from '@/components/masthead'
import { Calendar, type DateRange } from '@/components/ui/calendar'
import { CamionDetailSheet, type CamionDtl } from '@/components/expeditions/camion-detail-sheet'
import { ManifesteView, type ManifesteSort } from '@/components/expeditions/manifeste-view'
import { FriseView } from '@/components/expeditions/frise-view'

/**
 * Page « Expéditions » (issue #44) — onglet dédié à la gestion des expéditions client
 * (livraisons STOJOU TRSTYP_0=4).
 *
 * Deux vues commutables au lieu d'un tableau unique :
 *  - **Manifeste** : cartes camion, la charge visualisée comme une grille de palettes.
 *  - **Frise**     : timeline (Gantt), barres positionnées sur l'axe temps + densité quai.
 *
 * Coquille Inertia instantanée ; le calcul lourd (X3 + clustering camion) est chargé en
 * différé via fetch JSON sur `rowsHref`. Même motif que /suivi (scheduler/tracking).
 */

type ViewMode = 'manifeste' | 'frise'

interface ExpeditionKpi {
  label: string
  totalUc: number
  nbCamions: number
  gapMinutes: number
  maxPalettesCamion: number
  camionCapacitePalettes: number
  camions: CamionDtl[]
}
interface ExpeditionsRowsResponse {
  expeditions: ExpeditionKpi
  x3Error: string | null
}
interface ExpeditionsPageProps {
  referenceDate: string
  rowsHref: string
  defaultGapMinutes: number
  maxPalettesCamion: number
}

const EMPTY = (defaultGapMinutes: number, maxPalettesCamion: number): ExpeditionsRowsResponse => ({
  expeditions: { label: '', totalUc: 0, nbCamions: 0, gapMinutes: defaultGapMinutes, maxPalettesCamion, camionCapacitePalettes: 33, camions: [] },
  x3Error: null,
})

const fold = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Tiebreaker primaire : les navettes (source de vérité) précèdent toujours les
 *  clusters heuristiques, quel que soit le tri choisi (issue #44 affinage). */
const srcRank = (c: CamionDtl) => (c.source === 'navette' ? 0 : 1)

/** Tri applicable à la vue manifeste (la frise reste triée par heure). */
function sortRows(rows: CamionDtl[], sort: ManifesteSort): CamionDtl[] {
  const out = [...rows]
  if (sort === 'time') {
    out.sort((a, b) => srcRank(a) - srcRank(b) || a.debut.localeCompare(b.debut))
  } else if (sort === 'load') {
    out.sort((a, b) => srcRank(a) - srcRank(b) || b.nbPalettes - a.nbPalettes)
  } else {
    out.sort((a, b) => srcRank(a) - srcRank(b) || a.client.localeCompare(b.client))
  }
  return out
}

const Expeditions: Component<ExpeditionsPageProps> = (props) => {
  const empty = EMPTY(props.defaultGapMinutes, props.maxPalettesCamion)

  const [range, setRange] = createSignal<DateRange | null>(null)
  const [calendarOpen, setCalendarOpen] = createSignal(false)
  const [gapMin, setGapMin] = createSignal<number | null>(null)
  const [query, setQuery] = createSignal('')
  const [anomalyOnly, setAnomalyOnly] = createSignal(false)
  const [bust, setBust] = createSignal(0)
  const [loadMs, setLoadMs] = createSignal<number | null>(null)
  const [elapsed, setElapsed] = createSignal(0)

  // ── Toggle vue + tri manifeste ───────────────────────────────────
  const [view, setView] = createSignal<ViewMode>('manifeste')
  const [mSort, setMSort] = createSignal<ManifesteSort>('time')

  const fmtDay = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

  const rangeLabel = createMemo(() => {
    const r = range()
    if (!r?.start) return null
    if (!r.end || r.start.toDateString() === r.end.toDateString()) return fmtDay(r.start)
    return `${fmtDay(r.start)} → ${fmtDay(r.end)}`
  })

  const url = createMemo(() => {
    let u = props.rowsHref
    const r = range()
    if (r?.start) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      u += `&expFrom=${fmt(r.start)}&expTo=${fmt(r.end ?? r.start)}`
    }
    const gap = gapMin()
    if (gap !== null) u += `&expGapMin=${gap}`
    if (bust()) u += `&refresh=${bust()}`
    return u
  })

  const [data] = createResource(
    url,
    async (u): Promise<ExpeditionsRowsResponse> => {
      const start = Date.now()
      const res = await fetch(u, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as ExpeditionsRowsResponse
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

  const viewData = createMemo(() => data() ?? empty)
  const exp = createMemo(() => viewData().expeditions)
  const x3Error = createMemo(() => viewData().x3Error)

  const totalPalettes = createMemo(() => exp().camions.reduce((s, c) => s + c.nbPalettes, 0))
  const avgPalettes = createMemo(() => {
    const n = exp().nbCamions
    return n > 0 ? Math.round((totalPalettes() / n) * 10) / 10 : 0
  })
  const nbAnomalies = createMemo(() => exp().camions.filter((c) => c.anomalie).length)

  // Volumes théoriques (issue #44 affinage) — agrégats depuis palTheo calculé.
  const camionsAvecPalTheo = createMemo(() => exp().camions.filter((c) => c.palTheo >= 0))
  const totalPalTheo = createMemo(() => camionsAvecPalTheo().reduce((s, c) => s + c.palTheo, 0))
  const avgRemplissage = createMemo(() => {
    const n = camionsAvecPalTheo().length
    return n > 0 ? camionsAvecPalTheo().reduce((s, c) => s + c.tauxRemplissage, 0) / n : -1
  })

  const [selectedCamion, setSelectedCamion] = createSignal<CamionDtl | null>(null)
  const [detailOpen, setDetailOpen] = createSignal(false)

  // Filtrage commun aux deux vues (recherche + anomalies).
  const baseRows = createMemo(() => {
    const q = fold(query())
    let rows = exp().camions
    if (q) rows = rows.filter((c) => fold(c.client).includes(q) || fold(c.bprnum).includes(q))
    if (anomalyOnly()) rows = rows.filter((c) => c.anomalie)
    return rows
  })
  // La frise est toujours triée par heure ; le manifeste suit le tri choisi.
  const manifesteRows = createMemo(() => sortRows(baseRows(), mSort()))
  const friseRows = createMemo(() => sortRows(baseRows(), 'time'))

  const openCamion = (c: CamionDtl) => {
    setSelectedCamion({ ...c, maxPalettesCamion: exp().maxPalettesCamion })
    setDetailOpen(true)
  }

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Expéditions · Livraisons client"
        active="expeditions"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold capitalize not-italic text-terra">{exp().label || '—'}</div>
            <div>
              <b class="font-bold text-foreground">{exp().nbCamions}</b> camion{exp().nbCamions > 1 ? 's' : ''}
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
              <span>{rangeLabel() ?? 'J-1'}</span>
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
                max={new Date()}
              />
            </div>
          </Show>
        </div>

        {/* Tolérance de regroupement camion (issue #44) */}
        <div class="flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Regroupement</span>
          <button
            type="button"
            onClick={() => setGapMin((v) => Math.max(0, (v ?? exp().gapMinutes ?? props.defaultGapMinutes) - 1))}
            class="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Diminuer la tolérance"
            aria-label="Diminuer la tolérance"
          >
            <span class="material-symbols-outlined text-[13px]">remove</span>
          </button>
          <span class="min-w-[48px] text-center font-mono text-[10px] font-bold tabular-nums text-foreground">
            ± {gapMin() ?? exp().gapMinutes ?? props.defaultGapMinutes} min
          </span>
          <button
            type="button"
            onClick={() => setGapMin((v) => (v ?? exp().gapMinutes ?? props.defaultGapMinutes) + 1)}
            class="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Augmenter la tolérance"
            aria-label="Augmenter la tolérance"
          >
            <span class="material-symbols-outlined text-[13px]">add</span>
          </button>
        </div>

        {/* Filtre anomalies */}
        <button
          type="button"
          onClick={() => setAnomalyOnly((v) => !v)}
          class={cx(
            'flex items-center gap-1 rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
            anomalyOnly() ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-rule bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <span class="material-symbols-outlined text-[13px]">warning</span>
          Anomalies seules
        </button>

        {/* Recherche client */}
        <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25">
          <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
          <input
            class="w-[160px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
            placeholder="Client…"
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
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-terra disabled:opacity-50"
            title="Recharger les données X3"
          >
            <span class="material-symbols-outlined text-[14px] text-muted-foreground" classList={{ 'animate-spin': data.loading }}>refresh</span>
            Actualiser
          </button>
        </div>
      </div>

      {/* ═══ Toggle vue + tri manifeste ═══ */}
      <div class="flex flex-none items-center gap-2.5 border-b border-rule-soft px-7 py-1.5">
        <div class="flex items-center overflow-hidden rounded-md border border-rule bg-card">
          <ViewTab active={view() === 'manifeste'} onClick={() => setView('manifeste')} icon="grid_view" label="Manifestes" />
          <ViewTab active={view() === 'frise'} onClick={() => setView('frise')} icon="timeline" label="Frise de charge" />
        </div>

        {/* Tri segmenté — propre au manifeste */}
        <Show when={view() === 'manifeste'}>
          <div class="flex items-center overflow-hidden rounded-md border border-rule bg-card">
            <SegTab active={mSort() === 'time'} onClick={() => setMSort('time')} label="Par heure" />
            <SegTab active={mSort() === 'load'} onClick={() => setMSort('load')} label="Par charge" />
            <SegTab active={mSort() === 'client'} onClick={() => setMSort('client')} label="Par client" />
          </div>
        </Show>

        {/* Légende (frise) — paliers de taux de remplissage (capacité {camionCapacitePalettes} pal. éq.) */}
        <Show when={view() === 'frise'}>
          <div class="flex flex-wrap items-center gap-4 font-mono text-[10px] text-muted-foreground">
            <Legend sw="bg-ferme" label="Léger (&lt;45%)" />
            <Legend sw="bg-planifie" label="Normal (45–90%)" />
            <Legend sw="bg-suggere" label="Proche du max (90–100%)" />
            <Legend sw="bg-destructive" label="Débord (&gt;100%)" />
          </div>
        </Show>

        <span class="ml-auto font-mono text-[11px] text-muted-foreground">
          {baseRows().length} camion{baseRows().length > 1 ? 's' : ''}
        </span>
      </div>

      {/* ═══ X3 injoignable ═══ */}
      <Show when={x3Error()}>
        <div class="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-destructive">warning</span>
          <span class="font-bold">Erreur chargement expéditions :</span>
          <span class="font-mono">{x3Error()}</span>
        </div>
      </Show>

      {/* ═══ Vue ═══ */}
      <Show
        when={!data.loading}
        fallback={
          <div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
            <span class="text-[13px] font-medium">Calcul des expéditions…</span>
          </div>
        }
      >
        <Show
          when={!data.error}
          fallback={
            <div class="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
              <span class="material-symbols-outlined text-[20px]">error</span>
              Échec du calcul des expéditions.
            </div>
          }
        >
          <Show
            when={baseRows().length > 0 || x3Error()}
            fallback={
              <div class="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
                <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">
                  {x3Error() ? 'cloud_off' : 'local_shipping'}
                </span>
                <span class="font-fraunces text-[14px] italic text-muted-foreground">
                  {x3Error() ? 'Données indisponibles (X3 injoignable).' : 'Aucune expédition sur la période.'}
                </span>
              </div>
            }
          >
            <Show
              when={view() === 'manifeste'}
              fallback={
                <FriseView
                  rows={friseRows()}
                  maxPalettesCamion={exp().maxPalettesCamion}
                  camionCapacitePalettes={exp().camionCapacitePalettes}
                  selectedCamion={selectedCamion()}
                  onSelect={openCamion}
                />
              }
            >
              <ManifesteView
                rows={manifesteRows()}
                maxPalettesCamion={exp().maxPalettesCamion}
                camionCapacitePalettes={exp().camionCapacitePalettes}
                selectedCamion={selectedCamion()}
                onSelect={openCamion}
              />
            </Show>
          </Show>
        </Show>
      </Show>

      <CamionDetailSheet camion={selectedCamion()} open={detailOpen()} onOpenChange={setDetailOpen} />
    </div>
  )
}

/** Onglet de bascule de vue (manifeste / frise). */
const ViewTab: Component<{ active: boolean; onClick: () => void; icon: string; label: string }> = (p) => (
  <button
    type="button"
    onClick={p.onClick}
    class={cx(
      'flex items-center gap-1.5 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
      p.active ? 'bg-terra/10 text-terra' : 'text-muted-foreground hover:text-foreground',
    )}
  >
    <span class="material-symbols-outlined text-[14px]">{p.icon}</span>
    {p.label}
  </button>
)

/** Onglet segmenté (tri manifeste). */
const SegTab: Component<{ active: boolean; onClick: () => void; label: string }> = (p) => (
  <button
    type="button"
    onClick={p.onClick}
    class={cx(
      'border-r border-rule-soft px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors last:border-r-0',
      p.active ? 'bg-terra/10 text-terra' : 'text-muted-foreground hover:text-foreground',
    )}
  >
    {p.label}
  </button>
)

/** Pastille légende (frise). */
const Legend: Component<{ sw: string; label: string }> = (p) => (
  <span class="flex items-center gap-1.5">
    <span class={cx('h-[9px] w-5 rounded-[2px]', p.sw)} />
    {p.label}
  </span>
)

export default Expeditions
