/**
 * Vue R2 « Par composant » du suivi des ruptures (issue #52 — extraite de
 * components/shortages/shortage-table.tsx) : agrégation « quel composant fait
 * le plus de dégâts ? » (nb OFs bloqués, qté totale, commande la plus urgente).
 *
 * L'agrégation (groupByComponent) est une dérivation pure (lib/shortages/
 * shortage-math.ts) ; cette vue se contente du rendu table agrégée.
 */
import { For, Show, type Accessor, type Component, type JSXElement } from 'solid-js'
import type { ShortageDisplayRow } from '@/lib/shortages/types'
import { cx } from '@/libs/cva'
import {
  VERDICT_BADGE,
  groupByComponent,
  isLate,
  TH,
  TH_R,
  TD,
} from '@/lib/shortages/shortage-math'

export const ShortageComposants: Component<{
  rows: Accessor<ShortageDisplayRow[]>
  onSelectOf: (numOf: string) => void
  emptyState: JSXElement
}> = (props) => {
  const groups = () => groupByComponent(props.rows())
  const fmtTotal = (n: number) => {
    const r = Math.round(n * 100) / 100
    return Number.isInteger(r) ? String(r) : r.toLocaleString('fr-FR')
  }

  return (
    <div class="h-full overflow-auto bg-card">
      <Show when={groups().length > 0} fallback={props.emptyState}>
        <table class="min-w-[1080px] w-full text-xs">
          <thead>
            <tr class="sticky top-0 z-10 bg-secondary">
              <th class={`w-[38px] ${TH}`}>N°</th>
              <th class={TH}>Composant · Désignation</th>
              <th class={`w-[110px] ${TH_R}`}>Qté manq. totale</th>
              <th class={`w-[90px] ${TH_R}`}>OFs bloqués</th>
              <th class={TH}>OFs</th>
              <th class={`w-[210px] ${TH}`}>Commande la plus urgente</th>
              <th class={`w-[150px] ${TH.replace('border-r border-rule-soft', '')}`}>Couverture</th>
            </tr>
          </thead>
          <tbody>
            <For each={groups()}>
              {(g, i) => {
                const late = g.worstVerdict === 'retard' || g.worstVerdict === 'sans_couverture'
                return (
                  <tr
                    class={cx(
                      'border-t border-rule-soft transition-colors',
                      late
                        ? 'bg-destructive/10 hover:bg-destructive/[0.18]'
                        : 'hover:bg-foreground/[0.04]',
                    )}
                  >
                    <td
                      class={cx(
                        'px-4 py-[13px] align-middle font-fraunces text-[14px] leading-none text-muted-foreground/80 border-r border-rule-soft',
                        late && '[box-shadow:inset_3px_0_var(--color-destructive)]',
                      )}
                    >
                      {i() + 1}
                    </td>
                    <td class={TD}>
                      <div class="font-mono text-[14px] font-bold tracking-tight text-foreground">{g.component}</div>
                      <div class="mt-0.5 truncate max-w-[18rem] font-sans text-[11px] leading-snug text-muted-foreground">
                        {g.componentDesc}
                      </div>
                    </td>
                    <td class={`whitespace-nowrap text-right ${TD}`}>
                      <span class={cx('font-fraunces text-[14px] font-bold tabular-nums leading-none', late ? 'text-destructive' : 'text-foreground')}>
                        {fmtTotal(g.totalManquant)}
                        <span class="ml-0.5 font-mono text-[9px] font-medium text-muted-foreground/70">u</span>
                      </span>
                    </td>
                    <td class={`whitespace-nowrap text-right ${TD}`}>
                      <span class="font-fraunces text-[14px] font-bold tabular-nums leading-none text-foreground">{g.lines.length}</span>
                    </td>
                    <td class={TD}>
                      <div class="flex flex-wrap gap-1">
                        <For each={g.lines}>
                          {(l) => (
                            <button
                              type="button"
                              onClick={() => props.onSelectOf(l.numOf)}
                              title={`${l.articleParent} · ${l.articleParentDesc} — manque ${l.qteManquante} u`}
                              class={cx(
                                'cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-bold transition-colors hover:border-brand hover:text-brand',
                                l.verdictKey === 'sans_couverture'
                                  ? 'border-destructive/30 text-destructive'
                                  : 'border-rule text-secondary-foreground',
                              )}
                            >
                              {l.numOf}
                            </button>
                          )}
                        </For>
                      </div>
                    </td>
                    <td class={TD}>
                      <Show
                        when={g.urgent}
                        fallback={<span class="font-sans text-[11px] italic text-muted-foreground/50">— orphelins</span>}
                      >
                        {(u) => (
                          <>
                            <div class="flex items-baseline gap-1.5">
                              <span class="font-mono text-[12px] font-semibold text-secondary-foreground">{u().numCommande}</span>
                              <span class={cx('font-mono text-[11px] font-bold', late ? 'text-destructive' : 'text-muted-foreground')}>
                                {u().dateExpedition}
                              </span>
                            </div>
                            <div class="mt-0.5 truncate max-w-[13rem] font-sans text-[11px] leading-snug text-muted-foreground">
                              {u().client}
                            </div>
                          </>
                        )}
                      </Show>
                    </td>
                    <td class="w-[150px] px-4 py-[13px] align-middle">
                      <Show
                        when={g.nbSansCouverture > 0}
                        fallback={
                          <span class={cx('inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', VERDICT_BADGE[g.worstVerdict].cls)}>
                            {VERDICT_BADGE[g.worstVerdict].label}
                          </span>
                        }
                      >
                        <span class="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-destructive">
                          {g.nbSansCouverture}/{g.lines.length} sans couv.
                        </span>
                      </Show>
                    </td>
                  </tr>
                )
              }}
            </For>
          </tbody>
        </table>
      </Show>
    </div>
  )
}

export default ShortageComposants
