import { For, createEffect, createSignal, on, Show, type Component } from 'solid-js'
import { Link, router } from '@/lib/inertia-solid'
import { createBoardStore } from '@/lib/board/store'
import type { BoardData } from '@/lib/board/types'
import { cx } from '@/libs/cva'
import { route } from '@/lib/routes'
import BoardGrid from '@/components/board/board-grid'
import BatchFirmBar from '@/components/board/batch-firm-bar'
import OfDetailSheet from '@/components/of/of-detail-sheet'
import { Masthead } from '@/components/masthead'
import { Button } from '@/components/ui/button'
import { TextField, TextFieldInput } from '@/components/ui/text-field'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Calendar, type DateRange } from '@/components/ui/calendar'

type SchedulingProps = {
  board: BoardData
  windowFrom: string
  windowTo: string
  horizon: number
  dateRange: string
  weekLabel: string
  prevHref: string
  nextHref: string
  todayHref: string
  totalOf: number
  lineCount: number
  x3Error: string | null
  cached: string | null
}

const SCOPES = [
  { v: 'poste', label: 'Poste' },
  { v: 'of', label: 'OF' },
  { v: 'pf', label: 'PF' },
  { v: 'composant', label: 'Composant' },
] as const

/** Chips de filtre par statut d'OF (clés canoniques card.status, sans accent). */
const STATUS_FILTER_CHIPS: { k: 'ferme' | 'planifie' | 'suggere'; label: string }[] = [
  { k: 'ferme', label: 'Ferme' },
  { k: 'planifie', label: 'Planifié' },
  { k: 'suggere', label: 'Suggéré' },
]

const DAY_MS = 86_400_000

