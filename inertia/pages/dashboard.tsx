import { createResource, createMemo, For, Show, type Component } from 'solid-js'
import { Masthead } from '@/components/masthead'

/**
 * Tableau de bord (issue #26 shell + #38 KPI #1). Landing par défaut post-login.
 *
 * Coquille rendue instantanément ; le KPI « charge en retard » (calcul lourd : statuts
 * + charge gamme depuis X3) est chargé en différé par fetch JSON sur `kpisHref`. Même
 * motif que /suivi (scheduler/tracking).
 */

interface RetardChargeKpi {
  totalHeures: number
  nbLignes: number
  postes: { code: string; label: string; heures: number }[]
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
  retardCharge: { totalHeures: 0, nbLignes: 0, postes: [] },
  x3Error: null,
  referenceDate: '',
}

/** Palette des barres par rang de poste (du plus chargé au moins chargé). */
const BAR_PALETTE = ['#b23b2e', '#cf6a3f', '#b8862c', '#cdb079', '#a8a18c']

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

  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead subtitle="Tableau de bord · Overview" active="dashboard" />

      <div class="flex-1 overflow-auto p-8">
        <div class="mx-auto grid max-w-[1100px] grid-cols-1 gap-6 md:grid-cols-3">

          {/* KPI #1 — Charge en retard (issue #38) */}
          <article class="rounded border border-rule bg-card p-6 shadow-[0_14px_30px_-26px_rgba(42,38,34,0.45)]">
            <span class="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Charge en retard · par poste
            </span>

            <Show
              when={!data.loading}
              fallback={
                <div class="mt-6 flex h-[180px] items-center justify-center">
                  <span class="material-symbols-outlined animate-spin text-[22px] text-muted-foreground/50">progress_activity</span>
                </div>
              }
            >
              <Show
                when={!x3Error()}
                fallback={
                  <p class="mt-6 font-fraunces text-[13px] italic leading-snug text-destructive/80">{x3Error()}</p>
                }
              >
                {/* Chiffre + nb de lignes */}
                <div class="mt-3 flex items-end justify-between gap-3">
                  <div class="font-fraunces text-[56px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                    {kpi().totalHeures}
                    <span class="ml-1 font-mono text-[18px] font-bold text-muted-foreground">h</span>
                  </div>
                  <div class="pb-1.5 text-right font-mono text-[10.5px] leading-tight text-muted-foreground">
                    <b class="text-[13px] text-foreground">{kpi().nbLignes}</b> ligne{kpi().nbLignes > 1 ? 's' : ''}
                    <br />en retard
                  </div>
                </div>

                {/* Ventilation par poste */}
                <Show
                  when={kpi().postes.length > 0}
                  fallback={
                    <p class="mt-6 font-fraunces text-[13px] italic text-muted-foreground">
                      Aucune charge en retard — rien à rattraper.
                    </p>
                  }
                >
                  <div class="mt-6 flex flex-col gap-3.5">
                    <For each={kpi().postes}>
                      {(poste, i) => (
                        <div class="bar">
                          <div class="mb-[5px] flex items-baseline justify-between">
                            <span class="font-mono text-[11.5px] font-bold text-foreground" title={poste.label}>
                              {poste.code}
                            </span>
                            <span class="font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">
                              {poste.heures} h
                            </span>
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
                  <div class="mt-5 border-t border-rule-soft pt-3.5 font-mono text-[11px] text-muted-foreground">
                    {kpi().postes.length} poste{kpi().postes.length > 1 ? 's' : ''} concerné{kpi().postes.length > 1 ? 's' : ''}
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
