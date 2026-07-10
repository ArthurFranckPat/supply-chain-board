/**
 * Onglet « Diagnostic récursif » du détail OF (issue #52 — extrait de
 * components/of/of-detail-sheet.tsx). Arbre tabulaire aligné, récursif :
 * un composant en rupture peut être couvert par un sous-ensemble (OF) dont
 * on affiche à son tour les composants (DiagShortRow s'appelle lui-même).
 *
 * Layout tabulaire aligné — colonnes :
 * [statut 6.5rem] [article 6rem] [description 1fr] [besoin 3rem]
 * [dispo 3rem] [manque 4rem] [réception 6.5rem]
 */
import { For, Show, type Component } from 'solid-js'
import { Badge } from '@/components/ui/badge'
import { cx } from '@/libs/cva'
import {
  type DiagResult,
  type DiagShort,
  STATUT_OF,
  STATUS_VARIANT,
  TREE_STATUS_LABEL,
  fmtDateFr,
} from '@/lib/of/diagnostic-types'

/** En-tête de colonnes du tableau diagnostic. */
const DiagColHeader: Component = () => (
  <div class="flex items-center gap-3 border-b border-border bg-secondary px-3 py-1 font-mono text-[8px] font-bold tracking-wider text-muted-foreground">
    <span class="w-[6.5rem] flex-none">Statut</span>
    <span class="w-[6rem] flex-none">Article</span>
    <span class="min-w-0 flex-1">Désignation</span>
    <span class="w-9 flex-none text-right">Besoin</span>
    <span class="w-9 flex-none text-right">Dispo</span>
    <span class="w-10 flex-none text-right">Manque</span>
    <span class="w-[13rem] flex-none">Réception prévue</span>
  </div>
)

/** Une ligne composant (achetée ou sous-ensemble) dans le tableau. */
const DiagRow: Component<{ short: DiagShort }> = (p) => (
  <div
    class={cx(
      'flex items-center gap-3 px-3 py-2',
      p.short.status === 'rupture_matiere' && 'bg-destructive/10',
      p.short.status === 'qc_a_controler' && 'bg-warning/10',
    )}
  >
    <div class="w-[6.5rem] flex-none">
      <Badge variant={STATUS_VARIANT[p.short.status]} class="whitespace-nowrap text-[8px]">
        {TREE_STATUS_LABEL[p.short.status]}
      </Badge>
    </div>
    <span class={cx('w-[6rem] flex-none truncate font-mono text-[11px] font-bold',
      p.short.status === 'rupture_matiere' ? 'text-destructive' : 'text-foreground'
    )}>
      {p.short.article}
    </span>
    <span class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
      {p.short.description}
    </span>
    <span class="w-9 flex-none text-right font-mono text-[11px] text-muted-foreground">
      {p.short.quantityNeeded}
    </span>
    <span class="w-9 flex-none text-right font-mono text-[11px] text-muted-foreground">
      <Show when={p.short.stockQc} fallback={<>{p.short.available ?? '?'}</>}>
        <span class="font-semibold text-warning" title={`dont ${p.short.stockQc} en CQ`}>
          {p.short.available ?? 0}+{p.short.stockQc}
        </span>
      </Show>
    </span>
    <span class="w-10 flex-none text-right font-mono text-[11px] font-bold text-destructive">
      −{p.short.quantityMissing}
    </span>
    <div class="w-[13rem] flex-none font-mono text-[10px]">
      <Show when={p.short.earliestReception}>
        <div class="flex flex-col gap-0.5">
          <Show when={p.short.receptionSupplier}>
            <span class="font-semibold text-foreground truncate">{p.short.receptionSupplier}</span>
          </Show>
          <div class="flex items-center gap-1.5 text-muted-foreground">
            <Show when={p.short.receptionOrderId}>
              <span class="text-[9px] font-mono">{p.short.receptionOrderId}</span>
              <span class="text-border">·</span>
            </Show>
            <span class="text-brand">réc. {fmtDateFr(p.short.earliestReception)}</span>
          </div>
        </div>
      </Show>
      <Show when={p.short.status === 'qc_a_controler' && !p.short.earliestReception}>
        <span class="text-warning">lever CQ</span>
      </Show>
    </div>
  </div>
)

