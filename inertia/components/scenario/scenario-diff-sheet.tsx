import { For, Show, type Component } from 'solid-js'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cx } from '@/libs/cva'
import type { PlanDiff, DiffSens } from '@/lib/scenarios/types'

/**
 * Constat d'impact d'un scénario (issue #57, moteur étage 2). Trois axes signés :
 * client (promesses) / appro (couvertures composants) / allocation (re-matching).
 * L'axe charge reste sur le board (histogrammes déjà réactifs aux positions).
 *
 * Principe acté (vision §5) : CONSTAT, pas prescription — on liste, l'humain décide.
 */

const sensClass = (s: DiffSens) => (s === 'degradation' ? 'text-error' : 'text-emerald-600')

const fmtDelta = (n: number, unit: string) => `${n > 0 ? '+' : ''}${n}${unit}`

export const ScenarioDiffSheet: Component<{
  diff: PlanDiff | null
  open: boolean
  onOpenChange: (v: boolean) => void
  loading: boolean
  evaluatedAt: string | null
  dataAt: string | null
}> = (props) => {
  const fmtStamp = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent class="theme-navy w-full overflow-y-auto bg-background text-foreground sm:max-w-2xl">
        <SheetTitle class="font-fraunces text-[18px] font-bold">Étude d'impact</SheetTitle>
        <p class="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Évalué le {fmtStamp(props.evaluatedAt)} · sur données du {fmtStamp(props.dataAt)}
        </p>

        <Show
          when={!props.loading}
          fallback={
            <div class="py-10 text-center text-[13px] text-muted-foreground">Évaluation…</div>
          }
        >
          <Show
            when={props.diff}
            fallback={
              <div class="py-10 text-center text-[13px] italic text-muted-foreground">
                Aucun impact calculé.
              </div>
            }
          >
            {(diff) => (
              <div class="mt-4 space-y-6">
                {/* Bilan */}
                <div class="flex gap-4 text-[12px] font-bold">
                  <span class="text-error">{diff().stats.degradations} dégradation(s)</span>
                  <span class="text-emerald-600">{diff().stats.ameliorations} amélioration(s)</span>
                </div>

                {/* Axe client — promesses */}
                <Section title="Client — promesses" count={diff().client.length}>
                  <For each={diff().client}>
                    {(e) => (
                      <Row sens={e.sens}>
                        <span class="font-mono text-[11px]">
                          {e.numCommande}
                          {e.ligne ? `#${e.ligne}` : ''}
                        </span>
                        <span class="text-muted-foreground">
                          {e.article} · {e.client}
                        </span>
                        <span class={cx('ml-auto font-bold', sensClass(e.sens))}>
                          <Show when={e.nouvelle}>nouvelle · </Show>
                          <Show when={e.disparue}>hors plan · </Show>
                          {e.statutAvant ?? '—'} → {e.statutApres ?? '—'}
                          <Show when={e.deltaJours !== 0}> ({fmtDelta(e.deltaJours, ' j')})</Show>
                        </span>
                      </Row>
                    )}
                  </For>
                </Section>

                {/* Axe appro — couvertures composants */}
                <Section title="Appro — couvertures composants" count={diff().appro.length}>
                  <For each={diff().appro}>
                    {(e) => (
                      <Row sens={e.sens}>
                        <span class="font-mono text-[11px]">{e.composant}</span>
                        <span class="text-muted-foreground">{e.ofs.length} OF</span>
                        <span class={cx('ml-auto font-bold', sensClass(e.sens))}>
                          manquant {e.manquantAvant} → {e.manquantApres} ({fmtDelta(e.delta, '')})
                        </span>
                      </Row>
                    )}
                  </For>
                </Section>

                {/* Axe appro — Verdicts de calage */}
                <Section title="Appro — Verdicts de calage" count={diff().approVerdicts?.length ?? 0}>
                  <For each={diff().approVerdicts ?? []}>
                    {(v) => {
                      const sens: 'degradation' | 'amelioration' = v.verdict === 'recalable' ? 'amelioration' : 'degradation'
                      const label = v.verdict === 'inevitable' ? 'Rupture inévitable' : v.verdict === 'recalable' ? 'Appro à re-caler' : 'Stock dormant'
                      const badgeClass = v.verdict === 'inevitable' ? 'bg-red-100 text-red-700' : v.verdict === 'recalable' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                      return (
                        <Row sens={sens}>
                          <div class="flex flex-col gap-0.5 w-full">
                            <div class="flex items-center gap-1.5 w-full">
                              <span class="font-mono text-[11px] font-bold">{v.composant}</span>
                              <span class={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badgeClass}`}>
                                {label}
                              </span>
                            </div>
                            <span class="text-[10px] text-muted-foreground">
                              Sur {v.numOf} · Besoin {v.dateAvant} → {v.dateApres} · Qté {v.quantite} u (Délai {v.reorderDelay}j)
                            </span>
                          </div>
                        </Row>
                      )
                    }}
                  </For>
                </Section>

                {/* Axe allocation — re-matching */}
                <Section title="Allocation — re-matching" count={diff().allocation.length}>
                  <For each={diff().allocation}>
                    {(e) => (
                      <Row sens={e.sens}>
                        <span class="font-mono text-[11px]">
                          {e.numCommande}
                          {e.ligne ? `#${e.ligne}` : ''}
                        </span>
                        <span class="text-muted-foreground">{e.article}</span>
                        <span class={cx('ml-auto text-right font-bold', sensClass(e.sens))}>
                          <Show when={e.perd.length > 0}>perd {e.perd.join(', ')} </Show>
                          <Show when={e.gagne.length > 0}>· gagne {e.gagne.join(', ')}</Show>
                          <Show when={e.deltaReliquat !== 0}>
                            {' '}
                            ({fmtDelta(e.deltaReliquat, ' u')})
                          </Show>
                        </span>
                      </Row>
                    )}
                  </For>
                </Section>
              </div>
            )}
          </Show>
        </Show>
      </SheetContent>
    </Sheet>
  )
}

const Section: Component<{ title: string; count: number; children: any }> = (props) => (
  <div>
    <h3 class="mb-2 flex items-center gap-2 font-fraunces text-[14px] font-bold">
      {props.title}
      <span class="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
        {props.count}
      </span>
    </h3>
    <Show
      when={props.count > 0}
      fallback={<p class="text-[12px] italic text-muted-foreground">Aucun changement.</p>}
    >
      <div class="space-y-1">{props.children}</div>
    </Show>
  </div>
)

const Row: Component<{ sens: DiffSens; children: any }> = (props) => (
  <div
    class={cx(
      'flex flex-wrap items-center gap-2 rounded-md border-l-2 bg-card px-2.5 py-1.5 text-[12px]',
      props.sens === 'degradation' ? 'border-l-error' : 'border-l-emerald-500'
    )}
  >
    {props.children}
  </div>
)
