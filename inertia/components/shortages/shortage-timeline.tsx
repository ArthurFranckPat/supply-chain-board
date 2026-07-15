/**
 * Vue R3 « Couverture » du suivi des ruptures (issue #52 — extraite de
 * components/shortages/shortage-table.tsx) : frise temporelle — réception
 * couvrante ↔ date d'expédition, pour lire d'un coup le retard d'arrivée
 * (gap hachuré) ou la marge.
 *
 * Le positionnement temporel (offsetPct) et les prédicats verdict (isLate,
 * isAtRisk) sont des dérivations pures (lib/shortages/shortage-math.ts).
 * `Marker` est un helper privé à la frise (pastille + libellé).
 */
import { For, Show, type Component, type JSXElement } from 'solid-js'
import type { ShortageDisplayRow } from '@/lib/shortages/types'
import { cx } from '@/libs/cva'
import { isAtRisk, isLate, offsetPct } from '@/lib/shortages/shortage-math'

export const ShortageTimeline: Component<{
  rows: ShortageDisplayRow[]
  windowStartIso: string
  horizon: number
  onSelectOf: (numOf: string) => void
  emptyState: JSXElement
}> = (props) => {
  // Repères de semaine (lundis) sur la fenêtre — uniquement pour la grille de fond.
  const weekTicks = () => {
    const ticks: { pct: number; label: string }[] = []
    const start = new Date(`${props.windowStartIso}T00:00:00Z`)
    for (let d = 0; d <= props.horizon; d++) {
      const day = new Date(start)
      day.setUTCDate(start.getUTCDate() + d)
      if (day.getUTCDay() === 1) {
        // Lundi → numéro de semaine ISO approximatif (affichage seulement).
        const jan1 = new Date(Date.UTC(day.getUTCFullYear(), 0, 1))
        const wk = Math.ceil(
          ((day.getTime() - jan1.getTime()) / 86_400_000 + jan1.getUTCDay() + 1) / 7
        )
        ticks.push({ pct: (d / props.horizon) * 100, label: `S${wk}` })
      }
    }
    return ticks
  }

  // ISO local (pas toISOString : UTC recule d'un jour entre minuit et 1-2h en UTC+1/+2).
  const todayPct = () => {
    const d = new Date()
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return offsetPct(iso, props.windowStartIso, props.horizon)
  }

  return (
    <div class="h-full overflow-auto rounded-none border-0 bg-card">
      <Show when={props.rows.length > 0} fallback={props.emptyState}>
        <div class="min-w-[980px]">
          <For each={props.rows}>
            {(row) => {
              const expPct = () =>
                offsetPct(row.dateExpeditionIso, props.windowStartIso, props.horizon)
              const recPct = () => offsetPct(row.receptionIso, props.windowStartIso, props.horizon)
              const gap = () => {
                const e = expPct()
                const r = recPct()
                if (e === null || r === null) return null
                // bad = retard client (rouge hachuré) ; warn = à risque (ambre uni) ; ok = couvert.
                const state = row.arriveeLate ? 'bad' : isAtRisk(row) ? 'warn' : 'ok'
                return { left: Math.min(e, r), width: Math.abs(r - e), state }
              }
              return (
                <div
                  class={cx(
                    'grid grid-cols-[330px_1fr] border-b border-rule-soft transition-colors',
                    isLate(row)
                      ? 'bg-destructive/10 hover:bg-destructive/[0.18]'
                      : 'hover:bg-foreground/[0.04]'
                  )}
                >
                  {/* Contexte */}
                  <div
                    class={cx(
                      'flex flex-col gap-0.5 border-r border-rule-soft px-4 py-[13px]',
                      isLate(row) && '[box-shadow:inset_3px_0_var(--color-destructive)]'
                    )}
                  >
                    <div class="flex items-baseline gap-2">
                      <span class="font-mono text-[14px] font-bold text-foreground">
                        {row.component}
                      </span>
                      <span
                        class={cx(
                          'ml-auto font-mono text-[11px] font-semibold',
                          isLate(row) ? 'text-destructive' : 'text-muted-foreground'
                        )}
                      >
                        −{row.qteManquante} u
                      </span>
                    </div>
                    <div class="truncate font-sans text-[11px] text-muted-foreground">
                      {row.componentDesc}
                    </div>
                    <div class="mt-0.5 font-mono text-[10px] text-muted-foreground">
                      <button
                        type="button"
                        onClick={() => props.onSelectOf(row.numOf)}
                        class="cursor-pointer font-semibold text-brand hover:underline"
                      >
                        {row.numOf}
                      </button>
                      {' · '}
                      <span class="font-semibold">{row.articleParent}</span>
                      {' · '}
                      {row.hasCommande ? `${row.numCommande} · ${row.client}` : 'orphelin'}
                    </div>
                  </div>

                  {/* Frise */}
                  <div class="relative mx-3.5 my-2.5 h-[46px]">
                    {/* Grille semaines */}
                    <For each={weekTicks()}>
                      {(t) => (
                        <div
                          class="absolute bottom-4 top-0 w-px bg-hair"
                          style={{ left: `${t.pct}%` }}
                        >
                          <span class="absolute -top-0.5 left-1 font-mono text-[8px] font-bold tracking-wide text-muted-foreground/70">
                            {t.label}
                          </span>
                        </div>
                      )}
                    </For>
                    {/* Axe */}
                    <div class="absolute left-0 right-0 top-6 h-0.5 bg-rule-soft" />
                    {/* Aujourd'hui */}
                    <Show when={todayPct() !== null}>
                      <div
                        class="absolute bottom-3.5 top-0 w-0.5 bg-brand/50"
                        style={{ left: `${todayPct()}%` }}
                      >
                        <span class="absolute -top-0.5 left-1 font-mono text-[8px] font-bold text-brand">
                          auj.
                        </span>
                      </div>
                    </Show>
                    {/* Gap réception ↔ expé */}
                    <Show when={gap()}>
                      {(g) => (
                        <div
                          class={cx(
                            'absolute top-[21px] h-2 rounded-full border',
                            g().state === 'bad'
                              ? 'border-destructive/35 [background:repeating-linear-gradient(45deg,var(--color-destructive)/10,var(--color-destructive)/10_5px,transparent_5px,transparent_10px)]'
                              : g().state === 'warn'
                                ? 'border-suggere/40 bg-suggere/15'
                                : 'border-ferme/30 bg-ferme/15'
                          )}
                          style={{ left: `${g().left}%`, width: `${g().width}%` }}
                        />
                      )}
                    </Show>
                    {/* Marqueur expé */}
                    <Show when={expPct() !== null}>
                      <Marker pct={expPct()!} tone="exp" cap={`expé ${row.dateExpedition}`} />
                    </Show>
                    {/* Marqueur réception (ou absence) */}
                    <Show
                      when={row.receptionIso}
                      fallback={
                        row.verdictKey === 'sous_ensemble' ? (
                          <Marker
                            pct={88}
                            tone="se"
                            cap="sous-ensemble"
                            sub={
                              row.sousEnsembleOfs.length > 0
                                ? `OF fils ${row.sousEnsembleOfs[0]}`
                                : 'OF fils à lancer'
                            }
                            dashed
                          />
                        ) : (
                          <Marker
                            pct={88}
                            tone="none"
                            cap="aucune réception"
                            sub="à commander"
                            dashed
                          />
                        )
                      }
                    >
                      <Marker
                        pct={recPct()!}
                        tone={row.arriveeLate ? 'bad' : isAtRisk(row) ? 'warn' : 'ok'}
                        cap={row.dateArrivee}
                        sub={
                          row.verdictKey === 'retard'
                            ? `retard +${row.joursRetardReception}j`
                            : row.verdictKey === 'a_risque'
                              ? `marge ${row.joursMarge}j`
                              : undefined
                        }
                      />
                    </Show>
                  </div>
                </div>
              )
            }}
          </For>

          {/* Légende */}
          <div class="flex flex-wrap gap-4 border-t border-rule-soft bg-card px-4 py-2.5 font-mono text-[10px] font-semibold text-muted-foreground">
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2.5 rounded-full bg-brand" /> Date d'expédition (cible)
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2.5 rounded-full bg-ferme" /> Réception à temps
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2.5 rounded-full bg-suggere" /> À risque (buffers entamés)
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2.5 rounded-full bg-destructive" /> Retard client
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2.5 rounded-full border-2 border-dashed border-destructive" />{' '}
              Aucune réception
            </span>
            <span class="inline-flex items-center gap-1.5">
              <span class="size-2.5 rounded-full border-2 border-dashed border-planifie" />{' '}
              Sous-ensemble (OF fils)
            </span>
          </div>
        </div>
      </Show>
    </div>
  )
}

