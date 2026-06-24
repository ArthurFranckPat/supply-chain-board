import { createResource, createMemo, For, Show, type Component } from 'solid-js'
import { Masthead } from '@/components/masthead'

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
  of: string
  ofStatut: number
  cause: string
}
interface RetardChargeKpi {
  totalHeures: number
  nbLignes: number
  postes: { code: string; label: string; heures: number }[]
  lignes: RetardLigne[]
}
interface DashboardKpisResponse {
  retardCharge: RetardChargeKpi
  x3Error: string | null
  referenceDate: string
}
interface DashboardProps {
  referenceDate: string
  kpisHref: string
}

const EMPTY: DashboardKpisResponse = {
  retardCharge: { totalHeures: 0, nbLignes: 0, postes: [], lignes: [] },
  x3Error: null,
  referenceDate: '',
}

/** Palette des barres par rang de poste (du plus chargé au moins chargé). */
const BAR_PALETTE = ['#b23b2e', '#cf6a3f', '#b8862c', '#cdb079', '#a8a18c']

/** Statut X3 d'un OF → tag WOF/WOP/WOS + couleur (1 Ferme / 2 Planifié / 3 Suggéré). */
const OF_STATUT: Record<number, { tag: string; tone: string }> = {
  1: { tag: 'WOF', tone: 'bg-ferme/15 text-ferme' },
  2: { tag: 'WOP', tone: 'bg-planifie/15 text-planifie' },
  3: { tag: 'WOS', tone: 'bg-suggere/15 text-suggere' },
}

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
  const [data] = createResource(
    () => props.kpisHref,
    async (url): Promise<DashboardKpisResponse> => {
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as DashboardKpisResponse
    },
  )

  const kpi = createMemo(() => (data() ?? EMPTY).retardCharge)
  const x3Error = createMemo(() => (data() ?? EMPTY).x3Error)
  const maxHeures = createMemo(() => Math.max(1, ...kpi().postes.map((p) => p.heures)))

  const Spinner = () => (
    <div class="flex h-[180px] items-center justify-center">
      <span class="material-symbols-outlined animate-spin text-[22px] text-muted-foreground/50">progress_activity</span>
    </div>
  )

  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead subtitle="Tableau de bord · Overview" active="dashboard" />

      <div class="flex-1 overflow-auto px-7 py-6">
        <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">

          {/* KPI #1 — Charge en retard par poste (issue #38) */}
          <article class="rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)] lg:col-span-1">
            <CardHeader title="Charge en retard" suffix="par poste" />
            <Show when={!data.loading} fallback={<Spinner />}>
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
                          <div class="mb-[5px] flex items-baseline justify-between">
                            <span class="font-mono text-[11.5px] font-bold text-foreground" title={poste.label}>{poste.code}</span>
                            <span class="font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">{poste.heures} h</span>
                          </div>
                          <div class="h-2 overflow-hidden rounded-full bg-secondary">
                            <div
                              class="h-full rounded-full"
                              style={{
                                width: `${Math.max(3, (poste.heures / maxHeures()) * 100)}%`,
                                background: BAR_PALETTE[Math.min(i(), BAR_PALETTE.length - 1)],
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

          {/* KPI — Lignes en retard (détail) */}
          <article class="flex max-h-[calc(100vh-9rem)] flex-col rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)] lg:col-span-2">
            <CardHeader title="Lignes en retard" suffix={`${kpi().nbLignes} commande${kpi().nbLignes > 1 ? 's' : ''}`} />
            <Show when={!data.loading} fallback={<Spinner />}>
              <Show
                when={!x3Error()}
                fallback={<p class="font-fraunces text-[13px] italic leading-snug text-destructive/80">{x3Error()}</p>}
              >
                <Show
                  when={kpi().lignes.length > 0}
                  fallback={<p class="font-fraunces text-[13px] italic text-muted-foreground">Aucune ligne en retard.</p>}
                >
                  <div class="-mx-2 overflow-auto">
                    <table class="w-full border-collapse text-left">
                      <thead>
                        <tr class="sticky top-0 bg-card">
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Expé</th>
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Commande · Client</th>
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Article · Désignation</th>
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">OF</th>
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Poste</th>
                          <th class="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Reste</th>
                          <th class="border-b border-rule px-2 py-2 text-right font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Charge</th>
                          <th class="border-b border-rule px-2 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Cause</th>
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
                              <td class="whitespace-nowrap px-2 py-2.5 align-top">
                                <Show when={l.of} fallback={<span class="font-sans text-[11px] text-muted-foreground/70">—</span>}>
                                  <div class="flex items-center gap-1.5">
                                    <span class="font-mono text-[12px] font-semibold text-foreground">{l.of}</span>
                                    <Show when={OF_STATUT[l.ofStatut]}>
                                      {(st) => (
                                        <span class={`shrink-0 rounded px-1 py-px font-mono text-[9px] font-bold leading-none ${st().tone}`}>{st().tag}</span>
                                      )}
                                    </Show>
                                  </div>
                                </Show>
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
                              <td class="px-2 py-2.5 align-top font-sans text-[11px] leading-snug text-muted-foreground">{l.cause || '—'}</td>
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