const parseIso = (s: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}
const toIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const startOfDay = (d: Date): Date => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const Scheduling: Component<SchedulingProps> = (props) => {
  const store = createBoardStore(props.board)

  const [selectedOf, setSelectedOf] = createSignal<string | null>(null)
  const [detailOpen, setDetailOpen] = createSignal(false)
  const onSelectOf = (num: string) => {
    setSelectedOf(num)
    setDetailOpen(true)
  }

  createEffect(
    on(
      () => props.board,
      (next, prev) => {
        if (prev !== undefined && next !== prev) store.reset(next)
      },
      { defer: true }
    )
  )

  // Calendrier (remplace nav semaine + horizon).
  const [calOpen, setCalOpen] = createSignal(false)
  const [range, setRange] = createSignal<DateRange>({
    start: parseIso(props.windowFrom),
    end: parseIso(props.windowTo),
  })
  const applyRange = (r: DateRange) => {
    setRange(r)
    if (r.start && r.end) {
      setCalOpen(false)
      const days =
        Math.round((startOfDay(r.end).getTime() - startOfDay(r.start).getTime()) / DAY_MS) + 1
      router.visit(route('scheduling'), {
        data: { start: toIso(r.start), days: String(days) },
        preserveScroll: true,
      })
    }
  }

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Ordonnancement · Édition quotidienne"
        active="programme"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold not-italic text-brand">
              {props.weekLabel}
            </div>
            <div>
              Fenêtre <b class="font-bold text-foreground">{props.horizon} j</b> ·{' '}
              <b class="font-bold text-foreground">{props.totalOf}</b> OF ·{' '}
              <b class="font-bold text-foreground">{props.lineCount}</b> postes
            </div>
          </>
        }
        actions={
          <>
            <TextField class="contents">
              <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
                <span class="material-symbols-outlined text-[17px] text-muted-foreground">
                  search
                </span>
                <TextFieldInput
                  class="w-[180px] border-0 bg-transparent px-0 text-[12px] font-medium shadow-none focus-visible:ring-0"
                  placeholder="OF, article, poste…"
                  type="text"
                  autocomplete="off"
                  value={store.query()}
                  onInput={(e) => store.onQueryInput(e.currentTarget.value)}
                />
              </div>
            </TextField>
            <Select<string>
              title="Portée de la recherche"
              value={store.scope()}
              onChange={(v) => v && store.onScopeChange(v as (typeof SCOPES)[number]['v'])}
              options={SCOPES.map((s) => s.v)}
              disallowEmptySelection
              optionTextValue={(o) => SCOPES.find((s) => s.v === o)?.label ?? o}
              itemComponent={(itemProps) => (
                <SelectItem item={itemProps.item}>
                  {SCOPES.find((s) => s.v === itemProps.item.rawValue)?.label ??
                    itemProps.item.rawValue}
                </SelectItem>
              )}
            >
              <SelectTrigger
                class="h-[30px] w-[92px] rounded-full border border-rule bg-card px-3 text-[11px] font-semibold"
                aria-label="Portée de la recherche"
              >
                <SelectValue<string>>
                  {(state) => SCOPES.find((s) => s.v === state.selectedOption())?.label ?? 'Portée'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </>
        }
      />

      {/* ═══ Toolbar ═══ */}
      <div class="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-rule px-7 py-2">
        {/* Filtre statut d'OF (Ferme / Planifié / Suggéré) */}
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
            Statut
          </span>
          <For each={STATUS_FILTER_CHIPS}>
            {({ k, label }) => (
              <button
                type="button"
                class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  store.statusActive(k)
                    ? 'bg-brand-soft text-brand'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => store.toggleStatus(k)}
              >
                {label}
              </button>
            )}
          </For>
        </div>

        {/* Calendrier (remplace nav semaine + horizon) */}
        <div class="relative">
          <button
            type="button"
            onClick={() => setCalOpen((o) => !o)}
            class="flex items-center gap-1.5 rounded-full border border-rule bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-brand"
          >
            <span class="material-symbols-outlined text-[14px] text-muted-foreground">
              calendar_month
            </span>
            {props.dateRange}
            <span class="material-symbols-outlined text-[16px] text-muted-foreground">
              expand_more
            </span>
          </button>
          <Show when={calOpen()}>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              class="fixed inset-0 z-40 cursor-default"
              onClick={() => setCalOpen(false)}
            />
            <div class="absolute left-0 top-full z-50 mt-2">
              <Calendar mode="range" range={range()} onRangeChange={applyRange} />
            </div>
          </Show>
        </div>

        <div class="flex items-center gap-2.5">
          {/* Mode d'allocation stock — choix exclusif (segment raffiné) */}
          <div class="inline-flex rounded-md border border-rule bg-card p-0.5">
            <button
              type="button"
              title="Stock vu en intégralité par chaque OF"
              onClick={() => store.setMode('immediate')}
              class={cx(
                'rounded-[5px] px-3 py-1 text-[12px] font-semibold transition-colors',
                store.mode() === 'immediate'
                  ? 'bg-brand-soft text-brand'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Instantanée
            </button>
            <button
              type="button"
              title="Stock consommé OF par OF selon priorité"
              onClick={() => store.setMode('sequential')}
              class={cx(
                'rounded-[5px] px-3 py-1 text-[12px] font-semibold transition-colors',
                store.mode() === 'sequential'
                  ? 'bg-brand-soft text-brand'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Projetée
            </button>
          </div>

          <Button
            size="sm"
            disabled={store.feasLoading()}
            onClick={() => store.runFeasibility(props.windowFrom, props.windowTo)}
            class="gap-1.5"
          >
            <span
              class={`material-symbols-outlined text-[15px] ${store.feasLoading() ? 'animate-spin' : ''}`}
            >
              {store.feasLoading() ? 'progress_activity' : 'fact_check'}
            </span>
            {store.feasLoading() ? 'Calcul…' : 'Faisabilité'}
          </Button>

          {/* Sélection multi-OF → affermissement en batch (#34) */}
          <Button
            size="sm"
            variant={store.selectMode() ? 'default' : 'outline'}
            onClick={() => (store.selectMode() ? store.exitSelect() : store.enterSelect())}
            class="gap-1.5"
          >
            <span class="material-symbols-outlined text-[15px]">checklist</span>
            Sélection
          </Button>
        </div>
      </div>

      {/* X3 injoignable */}
      <Show when={props.x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-brand/30 bg-brand-soft px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-brand">warning</span>
          X3 injoignable — données {props.cached ? `du cache (${props.cached})` : 'indisponibles'}.
          <Link href={`${route('scheduling')}?refresh=1`} class="font-bold underline">
            Réessayer
          </Link>
        </div>
      </Show>

      {/* ═══ Board ═══ */}
      <Show
        when={props.lineCount > 0}
        fallback={
          <div class="flex flex-1 items-center justify-center p-10 font-fraunces text-[14px] italic text-muted-foreground">
            Aucun OF planifiable dans la fenêtre (vérifier gammes / dates OF).
          </div>
        }
      >
        <div class="flex-1 overflow-hidden">
          <BoardGrid store={store} onSelectOf={onSelectOf} />
        </div>
      </Show>

      <OfDetailSheet
        num={selectedOf()}
        open={detailOpen()}
        onOpenChange={setDetailOpen}
        onFirmed={(oldId, newId) => store.transformCard(oldId, newId)}
      />
      <BatchFirmBar store={store} />
    </div>
  )
}

export default Scheduling
