import { For, Show, type Accessor } from 'solid-js'
import { cx } from '@/libs/cva'
import type { BoardStore } from '@/lib/board/store'
import type { OrderBoardStore } from '@/lib/orders/store'
import { onEscapeClose } from '@/lib/a11y/activation'
import { Button } from '@/components/ui/button'
import { Calendar, type DateRange } from '@/components/ui/calendar'

export type VisionMode = 'combined' | 'ordonnancement' | 'planification'

const MODE_LABELS: Record<VisionMode, string> = {
  ordonnancement: 'OF',
  combined: 'Combiné',
  planification: 'Cmdes',
}

/** #62 (lot 3) : libellés complets pour les tooltips du sélecteur de mode. */
const MODE_TITLES: Record<VisionMode, string> = {
  ordonnancement: 'Mode Ordonnancement — OF seuls',
  combined: 'Mode Combiné — OF + liens commandes + impacts',
  planification: 'Mode Commandes — planification par ligne de commande',
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
  /** #57 : mode scénario (capture des gestes, aucun PATCH). Mode combiné seulement. */
  scenarioActive?: Accessor<boolean>
  onToggleScenario?: () => void
}) {
  const { store, orderStore } = props
  return (
    <div data-print-toolbar class="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-rule px-7 py-2 min-h-[52px]">
      {/* Sélecteur de mode — #62 (lot 1) : radiogroup sémantique.
          #62 (lot 3) : tooltips avec libellés complets. */}
      <div
        class="inline-flex items-center gap-0.5 rounded-md border border-rule bg-card p-0.5"
        role="radiogroup"
        aria-label="Mode d'affichage"
      >
        <For each={(['ordonnancement', 'combined', 'planification'] as const)}>
          {(m) => (
            <button
              type="button"
              role="radio"
              aria-checked={props.mode() === m}
              title={MODE_TITLES[m]}
              class={cx(
                'min-h-[28px] rounded-[5px] px-3 py-1 font-mono text-2xs font-bold uppercase tracking-wider transition-colors',
                props.mode() === m ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground',
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
          <span class="px-1.5 font-mono text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Statut
          </span>
          <For each={STATUS_FILTER_CHIPS}>
            {({ k, label }) => (
              <button
                type="button"
                aria-pressed={store.statusActive(k)}
                class={cx(
                  'min-h-[28px] rounded-[5px] px-2.5 py-1 font-mono text-2xs font-bold uppercase tracking-wider transition-colors',
                  store.statusActive(k) ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground',
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
          <span class="px-1.5 font-mono text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Atelier
          </span>
          <For each={orderStore.ateliers()}>
            {(a) => (
              <button
                type="button"
                aria-pressed={orderStore.atelierFilter().has(a.code)}
                title={a.code}
                onClick={() => orderStore.toggleAtelier(a.code)}
                class={cx(
                  'min-h-[28px] rounded-[5px] px-2 py-1 font-mono text-2xs font-bold uppercase tracking-wider transition-colors',
                  orderStore.atelierFilter().has(a.code)
                    ? 'bg-brand-soft text-brand'
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
              aria-label="Effacer le filtre atelier"
              onClick={() => orderStore.clearAtelier()}
              class="ml-0.5 font-mono text-2xs font-bold uppercase tracking-wider text-brand hover:underline"
            >
              ✕
            </button>
          </Show>
        </div>
      </Show>

      {/* Filtre type de besoin (COMMANDE / PRÉVISION) — mode planification. */}
      <Show when={props.mode() === 'planification'}>
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Besoin
          </span>
          <For each={BESOIN_CHIPS}>
            {(n) => (
              <button
                type="button"
                aria-pressed={orderStore.natureFilter().has(n.k)}
                onClick={() => orderStore.toggleNature(n.k)}
                class={cx(
                  'min-h-[28px] rounded-[5px] px-2.5 py-1 font-mono text-2xs font-bold uppercase tracking-wider transition-colors',
                  orderStore.natureFilter().has(n.k)
                    ? 'bg-brand-soft text-brand'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {n.label}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* #57 — bascule mode scénario (combiné seulement) : les gestes alimentent
          un scénario au lieu de PATCHer en direct.
          #62 (lot 3) : disabled + tooltip hors mode Combiné plutôt que caché. */}
      <Show when={props.onToggleScenario}>
        <button
          type="button"
          disabled={props.mode() !== 'combined'}
          aria-pressed={props.scenarioActive?.() ?? false}
          title={
            props.mode() === 'combined'
              ? 'Mode scénario : les déplacements alimentent un scénario (aucun envoi X3)'
              : 'Disponible en mode Combiné uniquement'
          }
          onClick={() => props.onToggleScenario?.()}
          class={cx(
            'inline-flex min-h-[28px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40',
            props.scenarioActive?.()
              ? 'border-brand bg-brand text-white'
              : 'border-rule bg-card text-foreground hover:border-brand hover:text-brand',
          )}
        >
          <span class="material-symbols-outlined text-sm">science</span>
          Scénario
        </button>
      </Show>

      {/* Calendrier — conservé seul à l'impression (data-print-keep). */}
      <div data-print-keep class="relative">
        <button
          type="button"
          aria-label={`Fenêtre : ${props.dateRange}${props.calOpen() ? ' — fermer' : ' — ouvrir'}`}
          aria-expanded={props.calOpen()}
          onClick={() => props.setCalOpen((o) => !o)}
          class="flex items-center gap-1.5 rounded-full border border-rule bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:border-brand"
        >
          <span class="material-symbols-outlined text-sm text-muted-foreground">calendar_month</span>
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
          <div
            class="absolute left-0 top-full z-50 mt-2"
            onKeyDown={onEscapeClose(() => props.setCalOpen(() => false))}
          >
            <Calendar mode="range" range={props.range()} onRangeChange={props.applyRange} />
          </div>
        </Show>
      </div>

      {/* Faisabilité — déclencheur + mode. Pilote le store ACTIF : orderStore en mode
          planification (badges par ligne de commande, dérivés des OF rattachés via
          /board-feasibility orders[]), store OF sinon (badges par OF). Aucune logique
          de calcul dupliquée — même endpoint, parsé différemment. Issues #24, #21. */}
      <div class="flex items-center gap-2.5">
        {/* Mode d'allocation stock — choix exclusif (segment, parité /ordonnancement).
            #62 (lot 1) : radiogroup sémantique. */}
        <div
          class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5"
          role="radiogroup"
          aria-label="Mode d'allocation du stock"
        >
          <span class="px-1.5 font-mono text-2xs font-bold uppercase tracking-wider text-muted-foreground">
            Stock
          </span>
          <button
            type="button"
            role="radio"
            aria-checked={props.feasMode() === 'immediate'}
            title="Stock vu en intégralité par chaque OF"
            onClick={() => props.setFeasMode('immediate')}
            class={cx(
              'rounded-[5px] px-2.5 py-1 font-mono text-2xs font-bold uppercase tracking-wider transition-colors',
              props.feasMode() === 'immediate' ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Instantanée
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={props.feasMode() === 'sequential'}
            title="Stock consommé OF par OF selon priorité"
            onClick={() => props.setFeasMode('sequential')}
            class={cx(
              'rounded-[5px] px-2.5 py-1 font-mono text-2xs font-bold uppercase tracking-wider transition-colors',
              props.feasMode() === 'sequential' ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Projetée
          </button>
        </div>

        <button
          type="button"
          disabled={props.refreshing()}
          onClick={props.doRefresh}
          class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-xs font-semibold transition-colors hover:border-brand disabled:opacity-60"
          title="Recharger les données X3 (cache → re-fetch live), sans recharger la page"
        >
          <span class={`material-symbols-outlined text-sm text-muted-foreground ${props.refreshing() ? 'animate-spin' : ''}`}>
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
