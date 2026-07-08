import { For, Show, type Accessor } from 'solid-js'
import { cx } from '@/libs/cva'
import type { BoardStore } from '@/lib/board/store'
import type { OrderBoardStore } from '@/lib/orders/store'
import { Button } from '@/components/ui/button'
import { Calendar, type DateRange } from '@/components/ui/calendar'

export type VisionMode = 'combined' | 'ordonnancement' | 'planification'

const MODE_LABELS: Record<VisionMode, string> = {
  ordonnancement: 'OF',
  combined: 'Combiné',
  planification: 'Cmdes',
}

const STATUS_FILTER_CHIPS: { k: 'ferme' | 'planifie' | 'suggere'; label: string }[] = [
  { k: 'ferme', label: 'Ferme' },
  { k: 'planifie', label: 'Planifié' },
  { k: 'suggere', label: 'Suggéré' },
]

const BESOIN_CHIPS = [
  { k: 'COMMANDE', label: 'Cmde' },
  { k: 'PREVISION', label: 'Prév' },
] as const

/**
 * Toolbar de la page Programme — sélecteur de mode, filtres (statut/atelier/
 * besoin), calendrier de fenêtre, faisabilité (issue #52 — extrait de
 * scheduler/programme.tsx, alignée /ordonnancement).
 */
export function ProgrammeToolbar(props: {
  mode: Accessor<VisionMode>
  switchMode: (m: VisionMode) => void
  store: BoardStore
  orderStore: OrderBoardStore
  feasMode: Accessor<'immediate' | 'sequential'>
  setFeasMode: (m: 'immediate' | 'sequential') => void
  feasLoading: Accessor<boolean>
  runFeasibility: () => void
  refreshing: Accessor<boolean>
  doRefresh: () => void
  dateRange: string
  calOpen: Accessor<boolean>
  setCalOpen: (fn: (o: boolean) => boolean) => void
  range: Accessor<DateRange>
  applyRange: (r: DateRange) => void
}) {
  const { store, orderStore } = props
  return (
    <div data-print-toolbar class="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-rule px-7 py-2">
      {/* Sélecteur de mode */}
      <div class="inline-flex items-center gap-0.5 rounded-md border border-rule bg-card p-0.5">
        <For each={(['ordonnancement', 'combined', 'planification'] as const)}>
          {(m) => (
            <button
              type="button"
              class={cx(
                'rounded-[5px] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                props.mode() === m ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => props.switchMode(m)}
            >
              {MODE_LABELS[m]}
            </button>
          )}
        </For>
      </div>

      {/* Filtre statut d'OF — masqué en mode planification */}
      <Show when={props.mode() !== 'planification'}>
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Statut
          </span>
          <For each={STATUS_FILTER_CHIPS}>
            {({ k, label }) => (
              <button
                type="button"
                class={cx(
                  'rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                  store.statusActive(k) ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => store.toggleStatus(k)}
              >
                {label}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Filtre atelier (STOLOC, #36) — mode planification seulement.
          Parité visuelle avec /charge ; pilote orderStore.lineVisible. */}
      <Show when={props.mode() === 'planification' && orderStore.ateliers().length > 0}>
        <div class="inline-flex flex-wrap items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Atelier
          </span>
          <For each={orderStore.ateliers()}>
            {(a) => (
              <button
                type="button"
                title={a.code}
                onClick={() => orderStore.toggleAtelier(a.code)}
                class={cx(
                  'rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                  orderStore.atelierFilter().has(a.code)
                    ? 'bg-terra-soft text-terra'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {a.code}
              </button>
            )}
          </For>
          <Show when={orderStore.atelierFilter().size > 0}>
            <button
              type="button"
              onClick={() => orderStore.clearAtelier()}
              class="ml-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-terra hover:underline"
            >
              ✕
            </button>
          </Show>
        </div>
      </Show>

      {/* Filtre type de besoin (COMMANDE / PRÉVISION) — mode planification. */}
      <Show when={props.mode() === 'planification'}>
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Besoin
          </span>
          <For each={BESOIN_CHIPS}>
            {(n) => (
              <button
                type="button"
                onClick={() => orderStore.toggleNature(n.k)}
                class={cx(
                  'rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
                  orderStore.natureFilter().has(n.k)
                    ? 'bg-terra-soft text-terra'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {n.label}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Calendrier — conservé seul à l'impression (data-print-keep). */}
      <div data-print-keep class="relative">
        <button
          type="button"
          onClick={() => props.setCalOpen((o) => !o)}
          class="flex items-center gap-1.5 rounded-full border border-rule bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-terra"
        >
          <span class="material-symbols-outlined text-[14px] text-muted-foreground">calendar_month</span>
          {props.dateRange}
          <span class="material-symbols-outlined text-[16px] text-muted-foreground">expand_more</span>
        </button>
        <Show when={props.calOpen()}>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            class="fixed inset-0 z-40 cursor-default"
            onClick={() => props.setCalOpen(() => false)}
          />
          <div class="absolute left-0 top-full z-50 mt-2">
            <Calendar mode="range" range={props.range()} onRangeChange={props.applyRange} />
          </div>
        </Show>
      </div>

      {/* Faisabilité — déclencheur + mode. Pilote le store ACTIF : orderStore en mode
          planification (badges par ligne de commande, dérivés des OF rattachés via
          /board-feasibility orders[]), store OF sinon (badges par OF). Aucune logique
          de calcul dupliquée — même endpoint, parsé différemment. Issues #24, #21. */}
      <div class="flex items-center gap-2.5">
        {/* Mode d'allocation stock — choix exclusif (segment, parité /ordonnancement) */}
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Stock
          </span>
          <button
            type="button"
            title="Stock vu en intégralité par chaque OF"
            onClick={() => props.setFeasMode('immediate')}
            class={cx(
              'rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
              props.feasMode() === 'immediate' ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Instantanée
          </button>
          <button
            type="button"
            title="Stock consommé OF par OF selon priorité"
            onClick={() => props.setFeasMode('sequential')}
            class={cx(
              'rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
              props.feasMode() === 'sequential' ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Projetée
          </button>
        </div>

        <button
          type="button"
          disabled={props.refreshing()}
          onClick={props.doRefresh}
          class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-terra disabled:opacity-60"
          title="Recharger les données X3 (cache → re-fetch live), sans recharger la page"
        >
          <span class={`material-symbols-outlined text-[14px] text-muted-foreground ${props.refreshing() ? 'animate-spin' : ''}`}>
            refresh
          </span>
          {props.refreshing() ? 'Actualisation…' : 'Actualiser'}
        </button>

        <Button size="sm" disabled={props.feasLoading()} onClick={props.runFeasibility} class="gap-1.5">
          <span class={`material-symbols-outlined text-[15px] ${props.feasLoading() ? 'animate-spin' : ''}`}>
            {props.feasLoading() ? 'progress_activity' : 'fact_check'}
          </span>
          {props.feasLoading() ? 'Calcul…' : 'Faisabilité'}
        </Button>

        {/* Sélection multi-OF → affermissement en batch (#34, vue OF uniquement) */}
        <Show when={props.mode() !== 'planification'}>
          <Button
            size="sm"
            variant={store.selectMode() ? 'default' : 'outline'}
            onClick={() => (store.selectMode() ? store.exitSelect() : store.enterSelect())}
            class="gap-1.5"
          >
            <span class="material-symbols-outlined text-[15px]">checklist</span>
            Sélection
          </Button>
        </Show>
      </div>
    </div>
  )
}
