import { createEffect, createSignal, For, on, Show, type Component } from 'solid-js'
import { router } from '@/lib/inertia-solid'
import { createOrderBoardStore } from '@/lib/orders/store'
import type { OrderBoardData, OrderSearchScope } from '@/lib/orders/types'
import { cx } from '@/libs/cva'
import { route } from '@/lib/routes'
import OrderGrid from '@/components/board/order-grid'
import OrderDetailSheet from '@/components/orders/order-detail-sheet'
import { Masthead } from '@/components/masthead'
import { TextField, TextFieldInput } from '@/components/ui/text-field'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Calendar, type DateRange } from '@/components/ui/calendar'

type PlanningProps = {
  board: OrderBoardData
  totalLines: number
  lineCount: number
  horizon: number
  windowFrom: string
  windowTo: string
  dateRange: string
  weekLabel: string
  prevHref: string
  nextHref: string
  todayHref: string
  x3Error: string | null
}

const SCOPES = [
  { v: 'poste', label: 'Poste' },
  { v: 'commande', label: 'Commande' },
  { v: 'article', label: 'Article' },
  { v: 'client', label: 'Client' },
] as const

const TYPES = ['MTS', 'MTO', 'NOR'] as const
const NATURES = [
  { v: 'COMMANDE', label: 'Commande' },
  { v: 'PREVISION', label: 'Prévision' },
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

const Planning: Component<OrderBoardProps> = (props) => {
  const store = createOrderBoardStore(props.board)

  // Détail ligne de commande : drawer contextuel au clic sur une carte.
  const [selectedLine, setSelectedLine] = createSignal<string | null>(null)
  const [detailOpen, setDetailOpen] = createSignal(false)
  const onSelectCard = (id: string) => {
    setSelectedLine(id)
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
      router.visit(route('planning'), {
        data: { start: toIso(r.start), days: String(days) },
        preserveScroll: true,
      })
    }
  }

  const chipCls = (active: boolean) =>
    cx(
      'rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
      active ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground',
    )

  return (
    <div class="theme-papier flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Planification · Lignes de commande ouvertes"
        active="planification"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold not-italic text-terra">{props.weekLabel}</div>
            <div>
              Fenêtre <b class="font-bold text-foreground">{props.horizon} j</b> ·{' '}
              <b class="font-bold text-foreground">{props.totalLines}</b> ligne
              {props.totalLines > 1 ? 's' : ''} ·{' '}
              <b class="font-bold text-foreground">{props.lineCount}</b> postes
            </div>
          </>
        }
        actions={
          <>
            <TextField class="contents">
              <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25">
                <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
                <TextFieldInput
                  class="w-[180px] border-0 bg-transparent px-0 text-[12px] font-medium shadow-none focus-visible:ring-0"
                  placeholder="Commande, article, client…"
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
              onChange={(v) => v && store.onScopeChange(v as OrderSearchScope)}
              options={SCOPES.map((s) => s.v)}
              disallowEmptySelection
              optionTextValue={(o) => SCOPES.find((s) => s.v === o)?.label ?? o}
              itemComponent={(itemProps) => (
                <SelectItem item={itemProps.item}>
                  {SCOPES.find((s) => s.v === itemProps.item.rawValue)?.label ?? itemProps.item.rawValue}
                </SelectItem>
              )}
            >
              <SelectTrigger
                class="h-[30px] w-[100px] rounded-full border border-rule bg-card px-3 text-[11px] font-semibold"
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
          {/* Filtre type commande */}
          <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Type</span>
            <For each={TYPES}>
              {(t) => (
                <button type="button" class={chipCls(store.typeFilter().has(t))} onClick={() => store.toggleType(t)}>
                  {t}
                </button>
              )}
            </For>
          </div>

          {/* Filtre nature besoin */}
          <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Besoin</span>
            <For each={NATURES}>
              {(n) => (
                <button type="button" class={chipCls(store.natureFilter().has(n.v))} onClick={() => store.toggleNature(n.v)}>
                  {n.label}
                </button>
              )}
            </For>
          </div>

          {/* Légende override */}
          <div class="flex items-center gap-1.5 border-l border-rule pl-2.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span class="size-2 rounded-full bg-suggere" /> Override
          </div>
        </div>
      </div>

      {/* X3 injoignable */}
      <Show when={props.x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-terra/30 bg-terra-soft px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-terra">warning</span>
          <span class="font-bold">Erreur chargement planification :</span>
          <span class="font-mono">{props.x3Error}</span>
        </div>
      </Show>

      {/* ═══ Board ═══ */}
      <Show
        when={props.lineCount > 0}
        fallback={
          <div class="flex flex-1 items-center justify-center p-10 font-fraunces text-[14px] italic text-muted-foreground">
            Aucune ligne de commande ouverte dans l'horizon.
          </div>
        }
      >
        <div class="flex-1 overflow-hidden">
          <OrderGrid store={store} onSelectCard={onSelectCard} />
        </div>
      </Show>

      <OrderDetailSheet lineId={selectedLine()} open={detailOpen()} onOpenChange={setDetailOpen} />
    </div>
  )
}

export default Planning
