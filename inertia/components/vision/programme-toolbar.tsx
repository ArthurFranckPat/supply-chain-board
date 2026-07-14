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

/** Programme v2 — grammaire visuelle unifiée : 2 styles seulement.
 *  • Segment (rounded-lg) pour les choix groupés exclusifs (mode, stock, liens).
 *  • Pill (rounded-full) pour les actions et toggles (fenêtre, actualiser, etc.).
 *  Plus de mix rounded-md / rounded-full / shadcn-button. */
const SEG = 'inline-flex items-center gap-0.5 rounded-lg border border-rule bg-card p-0.5'
const SEG_BTN_ON =
  'min-h-[28px] rounded-md px-3 py-1 font-sans text-2xs font-bold bg-brand-soft text-brand transition-colors'
const SEG_BTN_OFF =
  'min-h-[28px] rounded-md px-3 py-1 font-sans text-2xs font-bold text-muted-foreground hover:text-foreground transition-colors'
const SEG_LBL = 'px-1.5 font-sans text-3xs font-bold text-muted-foreground'
const CONTEXT_PILL =
  'inline-flex min-h-[28px] items-center gap-1 rounded-full border px-2.5 py-0.5 font-sans text-2xs font-bold transition-colors cursor-pointer'
const PILL =
  'inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 py-1 text-xs font-semibold text-foreground transition-colors hover:border-brand'

/**
 * Toolbar de la page Programme — rangée COMMANDE (48px fixe).
 * Programme v2 : ne contient que l'identité de la page (mode, fenêtre,
 * actions). Les filtres sont descendus dans le contexte-row.
 */
export function ProgrammeToolbar(props: {
  mode: Accessor<VisionMode>
  switchMode: (m: VisionMode) => void
  store: BoardStore
  orderStore: OrderBoardStore
  feasLoading: Accessor<boolean>
  runFeasibility: () => void
  refreshing: Accessor<boolean>
  doRefresh: () => void
  dateRange: string
  calOpen: Accessor<boolean>
  setCalOpen: (fn: (o: boolean) => void) => void
  range: Accessor<DateRange>
  applyRange: (r: DateRange) => void
  scenarioActive?: Accessor<boolean>
  onToggleScenario?: () => void
}) {
  const { store } = props
  return (
    <div
      data-print-toolbar
      class="flex flex-none flex-wrap items-center gap-2.5 border-b border-rule px-7 py-2 min-h-[48px]"
    >
      {/* Mode — segment */}
      <div class={SEG} role="radiogroup" aria-label="Mode d'affichage">
        <For each={['ordonnancement', 'combined', 'planification'] as const}>
          {(m) => (
            <button
              type="button"
              role="radio"
              aria-checked={props.mode() === m}
              title={MODE_TITLES[m]}
              class={props.mode() === m ? SEG_BTN_ON : SEG_BTN_OFF}
              onClick={() => props.switchMode(m)}
            >
              {MODE_LABELS[m]}
            </button>
          )}
        </For>
      </div>

      {/* Fenêtre — pill, conservée à l'impression */}
      <div data-print-keep class="relative">
        <button
          type="button"
          aria-label={`Fenêtre : ${props.dateRange}${props.calOpen() ? ' — fermer' : ' — ouvrir'}`}
          aria-expanded={props.calOpen()}
          onClick={() => props.setCalOpen((o) => !o)}
          class={PILL}
        >
          <span class="material-symbols-outlined text-sm text-muted-foreground">
            calendar_month
          </span>
          {props.dateRange}
          <span class="material-symbols-outlined text-[16px] text-muted-foreground">
            expand_more
          </span>
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

      {/* Actualiser — pill */}
      <button
        type="button"
        disabled={props.refreshing()}
        onClick={props.doRefresh}
        class={cx(PILL, 'disabled:opacity-60')}
        title="Recharger les données X3 (cache → re-fetch live)"
      >
        <span
          class={`material-symbols-outlined text-sm text-muted-foreground ${props.refreshing() ? 'animate-spin' : ''}`}
        >
          refresh
        </span>
        {props.refreshing() ? 'Actualisation…' : 'Actualiser'}
      </button>

      <div class="flex-1" />

      {/* Scénario — pill toggle (tous modes, disabled hors Combiné) */}
      <Show when={props.onToggleScenario}>
        <button
          type="button"
          disabled={props.mode() !== 'combined'}
          aria-pressed={props.scenarioActive?.() ?? false}
          title={
            props.mode() === 'combined'
              ? 'Mode scénario (aucun envoi X3)'
              : 'Disponible en mode Combiné'
          }
          onClick={() => props.onToggleScenario?.()}
          class={cx(
            PILL,
            'disabled:cursor-not-allowed disabled:opacity-40',
            props.scenarioActive?.() && '!border-brand !bg-brand !text-white'
          )}
        >
          <span class="material-symbols-outlined text-sm">science</span>
          Scénario
        </button>
      </Show>

      {/* Faisabilité — pill (primary) */}
      <button
        type="button"
        disabled={props.feasLoading()}
        onClick={props.runFeasibility}
        class={cx(PILL, '!border-transparent !bg-foreground !text-background disabled:opacity-60')}
      >
        <span
          class={`material-symbols-outlined text-sm ${props.feasLoading() ? 'animate-spin' : ''}`}
        >
          {props.feasLoading() ? 'progress_activity' : 'fact_check'}
        </span>
        {props.feasLoading() ? 'Calcul…' : 'Faisabilité'}
      </button>

      {/* Sélection — pill (OF uniquement) */}
      <Show when={props.mode() !== 'planification'}>
        <button
          type="button"
          aria-pressed={store.selectMode()}
          onClick={() => (store.selectMode() ? store.exitSelect() : store.enterSelect())}
          class={cx(PILL, store.selectMode() && '!border-brand !bg-brand-soft !text-brand')}
        >
          <span class="material-symbols-outlined text-sm">checklist</span>
          Sélection
        </button>
      </Show>
    </div>
  )
}