/**
 * Bloc "couvert par" — en-tête OF couvrant + ses composants récursifs.
 * Indenté sous la colonne description (après statut + article = ~12.5rem).
 */
const DiagShortRow: Component<{ short: DiagShort }> = (props) => (
  <div class="border-b border-rule-soft last:border-b-0">
    <DiagRow short={props.short} />

    <Show when={props.short.covering.length > 0}>
      <div class="ml-[12.5rem] border-l-2 border-border/40 mb-1">
        <For each={props.short.covering}>
          {(cov) => (
            <div class="pl-3 pt-0.5">
              {/* En-tête OF couvrant */}
              <div class="flex flex-wrap items-center gap-1.5 py-1 font-mono text-[9px] text-muted-foreground">
                <span class="material-symbols-outlined text-[11px]">subdirectory_arrow_right</span>
                <span class="font-semibold tracking-wider">COUVERT PAR</span>
                <span class="font-bold text-[11px] text-foreground">{cov.numOf}</span>
                <Badge
                  variant={cov.statut === 1 ? 'success' : cov.statut === 3 ? 'warning' : 'secondary'}
                  class="text-[8px]"
                >
                  {STATUT_OF[cov.statut] ?? `statut ${cov.statut}`}
                </Badge>
                <Badge
                  variant={cov.node.source === 'MFGMAT' ? 'success' : 'secondary'}
                  class="text-[8px]"
                >
                  {cov.node.source === 'MFGMAT' ? 'réel' : 'théorique'}
                </Badge>
                <span>qté {cov.quantity}</span>
                <Badge variant={STATUS_VARIANT[cov.node.status]} class="text-[8px]">
                  {TREE_STATUS_LABEL[cov.node.status]}
                </Badge>
              </div>
              {/* Composants du sous-ensemble */}
              <Show
                when={cov.node.shorts.length > 0}
                fallback={
                  <div class="pb-1 font-mono text-[10px] text-ferme">
                    ✓ tous composants disponibles
                  </div>
                }
              >
                <div class="mb-1 overflow-hidden rounded border border-border/60">
                  <For each={cov.node.shorts}>
                    {(s) => <DiagShortRow short={s} />}
                  </For>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  </div>
)

const StatusBadge: Component<{ status: DiagResult['rootCause']; class?: string }> = (p) => (
  <Badge variant={STATUS_VARIANT[p.status]} class={p.class}>
    {TREE_STATUS_LABEL[p.status]}
  </Badge>
)

/** Diagnostic récursif complet : bandeau résumé (cause racine + faisabilité) + arbre. */
export const OfDiagnosticTree: Component<{ result: DiagResult }> = (props) => (
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2">
      <StatusBadge status={props.result.rootCause} />
      <Badge
        variant={
          props.result.feasible
            ? 'success'
            : props.result.rootCause === 'qc_a_controler'
              ? 'warning'
              : 'destructive'
        }
      >
        {props.result.feasible
          ? 'Faisable'
          : props.result.rootCause === 'qc_a_controler'
            ? 'Faisable sous réserve CQ'
            : 'Bloqué'}
      </Badge>
      <span class="ml-auto font-mono text-[10px] text-muted-foreground">
        {props.result.componentsChecked} composant(s) · profondeur {props.result.maxDepthReached}
      </span>
    </div>
    <Show
      when={props.result.tree.shorts.length > 0}
      fallback={
        <div class="flex items-center gap-2 rounded-md bg-ferme/10 px-3 py-2 text-[12px] font-medium text-ferme">
          <span class="material-symbols-outlined text-[16px]">check_circle</span>
          Tous les composants sont disponibles
        </div>
      }
    >
      <div class="overflow-hidden rounded-md border border-border">
        <DiagColHeader />
        <For each={props.result.tree.shorts}>
          {(s) => <DiagShortRow short={s} />}
        </For>
      </div>
    </Show>
  </div>
)

export default OfDiagnosticTree
