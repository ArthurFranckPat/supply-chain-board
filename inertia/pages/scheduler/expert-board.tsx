import { createEffect, createSignal, For, on, Show, type Component } from 'solid-js'
import { Link, router } from '@/lib/inertia-solid'
import { createBoardStore } from '@/lib/board/store'
import type { BoardData } from '@/lib/board/types'
import { cx } from '@/libs/cva'
import { route } from '@/lib/routes'
import BoardGrid from '@/components/board/board-grid'
import OfDetailSheet from '@/components/of/of-detail-sheet'
import { Button } from '@/components/ui/button'
import { TextField, TextFieldInput } from '@/components/ui/text-field'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Calendar, type DateRange } from '@/components/ui/calendar'

type ExpertBoardProps = {
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

const ExpertBoard: Component<ExpertBoardProps> = (props) => {
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
      { defer: true },
    ),
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
      const days = Math.round((startOfDay(r.end).getTime() - startOfDay(r.start).getTime()) / DAY_MS) + 1
      router.visit(route('scheduler.expert_board'), {
        data: { start: toIso(r.start), days: String(days) },
        preserveScroll: true,
      })
    }
  }

  const navCls = (active?: boolean) =>
    `border-b-2 px-3.5 py-2.5 text-[12px] font-semibold transition-colors ${
      active ? 'border-terra text-terra' : 'border-transparent text-secondary-foreground hover:text-terra'
    }`

  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground">
      {/* ═══ Masthead ═══ */}
      <header class="flex-none border-b border-rule bg-background">
        <div class="flex items-end justify-between gap-5 px-7 pb-2 pt-3.5">
          <div class="flex items-baseline gap-3.5">
            <div class="font-fraunces text-[28px] font-black leading-[0.9] tracking-tight">
              Factory<span class="font-medium italic text-terra">OS</span>
            </div>
            <div class="pb-1 font-mono text-[10px] font-medium tracking-[0.12em] text-muted-foreground">
              Ordonnancement · Édition quotidienne
            </div>
          </div>
          <div class="text-right font-mono text-[11px] font-medium leading-relaxed text-muted-foreground">
            <div class="font-fraunces text-[12px] font-bold not-italic text-terra">{props.weekLabel}</div>
            <div>
              Fenêtre <b class="font-bold text-foreground">{props.horizon} j</b> ·{' '}
              <b class="font-bold text-foreground">{props.totalOf}</b> OF ·{' '}
              <b class="font-bold text-foreground">{props.lineCount}</b> postes
            </div>
          </div>
        </div>

        <nav class="flex items-center gap-1 border-t border-rule px-7">
          <a href="#" class={navCls()}>Tableau</a>
          <Link href={route('order_planning.board')} class={navCls()}>Planification</Link>
          <Link href={route('scheduler.expert_board')} class={navCls(true)}>Ordonnancement</Link>
          <Link href={route('scheduler.shortage_tracker')} class={navCls()}>Ruptures</Link>
          <a href="#" class={navCls()}>Ressources</a>

          {/* Recherche (pill) + portée — séparés pour éviter tout chevauchement */}
          <div class="ml-auto flex items-center gap-2 py-1.5">
            <TextField class="contents">
              <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25">
                <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
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
            <Select
              title="Portée de la recherche"
              value={store.scope()}
              onChange={(v) => store.onScopeChange(v as (typeof SCOPES)[number]['v'])}
              options={SCOPES.map((s) => s.v)}
              disallowEmptySelection
              optionTextValue={(o: string) => SCOPES.find((s) => s.v === o)?.label ?? o}
            >
              <SelectTrigger
                class="h-[30px] w-[92px] rounded-full border border-rule bg-card px-3 text-[11px] font-semibold"
                aria-label="Portée de la recherche"
              >
                <SelectValue<string>>
                  {(state) => SCOPES.find((s) => s.v === state.selectedOption())?.label ?? 'Portée'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <For each={SCOPES}>
                  {(s) => (
                    // @ts-expect-error — Kobalte Select.Item exige `item: CollectionNode` non exposé ici
                    <SelectItem value={s.v}>{s.label}</SelectItem>
                  )}
                </For>
              </SelectContent>
            </Select>
            <div class="flex size-7 items-center justify-center rounded-full bg-terra font-mono text-[10px] font-bold text-card">
              OP
            </div>
          </div>
        </nav>
      </header>

      {/* ═══ Toolbar ═══ */}
      <div class="flex flex-none flex-wrap items-center justify-between gap-3 border-b border-rule px-7 py-2">
        {/* Calendrier (remplace nav semaine + horizon) */}
        <div class="relative">
          <button
            type="button"
            onClick={() => setCalOpen((o) => !o)}
            class="flex items-center gap-1.5 rounded-full border border-rule bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:border-terra"
          >
            <span class="material-symbols-outlined text-[14px] text-muted-foreground">calendar_month</span>
            {props.dateRange}
            <span class="material-symbols-outlined text-[16px] text-muted-foreground">expand_more</span>
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
                store.mode() === 'immediate' ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground',
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
                store.mode() === 'sequential' ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground',
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
            <span class="material-symbols-outlined text-[15px]">
              {store.feasLoading() ? 'progress_activity' : 'fact_check'}
            </span>
            {store.feasLoading() ? 'Calcul…' : 'Faisabilité'}
          </Button>
        </div>
      </div>

      {/* X3 injoignable */}
      <Show when={props.x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-terra/30 bg-terra-soft px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-terra">warning</span>
          X3 injoignable — données {props.cached ? `du cache (${props.cached})` : 'indisponibles'}.
          <Link href={`${route('scheduler.expert_board')}?refresh=1`} class="font-bold underline">
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

      <OfDetailSheet num={selectedOf()} open={detailOpen()} onOpenChange={setDetailOpen} />
    </div>
  )
}

export default ExpertBoard
