import { createResource, createMemo, createSignal, For, Show, type Component } from 'solid-js'
import { Masthead } from '@/components/masthead'
import { Calendar, type DateRange } from '@/components/ui/calendar'

/**
 * Tableau de bord (issue #26 shell + #38 KPI). Landing par défaut post-login.
 *
 * Coquille rendue instantanément ; les KPI « charge en retard » + liste des lignes
 * en retard (calcul lourd : statuts + charge gamme depuis X3) sont chargés en différé
 * par fetch JSON sur `kpisHref`. Même motif que /suivi (scheduler/tracking).
 */

interface RetardLigne {
  numCommande: string
  client: string
  article: string
  designation: string
  type: string
  dateExp: string
  dateExpIso: string | null
  qteRestante: number
  heures: number
  postes: string[]
}
interface RetardChargeKpi {
  totalHeures: number
  nbLignes: number
  postes: { code: string; label: string; heures: number }[]
  lignes: RetardLigne[]
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
interface DashboardProps {
  referenceDate: string
  kpisHref: string
  otdHref: string
}

const EMPTY_KPIS: DashboardKpisResponse = {
  retardCharge: { totalHeures: 0, nbLignes: 0, postes: [], lignes: [] },
  x3Error: null,
  referenceDate: '',
}
const EMPTY_OTD: DashboardOtdResponse = { otd: [], x3Error: null }

/** Palette des barres par rang de poste (du plus chargé au moins chargé). */
const BAR_PALETTE = ['#b23b2e', '#cf6a3f', '#b8862c', '#cdb079', '#a8a18c']

/** Normalise une chaîne pour la recherche : sans accents ni casse. */
const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** En-tête de card lisible : pastille d'accent + titre Fraunces + suffixe mono optionnel. */
const CardHeader: Component<{ title: string; suffix?: string; tone?: string }> = (p) => (
  <div class="mb-4 flex items-center gap-2.5 border-b border-rule-soft pb-3">
    <span class="size-2 shrink-0 rounded-full" style={{ background: p.tone ?? 'var(--color-destructive, #b23b2e)' }}></span>
    <h2 class="font-fraunces text-[16px] font-semibold leading-none tracking-tight text-foreground">{p.title}</h2>
    <Show when={p.suffix}>
      <span class="ml-auto font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{p.suffix}</span>
    </Show>
  </div>
)

const Dashboard: Component<DashboardProps> = (props) => {
  const [otdMode, setOtdMode] = createSignal<OtdMode>('demandee')
  const [otdRange, setOtdRange] = createSignal<DateRange | null>(null)
  const [calendarOpen, setCalendarOpen] = createSignal(false)
  const [clientFilter, setClientFilter] = createSignal('')
  const [detailsOpen, setDetailsOpen] = createSignal(true)

  const otdUrl = createMemo(() => {
    let url = `${props.otdHref}&otdMode=${otdMode()}`
    const r = otdRange()
    if (r?.start) {
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      url += `&otdFrom=${fmt(r.start)}&otdTo=${fmt(r.end ?? r.start)}`
    }
    return url
  })

  const fmtDay = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`

  const otdRangeLabel = createMemo(() => {
    const r = otdRange()
    if (!r?.start) return null
    if (!r.end || r.start.toDateString() === r.end.toDateString()) return fmtDay(r.start)
    return `${fmtDay(r.start)} → ${fmtDay(r.end)}`
  })

  const [kpisData] = createResource(
    () => props.kpisHref,
    async (url): Promise<DashboardKpisResponse> => {
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as DashboardKpisResponse
    },
  )

  const [otdData] = createResource(
    otdUrl,
    async (url): Promise<DashboardOtdResponse> => {
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as DashboardOtdResponse
    },
  )

  const kpi = createMemo(() => (kpisData() ?? EMPTY_KPIS).retardCharge)
  const otd = createMemo(() => (otdData() ?? EMPTY_OTD).otd)
  const normClient = createMemo(() => fold(clientFilter()))
  /** Périodes OTD avec `lignesNon` restreintes au filtre client (KPI période inchangés). */
  const otdFiltered = createMemo(() => {
    const q = normClient()
    const base = otd()
    if (!q) return base
    return base.map((p) => ({ ...p, lignesNon: p.lignesNon.filter((l) => fold(l.client).includes(q)) }))
  })
  const nbLignesFiltrees = createMemo(() => otdFiltered().reduce((n, p) => n + p.lignesNon.length, 0))
  const nbLignesTotal = createMemo(() => otd().reduce((n, p) => n + p.lignesNon.length, 0))
  const x3Error = createMemo(() => (kpisData() ?? EMPTY_KPIS).x3Error)
  const otdError = createMemo(() => (otdData() ?? EMPTY_OTD).x3Error)
  const maxHeures = createMemo(() => Math.max(1, ...kpi().postes.map((p) => p.heures)))

  function otdColor(taux: number, nbTotal: number): string {
    if (nbTotal === 0) return '#a8a18c'
    if (taux >= 90) return '#2d7a4f'
    if (taux >= 70) return '#b8862c'
    return '#b23b2e'
  }

  const Spinner = () => (
    <div class="flex h-[180px] items-center justify-center">
      <span class="material-symbols-outlined animate-spin text-[22px] text-muted-foreground/50">progress_activity</span>
    </div>
  )

  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground print:h-auto print:overflow-visible">
      <Masthead subtitle="Tableau de bord · Overview" active="dashboard" />

      <div class="flex-1 overflow-auto px-7 py-6 print:overflow-visible">
        {/* En-tête imprimable — masquée à l'écran, visible uniquement à l'impression */}
        <div class="mb-5 hidden items-baseline justify-between border-b border-rule pb-3 print:flex">
          <span class="font-fraunces text-[20px] font-semibold tracking-tight text-foreground">
            Supply Chain <span class="font-medium italic text-terra">AERECO</span>
            <span class="ml-3 font-mono text-[13px] font-normal text-muted-foreground">Tableau de bord</span>
          </span>
          <span class="font-mono text-[12px] text-muted-foreground">
            {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(props.referenceDate))}
          </span>
        </div>

        <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">

          {/* Colonne gauche : KPI #1 Charge en retard + KPI #2 OTD */}
          <div class="flex flex-col gap-6 lg:col-span-1">

            {/* KPI #1 — Charge en retard par poste (issue #38) */}
            <article class="rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)]">
              <CardHeader title="Charge en retard" suffix="par poste" />
              <Show when={!kpisData.loading} fallback={<Spinner />}>
                <Show
                  when={!x3Error()}
                  fallback={<p class="font-fraunces text-[13px] italic leading-snug text-destructive/80">{x3Error()}</p>}
                >
                  <div class="flex items-end justify-between gap-3">
                    <div class="font-fraunces text-[56px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                      {kpi().totalHeures}
                      <span class="ml-1 font-mono text-[18px] font-bold text-muted-foreground">h</span>
                    </div>
                    <div class="pb-1.5 text-right font-mono text-[10.5px] leading-tight text-muted-foreground">
                      <b class="text-[13px] text-foreground">{kpi().nbLignes}</b> ligne{kpi().nbLignes > 1 ? 's' : ''}
                      <br />en retard
                    </div>
                  </div>

                  <Show
                    when={kpi().postes.length > 0}
                    fallback={<p class="mt-6 font-fraunces text-[13px] italic text-muted-foreground">Aucune charge en retard — rien à rattraper.</p>}
                  >
                    <div class="mt-6 flex flex-col gap-3.5">
                      <For each={kpi().postes}>
                        {(poste, i) => (
                          <div>
                            <div class="mb-[5px] flex items-baseline justify-between gap-2">
                              <span class="min-w-0 truncate font-mono text-[11.5px] font-bold text-foreground" title={poste.label}>
                                {poste.code}{poste.label ? ` · ${poste.label}` : ''}
                              </span>
                              <span class="shrink-0 font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">{poste.heures} h</span>
                            </div>
                            <div class="h-2 overflow-hidden rounded-full bg-secondary" style={{ '-webkit-print-color-adjust': 'exact', 'print-color-adjust': 'exact' }}>
                              <div
                                class="h-full rounded-full"
                                style={{
                                  width: `${Math.max(3, (poste.heures / maxHeures()) * 100)}%`,
                                  background: BAR_PALETTE[Math.min(i(), BAR_PALETTE.length - 1)],
                                  '-webkit-print-color-adjust': 'exact',
                                  'print-color-adjust': 'exact',
                                }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </Show>
              </Show>
            </article>

            {/* KPI #2 — OTD (On-Time Delivery) — 1 ou 2 périodes selon le jour */}
            <article class="rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)]">
              <div class="mb-4 flex items-center gap-2.5 border-b border-rule-soft pb-3">
                <span class="size-2 shrink-0 rounded-full bg-foreground/30"></span>
                <h2 class="font-fraunces text-[16px] font-semibold leading-none tracking-tight text-foreground">OTD</h2>
                {/* Sélecteur de plage — popover calendrier */}
              <div class="relative ml-auto">
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCalendarOpen((v) => !v)}
                    class="flex items-center gap-1.5 rounded border border-rule bg-secondary px-2 py-1 font-mono text-[10px] text-foreground transition-colors hover:bg-secondary/80"
                  >
                    <span class="material-symbols-outlined text-[13px] text-muted-foreground">calendar_today</span>
                    <span>{otdRangeLabel() ?? 'Auto'}</span>
                  </button>
                  <Show when={otdRange()?.start}>
                    <button
                      type="button"
                      onClick={() => { setOtdRange(null); setCalendarOpen(false) }}
                      class="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                      title="Réinitialiser"
                    >
                      <span class="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </Show>
                </div>

                <Show when={calendarOpen()}>
                  <div class="fixed inset-0 z-10" onClick={() => setCalendarOpen(false)} />
                  <div class="absolute right-0 top-full z-20 mt-1">
                    <Calendar
                      mode="range"
                      range={otdRange() ?? { start: null, end: null }}
                      onRangeChange={(r) => {
                        setOtdRange(r)
                        if (r.start && r.end) setCalendarOpen(false)
                      }}
                      max={new Date()}
                    />
                  </div>
                </Show>
              </div>
              <div class="flex items-center rounded border border-rule bg-secondary p-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em]">
                  <button
                    onClick={() => setOtdMode('demandee')}
                    class="rounded px-2 py-1 transition-colors"
                    classList={{
                      'bg-card text-foreground shadow-sm': otdMode() === 'demandee',
                      'text-muted-foreground hover:text-foreground': otdMode() !== 'demandee',
                    }}
                  >
                    Demandée
                  </button>
                  <button
                    onClick={() => setOtdMode('acceptee')}
                    class="rounded px-2 py-1 transition-colors"
                    classList={{
                      'bg-card text-foreground shadow-sm': otdMode() === 'acceptee',
                      'text-muted-foreground hover:text-foreground': otdMode() !== 'acceptee',
                    }}
                  >
                    Acceptée
                  </button>
                </div>
              </div>
              <Show when={!otdData.loading} fallback={<Spinner />}>
                <Show
                  when={!otdError()}
                  fallback={<p class="font-fraunces text-[13px] italic leading-snug text-destructive/80">{otdError()}</p>}
                >
                  <Show
                    when={otd().length > 0}
                    fallback={<p class="font-fraunces text-[13px] italic text-muted-foreground">Aucune donnée OTD.</p>}
                  >
                    {/* Filtre par client + bascule afficher/masquer les détails */}
                    <div class="mb-3 flex items-center gap-1.5">
                      <div class="relative min-w-0 flex-1">
                        <span class="material-symbols-outlined pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">search</span>
                        <input
                          type="text"
                          value={clientFilter()}
                          onInput={(e) => setClientFilter(e.currentTarget.value)}
                          placeholder="Filtrer par client"
                          aria-label="Filtrer les lignes par client"
                          class="w-full rounded border border-rule bg-secondary py-[5px] pl-7 pr-6 font-sans text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-foreground/30 focus:outline-none"
                        />
                        <Show when={clientFilter()}>
                          <button
                            type="button"
                            onClick={() => setClientFilter('')}
                            class="absolute right-1 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                            title="Effacer le filtre"
                            aria-label="Effacer le filtre"
                          >
                            <span class="material-symbols-outlined text-[13px]">close</span>
                          </button>
                        </Show>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDetailsOpen((v) => !v)}
                        class="flex shrink-0 items-center gap-1 rounded border border-rule bg-secondary px-2 py-[5px] font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-foreground transition-colors hover:bg-secondary/80"
                        title={detailsOpen() ? 'Masquer les détails' : 'Afficher les détails'}
                      >
                        <span class="material-symbols-outlined text-[13px] text-muted-foreground">{detailsOpen() ? 'expand_more' : 'chevron_right'}</span>
                        <span>Détails</span>
                      </button>
                      <Show when={normClient()}>
                        <span class="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground">{nbLignesFiltrees()}/{nbLignesTotal()}</span>
                      </Show>
                    </div>
                    <For each={otdFiltered()}>
                      {(p, i) => (
                        <div classList={{ 'mt-5 border-t border-rule-soft pt-5': i() > 0 }}>
                          {/* Label période */}
                          <div class="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{p.label}</div>

                          <Show
                            when={p.nbTotal > 0}
                            fallback={<p class="font-fraunces text-[12px] italic text-muted-foreground">Aucune ligne à expédier.</p>}
                          >
                            <div class="flex items-end justify-between gap-3">
                              <div class="font-fraunces text-[48px] font-semibold leading-none tracking-tight tabular-nums" style={{ color: otdColor(p.tauxOtif, p.nbTotal) }}>
                                {p.tauxOtif}
                                <span class="ml-0.5 font-mono text-[16px] font-bold text-muted-foreground">%</span>
                              </div>
                              <div class="pb-1 text-right font-mono text-[10.5px] leading-tight text-muted-foreground">
                                <b class="text-[13px] text-foreground">{p.nbOtif}</b>/{p.nbTotal}
                                <br />lignes OTIF
                              </div>
                            </div>

                            <Show when={detailsOpen()}>
                              <Show
                                when={p.lignesNon.length > 0}
                                fallback={
                                  <Show when={normClient()}>
                                    <p class="mt-4 font-fraunces text-[12px] italic text-muted-foreground">Aucune ligne pour « {clientFilter().trim()} ».</p>
                                  </Show>
                                }
                              >
                              <div class="-mx-2 mt-4 max-h-[160px] overflow-auto">
                                <table class="w-full border-collapse text-left">
                                  <thead>
                                    <tr class="sticky top-0 bg-card">
                                      <th class="border-b border-rule px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Commande</th>
                                      <th class="border-b border-rule px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Article</th>
                                      <th class="border-b border-rule px-2 py-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Poste</th>
                                      <th class="border-b border-rule px-2 py-1.5 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Livré/Cmde</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    <For each={p.lignesNon}>
                                      {(l) => (
                                        <tr class="border-b border-rule-soft last:border-0 hover:bg-secondary/40">
                                          <td class="px-2 py-1.5 align-top">
                                            <div class="font-mono text-[11px] font-bold text-foreground">{l.numCommande}</div>
                                            <div class="font-sans text-[10px] text-muted-foreground">{l.client}</div>
                                          </td>
                                          <td class="px-2 py-1.5 align-top font-mono text-[11px] font-semibold text-terra">{l.article}</td>
                                          <td class="px-2 py-1.5 align-top">
                                            <Show
                                              when={l.posteDeCharge}
                                              fallback={<span class="font-sans text-[10px] text-muted-foreground/70">—</span>}
                                            >
                                              <span class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-secondary-foreground">{l.posteDeCharge}</span>
                                            </Show>
                                          </td>
                                          <td class="whitespace-nowrap px-2 py-1.5 text-right align-top font-mono text-[11px] tabular-nums text-muted-foreground">
                                            {l.qteLivree}/{l.qteCmde}
                                          </td>
                                        </tr>
                                      )}
                                    </For>
                                  </tbody>
                                </table>
                              </div>
                              </Show>
                            </Show>
                          </Show>
                        </div>
                      )}
                    </For>
                  </Show>
                </Show>
              </Show>
            </article>

          </div>{/* fin colonne gauche */}

          {/* KPI — Lignes en retard (détail) */}
          <article class="flex max-h-[calc(100vh-9rem)] flex-col rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)] lg:col-span-2 print:max-h-none print:overflow-visible print:shadow-none">
            <CardHeader title="Lignes en retard" suffix={`${kpi().nbLignes} commande${kpi().nbLignes > 1 ? 's' : ''}`} />
            <Show when={!kpisData.loading} fallback={<Spinner />}>
              <Show
                when={!x3Error()}
                fallback={<p class="font-fraunces text-[13px] italic leading-snug text-destructive/80">{x3Error()}</p>}
              >
                <Show
                  when={kpi().lignes.length > 0}
                  fallback={<p class="font-fraunces text-[13px] italic text-muted-foreground">Aucune ligne en retard.</p>}
                >
                  <div class="-mx-2 overflow-auto print:overflow-visible">
                    <table class="w-full border-collapse text-left">
                      <thead>
                        <tr class="sticky top-0 bg-card">
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Expé</th>
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Commande · Client</th>
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Article · Désignation</th>
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Poste</th>
                          <th class="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Reste</th>
                          <th class="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Charge</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={kpi().lignes}>
                          {(l) => (
                            <tr class="border-b border-rule-soft last:border-0 hover:bg-secondary/40">
                              <td class="whitespace-nowrap px-2 py-2.5 align-top font-mono text-[12px] font-semibold text-destructive">{l.dateExp || '—'}</td>
                              <td class="px-2 py-2.5 align-top">
                                <div class="font-mono text-[12px] font-bold text-foreground">{l.numCommande}</div>
                                <div class="font-sans text-[11px] text-muted-foreground">{l.client}</div>
                              </td>
                              <td class="px-2 py-2.5 align-top">
                                <div class="font-mono text-[12px] font-semibold text-terra">{l.article}</div>
                                <div class="font-sans text-[11px] leading-snug text-secondary-foreground">{l.designation || '—'}</div>
                              </td>
                              <td class="px-2 py-2.5 align-top">
                                <Show
                                  when={l.postes.length > 0}
                                  fallback={<span class="font-sans text-[11px] text-muted-foreground/70">—</span>}
                                >
                                  <div class="flex flex-wrap gap-1">
                                    <For each={l.postes}>
                                      {(p) => (
                                        <span class="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-secondary-foreground">{p}</span>
                                      )}
                                    </For>
                                  </div>
                                </Show>
                              </td>
                              <td class="whitespace-nowrap px-2 py-2.5 text-right align-top font-mono text-[12px] font-semibold tabular-nums text-foreground">{l.qteRestante}</td>
                              <td class="whitespace-nowrap px-2 py-2.5 text-right align-top font-mono text-[12px] font-bold tabular-nums text-foreground">{l.heures > 0 ? `${l.heures} h` : '—'}</td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </Show>
              </Show>
            </Show>
          </article>

        </div>
      </div>
    </div>
  )
}

export default Dashboard