/**
 * Programme v2 — rangée CONTEXTE (40px fixe). Filtres du mode courant +
 * segment Liens + santé du plan + bouton rail. Hauteur constante, zéro CLS.
 */
export function ProgrammeContextBar(props: {
  mode: Accessor<VisionMode>
  store: BoardStore
  orderStore: OrderBoardStore
  feasMode: Accessor<'immediate' | 'sequential'>
  setFeasMode: (m: 'immediate' | 'sequential') => void
  children?: JSX.Element
}) {
  const { store, orderStore } = props
  return (
    <div class="flex flex-none items-center gap-2.5 border-b border-rule bg-muted/30 px-7 py-1.5 min-h-[40px]">
      {/* Statut — Pills (OF / Combiné) */}
      <Show when={props.mode() !== 'planification'}>
        <div class="flex items-center gap-1.5">
          <span class="font-sans text-3xs font-bold text-muted-foreground">Statut</span>
          <div class="flex items-center gap-1">
            <For each={STATUS_FILTER_CHIPS}>
              {({ k, label }) => {
                const active = () => store.statusActive(k)
                return (
                  <button
                    type="button"
                    aria-pressed={active()}
                    class={cx(
                      CONTEXT_PILL,
                      active()
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-rule bg-card text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                    )}
                    onClick={() => store.toggleStatus(k)}
                  >
                    {label}
                  </button>
                )
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Atelier — select dropdown (tous modes) */}
      {(() => {
        const isPlan = props.mode() === 'planification'
        const currentStore = isPlan ? props.orderStore : props.store
        const ateliers = currentStore.ateliers()
        const activeFilter = () => {
          return isPlan ? props.orderStore.atelierFilter() : props.store.atelierFilter()
        }
        return (
          <Show when={ateliers.length > 0}>
            <div class="flex items-center gap-1.5">
              <span class="font-sans text-3xs font-bold text-muted-foreground">Atelier</span>
              <select
                value={activeFilter()}
                onChange={(e) => {
                  const val = e.currentTarget.value
                  props.store.setAtelier(val)
                  props.orderStore.setAtelier(val)
                }}
                class="h-[28px] rounded-full border border-rule bg-card px-2.5 text-2xs font-bold text-foreground focus:border-brand focus:outline-none cursor-pointer"
              >
                <option value="">Tous</option>
                <For each={ateliers}>
                  {(a) => <option value={a.code}>{a.label}</option>}
                </For>
              </select>
            </div>
          </Show>
        )
      })()}

      {/* Besoin — Pills (Planification) */}
      <Show when={props.mode() === 'planification'}>
        <div class="flex items-center gap-1.5">
          <span class="font-sans text-3xs font-bold text-muted-foreground">Besoin</span>
          <div class="flex items-center gap-1">
            <For each={BESOIN_CHIPS}>
              {(n) => {
                const active = () => orderStore.natureFilter().has(n.k)
                return (
                  <button
                    type="button"
                    aria-pressed={active()}
                    class={cx(
                      CONTEXT_PILL,
                      active()
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-rule bg-card text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                    )}
                    onClick={() => orderStore.toggleNature(n.k)}
                  >
                    {n.label}
                  </button>
                )
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Stock allocation — segment (tous modes) */}
      <div class={SEG} role="radiogroup" aria-label="Mode d'allocation du stock">
        <span class={SEG_LBL}>Stock</span>
        <button
          type="button"
          role="radio"
          aria-checked={props.feasMode() === 'immediate'}
          title="Stock vu en intégralité par chaque OF"
          class={props.feasMode() === 'immediate' ? SEG_BTN_ON : SEG_BTN_OFF}
          onClick={() => props.setFeasMode('immediate')}
        >
          Instantanée
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={props.feasMode() === 'sequential'}
          title="Stock consommé OF par OF selon priorité"
          class={props.feasMode() === 'sequential' ? SEG_BTN_ON : SEG_BTN_OFF}
          onClick={() => props.setFeasMode('sequential')}
        >
          Projetée
        </button>
      </div>

      {/* Liens segment + PlanHealth + Rail : injectés via children (programme.tsx) */}
      {props.children}
    </div>
  )
}
