import { For, Show, createSignal, onCleanup, onMount } from 'solid-js'
import type { BoardStore } from './store'
import type { Card, LineRow, DayCell, SearchScope } from './types'

/**
 * Solid board grid — replaces the SSR grid + the inline IIFE search/filter/load.
 * Cards arrive presentation-baked; reactivity drives only visibility/opacity,
 * the live per-day load + weekly histograms, and optimistic drag&drop.
 *
 * The search input/scope live in the SSR header (#board-search, #board-search-scope);
 * we wire them document-delegated so they survive Unpoly #board-main swaps and are
 * cleaned up when the island is disposed.
 */
export default function BoardGrid(props: { store: BoardStore }) {
  const { store } = props
  const [draggedNumOf, setDraggedNumOf] = createSignal<string | null>(null)
  const [dropCol, setDropCol] = createSignal<string | null>(null)

  onMount(() => {
    const onInput = (e: Event) => {
      const t = e.target as HTMLElement
      if (t?.id === 'board-search') store.onQueryInput((t as HTMLInputElement).value)
    }
    const onChange = (e: Event) => {
      const t = e.target as HTMLElement
      if (t?.id === 'board-search-scope')
        store.onScopeChange((t as HTMLSelectElement).value as SearchScope)
    }
    const onKey = (e: KeyboardEvent) => {
      const input = document.getElementById('board-search') as HTMLInputElement | null
      if (!input) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.focus()
        input.select()
      } else if (e.key === 'Escape' && document.activeElement === input) {
        input.value = ''
        store.clearSearch()
        input.blur()
      }
    }
    document.addEventListener('input', onInput)
    document.addEventListener('change', onChange)
    window.addEventListener('keydown', onKey)
    onCleanup(() => {
      document.removeEventListener('input', onInput)
      document.removeEventListener('change', onChange)
      window.removeEventListener('keydown', onKey)
    })
  })

  return (
    <div class="flex-1 sch-scroll bg-gray-50 border border-gray-200 rounded-sm shadow-sm" style={{ '--cols': String(store.board.cols) }}>
      <div class="sch-head">
        {/* Week band */}
        <div class="grid-expert border-b border-gray-200 bg-gray-100">
          <div class="sch-col-fix p-1.5 border-r border-gray-200 bg-gray-100" />
          <For each={store.board.weekSpans}>
            {(wk) => (
              <div class="p-1.5 text-center border-r border-gray-200" style={{ 'grid-column': `span ${wk.span}` }}>
                <span class="text-[10px] font-bold uppercase tracking-widest mono text-gray-500">Semaine {wk.week}</span>
              </div>
            )}
          </For>
        </div>
        {/* Day row + live per-day load */}
        <div class="grid-expert border-b border-gray-300 bg-gray-50">
          <div class="sch-col-fix p-2 border-r border-gray-200 bg-gray-50 flex items-center justify-between">
            <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mono">Ressource / Ligne</span>
            <span class="material-symbols-outlined text-gray-300 text-sm">unfold_more</span>
          </div>
          <For each={store.board.days}>
            {(day, di) => (
              <div class={`p-2 border-r border-gray-200 text-center ${day.headerTone}`}>
                <div class={`text-[10px] font-bold uppercase mono ${day.today ? 'text-primary' : 'text-gray-400'}`}>{day.short}</div>
                <div class="mt-1">
                  <span class={`text-[11px] font-bold mono ${day.valClass}`}>{Math.round(store.dayLoad()[di()] * 10) / 10}h</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      <div class="bg-gray-50">
        <For each={store.board.lines}>{(line) => <Row store={store} line={line} draggedNumOf={draggedNumOf} setDraggedNumOf={setDraggedNumOf} dropCol={dropCol} setDropCol={setDropCol} />}</For>
      </div>
    </div>
  )
}

function Row(props: {
  store: BoardStore
  line: LineRow
  draggedNumOf: () => string | null
  setDraggedNumOf: (v: string | null) => void
  dropCol: () => string | null
  setDropCol: (v: string | null) => void
}) {
  const { store, line } = props
  return (
    <div
      class="sch-row grid-expert border-b border-gray-200 min-h-[120px]"
      style={{ display: store.lineVisible(line.code) ? '' : 'none' }}
    >
      <div class="sch-col-fix p-3 border-r border-gray-200 bg-white flex flex-col">
        <div class="flex items-center gap-1.5 mb-2">
          <div class={`w-2 h-2 rounded-full ${line.dot}`} />
          <span class="text-xs font-bold text-gray-900 uppercase tracking-tight">{line.name}</span>
        </div>

        <Show when={store.lineWeekLoads(line.code).length > 0}>
          <div class="mb-2 sch-hist">
            <div class="flex items-end gap-1 h-10 relative">
              <div class="absolute left-0 right-0 border-t border-dashed border-gray-300" style={{ top: '0' }} />
              <For each={store.lineWeekLoads(line.code)}>
                {(w) => (
                  <div class="flex-1 flex flex-col justify-end h-full" title={`S${w.week} — ${w.hours}h (${w.pct}%)`}>
                    <div class={`w-full rounded-sm ${w.barClass}`} style={{ height: `${w.pct > 100 ? 100 : w.pct}%`, 'min-height': '2px' }} />
                  </div>
                )}
              </For>
            </div>
            <div class="flex gap-1 mt-0.5">
              <For each={store.lineWeekLoads(line.code)}>
                {(w) => (
                  <div class={`flex-1 text-center text-[8px] font-bold mono ${w.pct > 100 ? 'text-error' : 'text-gray-400'}`}>{w.hours}h</div>
                )}
              </For>
            </div>
          </div>
        </Show>

        <div class="mt-auto space-y-1">
          <For each={line.meta}>
            {(m) => (
              <div class="flex justify-between text-[10px] text-gray-400 mono">
                <span>{m.k}:</span>
                <span class="text-gray-600 font-bold">{m.v}</span>
              </div>
            )}
          </For>
        </div>
      </div>

      <For each={line.dayCells}>
        {(dc, ci) => (
          <Cell
            store={store}
            line={line}
            dc={dc}
            col={ci()}
            draggedNumOf={props.draggedNumOf}
            setDraggedNumOf={props.setDraggedNumOf}
            dropCol={props.dropCol}
            setDropCol={props.setDropCol}
          />
        )}
      </For>
    </div>
  )
}

function Cell(props: {
  store: BoardStore
  line: LineRow
  dc: DayCell
  col: number
  draggedNumOf: () => string | null
  setDraggedNumOf: (v: string | null) => void
  dropCol: () => string | null
  setDropCol: (v: string | null) => void
}) {
  const { store, line, dc, col } = props
  const cellKey = `${line.code}:${col}`
  return (
    <div
      class={`sch-cal-cell p-1.5 border-r border-gray-200 flex flex-col gap-1.5 ${dc.cellClass}`}
      classList={{ 'is-drop': props.dropCol() === cellKey }}
      onDragOver={(e) => {
        if (!props.draggedNumOf()) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        props.setDropCol(cellKey)
      }}
      onDrop={(e) => {
        const num = props.draggedNumOf()
        props.setDropCol(null)
        if (!num) return
        e.preventDefault()
        store.moveCard(num, line.code, col, dc.iso)
      }}
    >
      <For each={dc.cards}>
        {(card) => (
          <CardView
            store={store}
            card={card}
            line={line}
            setDraggedNumOf={props.setDraggedNumOf}
            setDropCol={props.setDropCol}
          />
        )}
      </For>
    </div>
  )
}

function CardView(props: {
  store: BoardStore
  card: Card
  line: LineRow
  setDraggedNumOf: (v: string | null) => void
  setDropCol: (v: string | null) => void
}) {
  const { store, card, line } = props
  const matches = () => store.cardMatches(card, line.code)
  return (
    <a
      href={card.href}
      up-layer="new drawer"
      up-position="right"
      up-target="#sch-detail-panel"
      draggable={matches()}
      data-num-of={card.id}
      class={`sch-of-card relative block bg-white border border-gray-200 rounded p-1.5 ${card.accentClass} ${card.cardClass}`}
      style={{ opacity: matches() ? '' : '0.15' }}
      onDragStart={(e) => {
        props.setDraggedNumOf(card.id)
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', card.id)
        }
      }}
      onDragEnd={() => {
        props.setDraggedNumOf(null)
        props.setDropCol(null)
      }}
    >
      <div class="flex items-baseline justify-between gap-1.5">
        <span class="flex items-baseline gap-1 min-w-0">
          <span class={`mono text-[10px] font-bold ${card.idTone} truncate`}>{card.id}</span>
          <Show when={card.article}>
            <span class={`mono text-[9px] ${card.fieldValTone} truncate`}>{card.article}</span>
          </Show>
        </span>
        <Show when={card.metric}>
          <span class={`mono text-[10px] font-semibold ${card.fieldValTone} shrink-0`}>{card.metric}</span>
        </Show>
      </div>
      <p class={`text-[12px] font-semibold leading-tight truncate ${card.textTone}`}>{card.title}</p>
    </a>
  )
}