/** Marqueur de frise (pastille + libellé + sous-libellé), positionné en %. */
const Marker: Component<{
  pct: number
  tone: 'exp' | 'ok' | 'bad' | 'warn' | 'none' | 'se'
  cap: string
  sub?: string
  dashed?: boolean
}> = (p) => {
  const pinCls =
    p.tone === 'exp'
      ? 'bg-brand'
      : p.tone === 'ok'
        ? 'bg-ferme'
        : p.tone === 'bad'
          ? 'bg-destructive'
          : p.tone === 'warn'
            ? 'bg-suggere'
            : p.tone === 'se'
              ? 'border-2 border-dashed border-planifie'
              : 'border-2 border-dashed border-destructive'
  const capCls =
    p.tone === 'exp'
      ? 'text-brand'
      : p.tone === 'ok'
        ? 'text-ferme'
        : p.tone === 'warn'
          ? 'text-suggere'
          : p.tone === 'se'
            ? 'text-planifie'
            : 'text-destructive'
  return (
    <div
      class="absolute top-3.5 flex -translate-x-1/2 flex-col items-center gap-0.5"
      style={{ left: `${p.pct}%` }}
    >
      <span class={cx('size-[13px] rounded-full border-2 border-card', pinCls)} />
      <span class={cx('mt-0.5 whitespace-nowrap font-mono text-[9px] font-bold', capCls)}>
        {p.cap}
      </span>
      <Show when={p.sub}>
        <span class="whitespace-nowrap font-mono text-[8px] font-medium text-muted-foreground">
          {p.sub}
        </span>
      </Show>
    </div>
  )
}

export default ShortageTimeline
