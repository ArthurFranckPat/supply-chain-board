import { createEffect, For, on, Show, type Component } from 'solid-js'
import { Link, router } from '@/lib/inertia-solid'
import { createOrderBoardStore } from '@/lib/orders/store'
import type { OrderBoardData } from '@/lib/orders/types'
import AppLayout from '@/layouts/app'
import OrderGrid from '@/components/board/order-grid'
import { cn } from '@/libs/cn'

type OrderBoardProps = {
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

const OrderBoard: Component<OrderBoardProps> = (props) => {
  const store = createOrderBoardStore(props.board)

  createEffect(
    on(
      () => props.board,
      (next, prev) => {
        if (prev !== undefined && next !== prev) store.reset(next)
      },
      { defer: true }
    )
  )

  const onHorizon = (e: Event) => {
    const form = e.target as HTMLFormElement
    const days = (form.elements.namedItem('days') as HTMLInputElement).value
    e.preventDefault()
    router.visit('/scheduler/planning-board', {
      data: { start: props.windowFrom, days },
    })
  }

  return (
    <AppLayout>
      <header class="fixed top-0 w-full z-50 flex justify-between items-center px-4 h-12 bg-white border-b border-gray-200">
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 bg-primary rounded flex items-center justify-center">
              <span class="material-symbols-outlined text-white text-[16px]">inventory_2</span>
            </div>
            <h1 class="font-headline-sm text-base font-bold text-gray-900 tracking-tight">
              FactoryOS{' '}
              <span class="text-[10px] mono font-normal text-gray-400 align-top ml-1">v4.2</span>
            </h1>
            <span class="text-[10px] font-bold uppercase tracking-widest mono text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 ml-2">
              Mode planification
            </span>
          </div>

          <div class="flex items-center gap-2">
            <div class="group relative flex items-center">
              <span class="material-symbols-outlined absolute left-2.5 text-gray-400 text-[18px] pointer-events-none group-focus-within:text-primary transition-colors">
                search
              </span>
              <input
                class="w-56 bg-white border border-gray-200 rounded-lg py-1.5 pl-9 pr-9 text-xs text-gray-800 transition-colors placeholder:text-gray-400 hover:border-gray-300 focus:border-primary/40 focus-visible:outline-none focus-visible:ring-0"
                style={{ outline: 'none' }}
                placeholder="Rechercher…"
                type="text"
                autocomplete="off"
                value={store.query()}
                onInput={(e) => store.onQueryInput(e.currentTarget.value)}
              />
              <kbd class="absolute right-2.5 text-[9px] font-sans font-semibold text-gray-400 bg-white border border-gray-200 rounded px-1 py-0.5 pointer-events-none group-focus-within:hidden">
                ⌘K
              </kbd>
            </div>
            <select
              title="Portée de la recherche"
              class="bg-white border border-gray-200 rounded-lg py-1.5 pl-2.5 pr-6 text-xs text-gray-600 hover:border-gray-300 focus:border-primary/40 focus-visible:outline-none cursor-pointer transition-colors"
              style={{ '-webkit-appearance': 'none', '-moz-appearance': 'none', appearance: 'none' }}
              value={store.scope()}
              onChange={(e) =>
                store.onScopeChange(e.currentTarget.value as typeof SCOPES[number]['v'])
              }
            >
              <For each={SCOPES}>{(s) => <option value={s.v}>{s.label}</option>}</For>
            </select>
            <Link
              href="/scheduler/board"
              class="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 hover:text-primary hover:border-primary/30 transition-all"
              title="Revenir à la vue d'ordonnancement (OF)"
            >
              <span class="material-symbols-outlined text-[14px]">event_note</span>
              Ordonnancement
            </Link>
          </div>
        </div>

        <div class="flex items-center gap-3">
          {/* Filtre type commande */}
          <div class="flex items-center gap-1" title="Type de commande">
            <span class="text-[9px] font-bold uppercase text-gray-400 mr-0.5">Type</span>
            <For each={TYPES}>
              {(t) => (
                <button
                  type="button"
                  class={cn(
                    'order-chip px-2 py-1 text-[10px] font-bold rounded border uppercase tracking-wider transition-all',
                    store.typeFilter().has(t) && 'is-on'
                  )}
                  onClick={() => store.toggleType(t)}
                >
                  {t}
                </button>
              )}
            </For>
          </div>
          {/* Filtre nature besoin */}
          <div class="flex items-center gap-1 border-l border-gray-200 pl-2" title="Nature du besoin">
            <span class="text-[9px] font-bold uppercase text-gray-400 mr-0.5">Besoin</span>
            <For each={NATURES}>
              {(n) => (
                <button
                  type="button"
                  class={cn(
                    'order-chip px-2 py-1 text-[10px] font-bold rounded border uppercase tracking-wider transition-all',
                    store.natureFilter().has(n.v) && 'is-on'
                  )}
                  onClick={() => store.toggleNature(n.v)}
                >
                  {n.label}
                </button>
              )}
            </For>
          </div>
          <div class="flex items-center gap-1 text-[10px] font-bold uppercase text-gray-400 border-l border-gray-200 pl-2">
            <div class="w-2 h-2 rounded-full bg-amber-500" /> Override
          </div>
        </div>
      </header>

      <main class="ml-12 mt-12 p-2 h-[calc(100vh-48px)] overflow-hidden flex flex-col">
        <div class="mb-2 flex items-center justify-between bg-white p-2 rounded border border-gray-200 shadow-sm">
          <div class="flex items-center gap-4">
            <div class="flex items-center border border-gray-200 rounded p-0.5">
              <Link href={props.prevHref} class="p-1 px-2 text-[11px] font-medium hover:bg-gray-50">
                Préc.
              </Link>
              <Link
                href={props.todayHref}
                class="p-1 px-3 text-[11px] font-bold bg-gray-50 border-x border-gray-200 text-gray-700 hover:text-primary"
                title="Revenir à aujourd'hui"
              >
                {props.weekLabel}
              </Link>
              <Link href={props.nextHref} class="p-1 px-2 text-[11px] font-medium hover:bg-gray-50">
                Suiv.
              </Link>
            </div>
            <span class="text-[13px] font-bold text-gray-800 mono">{props.dateRange}</span>
            <form
              onSubmit={onHorizon}
              class="flex items-center gap-1 border border-gray-200 rounded px-1.5 py-0.5"
              title="Horizon (jours)"
            >
              <span class="material-symbols-outlined text-[14px] text-gray-400">date_range</span>
              <input type="hidden" name="start" value={props.windowFrom} />
              <input
                type="number"
                name="days"
                min="1"
                max="90"
                value={props.horizon}
                class="w-10 text-[11px] font-bold mono text-gray-700 text-right bg-transparent focus:outline-none"
              />
              <span class="text-[10px] font-bold text-gray-400">j</span>
            </form>
          </div>
          <div class="flex items-center gap-2 text-[13px] font-bold text-gray-800 mono">
            <span class="material-symbols-outlined text-[18px] text-primary">inventory_2</span>
            {props.totalLines} ligne{props.totalLines > 1 ? 's' : ''} ouverte
            {props.totalLines > 1 ? 's' : ''} sur {props.lineCount} poste
            {props.lineCount > 1 ? 's' : ''}
          </div>
        </div>

        <Show when={props.x3Error}>
          <div class="mb-2 bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-xs rounded flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">error</span>
            <span class="font-bold">Erreur chargement planification :</span>
            <span class="mono">{props.x3Error}</span>
          </div>
        </Show>

        <Show
          when={props.lineCount > 0}
          fallback={
            <div class="flex-1 flex items-center justify-center text-gray-400 italic p-10">
              Aucune ligne de commande ouverte dans l'horizon.
            </div>
          }
        >
          <OrderGrid store={store} />
        </Show>
      </main>
    </AppLayout>
  )
}

export default OrderBoard
