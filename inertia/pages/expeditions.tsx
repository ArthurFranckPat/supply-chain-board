import { createEffect, createMemo, createResource, createSignal, onCleanup, Show, type Component } from 'solid-js'
import { cx } from '@/libs/cva'
import { DataTable, type ColumnDef, type SortingState } from '@/components/ui/data-table'
import { Masthead } from '@/components/masthead'
import { Calendar, type DateRange } from '@/components/ui/calendar'

/**
 * Page « Expéditions » (issue #44) — onglet dédié à la gestion des expéditions client
 * (livraisons STOJOU TRSTYP_0=4). Remplace la carte dashboard initiale : un résumé ne
 * suffisait pas à l'usage opérationnel (vérifier/filtrer les camions un par un, repérer
 * les regroupements suspects).
 *
 * Coquille Inertia instantanée ; le calcul lourd (X3 + clustering camion) est chargé en
 * différé via fetch JSON sur `rowsHref`. Même motif que /suivi (scheduler/tracking).
 */

interface CamionDtl {
  client: string
  bprnum: string
  debut: string
  fin: string
  qteUc: number
  nbPalettes: number
  nbContenants: number
  nbLignes: number
  anomalie: boolean
}
interface ExpeditionKpi {
  label: string
  totalUc: number
  nbCamions: number
  gapMinutes: number
  maxPalettesCamion: number
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
  expeditions: { label: '', totalUc: 0, nbCamions: 0, gapMinutes: defaultGapMinutes, maxPalettesCamion, camions: [] },
  x3Error: null,
})

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

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

  const view = createMemo(() => data() ?? empty)
  const exp = createMemo(() => view().expeditions)
  const x3Error = createMemo(() => view().x3Error)

  const totalPalettes = createMemo(() => exp().camions.reduce((s, c) => s + c.nbPalettes, 0))
  const avgPalettes = createMemo(() => {
    const n = exp().nbCamions
    return n > 0 ? Math.round((totalPalettes() / n) * 10) / 10 : 0
  })
  const nbAnomalies = createMemo(() => exp().camions.filter((c) => c.anomalie).length)

  const [sorting, setSorting] = createSignal<SortingState[]>([{ id: 'debut', desc: false }])

  const filteredRows = createMemo(() => {
    const q = fold(query())
    let rows = exp().camions
    if (q) rows = rows.filter((c) => fold(c.client).includes(q) || fold(c.bprnum).includes(q))
    if (anomalyOnly()) rows = rows.filter((c) => c.anomalie)
    const s = sorting()[0]
    if (!s) return rows
    const sorted = [...rows]
    sorted.sort((a, b) => {
      let va: string | number
      let vb: string | number
      switch (s.id) {
        case 'client': va = a.client; vb = b.client; break
        case 'debut': va = a.debut; vb = b.debut; break
        case 'nbPalettes': va = a.nbPalettes; vb = b.nbPalettes; break
        case 'nbContenants': va = a.nbContenants; vb = b.nbContenants; break
        case 'qteUc': va = a.qteUc; vb = b.qteUc; break
        case 'nbLignes': va = a.nbLignes; vb = b.nbLignes; break
        default: return 0
      }
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return s.desc ? -cmp : cmp
    })
    return sorted
  })

  const columns: ColumnDef<CamionDtl>[] = [
    {
      id: 'client',
      header: () => 'Client',
      accessorKey: 'client',
      cell: (info: { row: { original: CamionDtl } }) => {
        const c = info.row.original
        return (
          <>
            <div class="font-sans text-[12.5px] font-semibold text-foreground">{c.client || '—'}</div>
            <div class="font-mono text-[10px] text-muted-foreground">{c.bprnum}</div>
          </>
        )
      },
      meta: {
        thClass: 'w-[220px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft',
        tdClass: 'px-4 py-[13px] align-middle border-r border-rule-soft',
      },
    },
    {
      id: 'debut',
      header: () => 'Créneau',
      accessorKey: 'debut',
      cell: (info: { row: { original: CamionDtl } }) => {
        const c = info.row.original
        return (
          <span class="font-mono text-[12px] font-semibold text-foreground">
            {c.debut}{c.fin !== c.debut ? ` → ${c.fin}` : ''}
          </span>
        )
      },
      meta: {
        thClass: 'w-[130px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft',
        tdClass: 'whitespace-nowrap px-4 py-[13px] align-middle border-r border-rule-soft',
      },
    },
    {
      id: 'nbPalettes',
      header: () => 'Palettes',
      accessorKey: 'nbPalettes',
      cell: (info: { row: { original: CamionDtl } }) => {
        const c = info.row.original
        return (
          <span
            class={cx(
              'inline-flex items-center gap-1 font-mono text-[13px] font-bold tabular-nums',
              c.anomalie ? 'text-destructive' : 'text-foreground',
            )}
            title={c.anomalie ? `Anomalie : au-delà de ${exp().maxPalettesCamion} palettes plausibles pour un camion — tolérance de regroupement probablement trop large` : undefined}
          >
            {c.nbPalettes}
            <Show when={c.anomalie}>
              <span class="material-symbols-outlined text-[14px] leading-none">warning</span>
            </Show>
          </span>
        )
      },
      meta: {
        thClass: 'w-[90px] px-4 py-[11px] text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft',
        tdClass: 'whitespace-nowrap px-4 py-[13px] text-right align-middle border-r border-rule-soft',
      },
    },
    {
      id: 'nbContenants',
      header: () => 'Contenants',
      accessorKey: 'nbContenants',
      meta: {
        thClass: 'w-[90px] px-4 py-[11px] text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft',
        tdClass: 'whitespace-nowrap px-4 py-[13px] text-right align-middle font-mono text-[12px] tabular-nums text-muted-foreground border-r border-rule-soft',
      },
    },
    {
      id: 'qteUc',
      header: () => 'UC',
      accessorKey: 'qteUc',
      meta: {
        thClass: 'w-[90px] px-4 py-[11px] text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft',
        tdClass: 'whitespace-nowrap px-4 py-[13px] text-right align-middle font-mono text-[13px] font-bold tabular-nums text-foreground border-r border-rule-soft',
      },
    },
    {
      id: 'nbLignes',
      header: () => 'Lignes',
      accessorKey: 'nbLignes',
      meta: {
        thClass: 'w-[80px] px-4 py-[11px] text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule',
        tdClass: 'whitespace-nowrap px-4 py-[13px] text-right align-middle font-mono text-[12px] tabular-nums text-muted-foreground/80',
      },
    },
  ]

  const indexCol = {
    headerLabel: 'N°',
    thClass: 'w-[38px] px-4 py-[11px] text-left font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft',
    tdClass: (row: CamionDtl) =>
      cx(
        'px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80 border-r border-rule-soft',
        row.anomalie && '[box-shadow:inset_3px_0_var(--color-destructive)]',
      ),
  }

  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground">
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

      {/* ═══ Bandeau KPI ═══ */}
      <section class="flex-none grid grid-cols-5 border-b border-rule">
        <Kpi label="UC expédiées" value={exp().totalUc} sub="somme absolue" dot="var(--color-ferme)" valClass="text-ferme" />
        <Kpi label="Camions" value={exp().nbCamions} sub={`regroupement ± ${exp().gapMinutes} min`} dot="var(--color-terra)" valClass="text-terra" />
        <Kpi label="Palettes" value={totalPalettes()} sub="toutes expéditions" dot="var(--color-planifie)" valClass="text-planifie" />
        <Kpi label="Moy. palettes/camion" value={avgPalettes()} sub={`plausible ≤ ${exp().maxPalettesCamion}`} dot="var(--color-suggere)" valClass="text-suggere" />
        <Kpi
          label="Anomalies"
          value={nbAnomalies()}
          sub="camions suspects (> max)"
          dot="var(--color-destructive)"
          valClass="text-destructive"
          last
        />
      </section>

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
            'rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
            anomalyOnly() ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-rule bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          Anomalies seules
        </button>

        {/* Recherche client */}
        <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25">
          <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
          <input
            class="w-[180px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
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

      {/* ═══ X3 injoignable ═══ */}
      <Show when={x3Error()}>
        <div class="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-destructive">warning</span>
          <span class="font-bold">Erreur chargement expéditions :</span>
          <span class="font-mono">{x3Error()}</span>
        </div>
      </Show>

      {/* ═══ Table ═══ */}
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
          <div class="flex-1 overflow-hidden p-5">
            <DataTable
              columns={columns}
              rows={filteredRows}
              sorting={sorting}
              onSortingChange={setSorting}
              indexColumn={indexCol}
              getRowClass={(row) => cx('border-t border-rule-soft transition-colors', row.anomalie ? 'bg-destructive/10 hover:bg-destructive/[0.18]' : 'hover:bg-foreground/[0.04]')}
              tableClass="min-w-[900px] table-fixed"
              scrollContainerClass="h-full border-0 rounded-none shadow-none"
              theadRowClass="sticky top-0 z-10 bg-secondary"
              emptyState={
                <div class="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
                  <div class="flex flex-col items-center gap-2">
                    <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">
                      {x3Error() ? 'cloud_off' : 'local_shipping'}
                    </span>
                    {x3Error() ? 'Données indisponibles (X3 injoignable).' : 'Aucune expédition sur la période.'}
                  </div>
                </div>
              }
            />
          </div>
        </Show>
      </Show>
    </div>
  )
}

/** Tuile KPI (bandeau supérieur). */
const Kpi: Component<{
  label: string
  value: number
  sub: string
  dot: string
  valClass: string
  last?: boolean
}> = (p) => (
  <div class={cx('flex flex-col gap-[3px] px-[22px] py-[13px]', !p.last && 'border-r border-rule-soft')}>
    <span class="flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
      <span class="size-2 rounded-[2px]" style={{ background: p.dot }} />
      {p.label}
    </span>
    <span class={cx('font-fraunces text-[34px] font-black leading-none tracking-tight', p.valClass)}>{p.value}</span>
    <span class="font-mono text-[11px] font-medium text-muted-foreground">{p.sub}</span>
  </div>
)

export default Expeditions
