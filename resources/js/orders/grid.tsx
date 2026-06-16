import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js'
import type { OrderBoardStore } from './store'
import type { OrderCard, OrderLineRow, OrderSearchScope, DayCell } from './types'

/**
 * Solid grid du board planification (issue #10).
 * Grille semaine × poste ; drag en temps seul ; bouton "réinitialiser" sur cartes overridées.
 * Réutilise .sch-scroll / .sch-col-fix / .grid-expert / .sch-of-card (déjà définis
 * dans resources/css/app.css pour la grille d'ordonnancement).
 */
export default function OrderGrid(props: { store: OrderBoardStore }) {
  const { store } = props
  const [draggedId, setDraggedId] = createSignal<string | null>(null)
  const [dropCol, setDropCol] = createSignal<string | null>(null)

  onMount(() => {
    const onInput = (e: Event) => {
      const t = e.target as HTMLElement
      if (t?.id === 'order-search') store.onQueryInput((t as HTMLInputElement).value)
    }
    const onChange = (e: Event) => {
      const t = e.target as HTMLElement
      if (t?.id === 'order-search-scope')
        store.onScopeChange((t as HTMLSelectElement).value as OrderSearchScope)
    }
    // Cases à cocher type/nature : vivent dans le header SSR, câblées delegated.
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      const typeBtn = t.closest('[data-type-filter]')
      if (typeBtn) {
        store.toggleType(typeBtn.getAttribute('data-type-filter')!)
        return
      }
      const natBtn = t.closest('[data-nature-filter]')
      if (natBtn) {
        store.toggleNature(natBtn.getAttribute('data-nature-filter')!)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      const input = document.getElementById('order-search') as HTMLInputElement | null
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
    document.addEventListener('click', onClick)
    window.addEventListener('keydown', onKey)
    onCleanup(() => {
      document.removeEventListener('input', onInput)
      document.removeEventListener('change', onChange)
      document.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
    })
  })

  // Chrome réactif des cases à cocher SSR : reflète l'état du store sur le DOM.
  createEffect(() => {
    const types = store.typeFilter()
    document.querySelectorAll<HTMLElement>('[data-type-filter]').forEach((el) => {
      el.classList.toggle('is-on', types.has(el.getAttribute('data-type-filter')!))
    })
  })
  createEffect(() => {
    const nats = store.natureFilter()
    document.querySelectorAll<HTMLElement>('[data-nature-filter]').forEach((el) => {
      el.classList.toggle('is-on', nats.has(el.getAttribute('data-nature-filter')!))
    })
  })

  return (
    <div
      class="flex-1 sch-scroll bg-gray-50 border border-gray-200 rounded-sm shadow-sm"
      style={{ '--cols': String(store.board.cols) }}
    >
      <div class="sch-head">
        {/* Bande semaine */}
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
        {/* Ligne jours + charge/jour live */}
        <div class="grid-expert border-b border-gray-300 bg-gray-50">
          <div class="sch-col-fix p-2 border-r border-gray-200 bg-gray-50 flex items-center justify-between">
            <span class="text-[10px] font-bold text-gray-500 uppercase tracking-widest mono">Poste de charge</span>
          </div>
          <For each={store.board.days}>
            {(day, di) => (
              <div class={`p-2 border-r border-gray-200 text-center ${day.headerTone}`}>
                <div class={`text-[10px] font-bold uppercase mono ${day.today ? 'text-primary' : 'text-gray-400'}`}>{day.short}</div>
                <div class="mt-1">
                  <span class="text-[11px] font-bold mono text-gray-600">{Math.round(store.dayLoad()[di()] * 10) / 10}h</span>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      <div class="bg-gray-50">
        <For each={store.board.lines}>
          {(line) => (
            <Row
              store={store}
              line={line}
              draggedId={draggedId}
              setDraggedId={setDraggedId}
              dropCol={dropCol}
              setDropCol={setDropCol}
            />
          )}
        </For>
      </div>
    </div>
  )
}

function Row(props: {
  store: OrderBoardStore
  line: OrderLineRow
  draggedId: () => string | null
  setDraggedId: (v: string | null) => void
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
            draggedId={props.draggedId}
            setDraggedId={props.setDraggedId}
            dropCol={props.dropCol}
            setDropCol={props.setDropCol}
          />
        )}
      </For>
    </div>
  )
}

function Cell(props: {
  store: OrderBoardStore
  line: OrderLineRow
  dc: DayCell
  col: number
  draggedId: () => string | null
  setDraggedId: (v: string | null) => void
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
        if (!props.draggedId()) return
        e.preventDefault()
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
        props.setDropCol(cellKey)
      }}
      onDrop={(e) => {
        const id = props.draggedId()
        props.setDropCol(null)
        if (!id) return
        e.preventDefault()
        store.moveCard(id, line.code, col, dc.iso)
      }}
    >
      <For each={dc.cards}>
        {(card) => (
          <CardView
            store={store}
            card={card}
            line={line}
            setDraggedId={props.setDraggedId}
            setDropCol={props.setDropCol}
          />
        )}
      </For>
    </div>
  )
}

function CardView(props: {
  store: OrderBoardStore
  card: OrderCard
  line: OrderLineRow
  setDraggedId: (v: string | null) => void
  setDropCol: (v: string | null) => void
}) {
  const { store, card } = props
  const matches = () => store.cardMatches(card, props.line.code)
  return (
    <div
      draggable={matches() && !card.hasOverride}
      data-order-id={card.id}
      class={`sch-of-card relative block bg-white border border-gray-200 rounded p-1.5 ${card.accentClass} ${card.cardClass}`}
      style={{ opacity: matches() ? '' : '0.15' }}
      onDragStart={(e) => {
        if (card.hasOverride) {
          e.preventDefault()
          return
        }
        props.setDraggedId(card.id)
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', card.id)
        }
      }}
      onDragEnd={() => {
        props.setDraggedId(null)
        props.setDropCol(null)
      }}
    >
      <div class="flex items-baseline justify-between gap-1.5">
        <span class="flex items-baseline gap-1 min-w-0">
          <span class={`mono text-[10px] font-bold ${card.idTone} truncate`}>{card.metric ?? card.id}</span>
          <Show when={card.article}>
            <span class={`mono text-[9px] ${card.fieldValTone} truncate`}>{card.article}</span>
          </Show>
        </span>
        <Show when={card.hasOverride}>
          <button
            type="button"
            class="text-[9px] font-bold text-amber-700 hover:text-amber-900 uppercase tracking-wider"
            title="Réinitialiser l'override (date X3)"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              store.resetOverride(card.id)
            }}
          >
            <span class="material-symbols-outlined text-[12px]">undo</span>
          </button>
        </Show>
      </div>
      <p class={`text-[12px] font-semibold leading-tight truncate ${card.textTone}`}>{card.title}</p>
      <Show when={card.fields.length > 0}>
        <div class="flex flex-wrap gap-1 mt-1">
          <For each={card.fields}>
            {(f) => (
              <span class="flex items-center gap-0.5 text-[9px] mono text-gray-500">
                <span class="material-symbols-outlined text-[10px] text-gray-400">{f.icon}</span>
                {f.val}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
