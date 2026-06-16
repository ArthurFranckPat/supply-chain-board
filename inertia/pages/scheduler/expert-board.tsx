import { createEffect, createSignal, For, on, Show, type Component } from 'solid-js'
import { Link, router } from '@/lib/inertia-solid'
import { createBoardStore } from '@/lib/board/store'
import type { BoardData } from '@/lib/board/types'
import AppLayout from '@/layouts/app'
import BoardGrid from '@/components/board/board-grid'
import OfDetailSheet from '@/components/of/of-detail-sheet'
import { Button } from '@/components/ui/button'
import { cn } from '@/libs/cn'

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

const ExpertBoard: Component<ExpertBoardProps> = (props) => {
  // Store créé une fois ; resync via reset() sur navigation Inertia (prev/next/…).
  const store = createBoardStore(props.board)

  // Détail OF : drawer contextuel au clic sur une carte (plus de page dédiée).
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

  const onHorizon = (e: Event) => {
    const form = e.target as HTMLFormElement
    const days = (form.elements.namedItem('days') as HTMLInputElement).value
    e.preventDefault()
    router.visit('/scheduler/board', {
      data: { start: props.windowFrom, days },
      preserveScroll: true,
    })
  }

  return (
    <AppLayout active="board">
      {/* En-tête fixe */}
      <header class="fixed top-0 w-full z-50 flex justify-between items-center px-4 h-12 bg-white border-b border-gray-200">
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-2">
            <div class="w-6 h-6 bg-primary rounded flex items-center justify-center">
              <span class="material-symbols-outlined text-white text-[16px]">precision_manufacturing</span>
            </div>
            <h1 class="font-headline-sm text-base font-bold text-gray-900 tracking-tight">
              FactoryOS{' '}
              <span class="text-[10px] mono font-normal text-gray-400 align-top ml-1">v4.2</span>
            </h1>
          </div>

          {/* Recherche multi-scope */}
          <div class="flex items-center gap-2">
            <div class="group relative flex items-center">
              <span class="material-symbols-outlined absolute left-2.5 text-gray-400 text-[18px] pointer-events-none group-focus-within:text-primary transition-colors">
                search
              </span>
              <input
                class="w-64 bg-white border border-gray-200 rounded-lg py-1.5 pl-9 pr-9 text-xs text-gray-800 transition-colors placeholder:text-gray-400 hover:border-gray-300 focus:border-primary/40 focus-visible:outline-none focus-visible:ring-0"
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
              style={{
                '-webkit-appearance': 'none',
                '-moz-appearance': 'none',
                appearance: 'none',
              }}
              value={store.scope()}
              onChange={(e) => store.onScopeChange(e.currentTarget.value as typeof SCOPES[number]['v'])}
            >
              <For each={SCOPES}>{(s) => <option value={s.v}>{s.label}</option>}</For>
            </select>
          </div>
        </div>

        <div class="flex items-center gap-3">
          {/* Mode d'allocation stock */}
          <div class="flex items-center bg-gray-50 p-0.5 rounded border border-gray-200">
            <For each={['immediate', 'sequential'] as const}>
              {(m) => (
                <button
                  class={cn(
                    'px-2.5 py-1 text-[10px] font-bold rounded uppercase tracking-wider transition-all',
                    store.mode() === m
                      ? 'bg-white shadow-sm text-primary'
                      : 'text-gray-400 hover:text-gray-600'
                  )}
                  title={m === 'immediate' ? 'Stock vu en intégralité par chaque OF (instantané)' : 'Stock consommé OF par OF selon priorité (projeté)'}
                  onClick={() => store.setMode(m)}
                >
                  {m === 'immediate' ? 'Dispo instantanée' : 'Projetée'}
                </button>
              )}
            </For>
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
            {store.feasLoading() ? 'Calcul…' : 'Calculer faisabilité'}
          </Button>

          <div class="flex items-center gap-0.5 border-l border-gray-200 ml-2 pl-2">
            <button class="p-1 text-gray-400 hover:text-gray-900 transition-all">
              <span class="material-symbols-outlined">notifications</span>
            </button>
            <button class="p-1 text-gray-400 hover:text-gray-900 transition-all">
              <span class="material-symbols-outlined">settings</span>
            </button>
            <div class="w-7 h-7 rounded border border-gray-200 ml-1 bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
              OP
            </div>
          </div>
        </div>
      </header>

      <main class="ml-12 mt-12 p-2 h-[calc(100vh-48px)] overflow-hidden flex flex-col">
        {/* Barre d'outils : navigation fenêtre + légende */}
        <div class="mb-2 flex items-center justify-between bg-white p-2 rounded border border-gray-200 shadow-sm">
          <div class="flex items-center gap-4">
            <div class="flex items-center border border-gray-200 rounded p-0.5">
              <Link href={props.prevHref} preserveScroll class="p-1 px-2 text-[11px] font-medium hover:bg-gray-50">
                Préc.
              </Link>
              <Link
                href={props.todayHref}
                preserveScroll
                class="p-1 px-3 text-[11px] font-bold bg-gray-50 border-x border-gray-200 text-gray-700 hover:text-primary"
                title="Revenir à aujourd'hui"
              >
                {props.weekLabel}
              </Link>
              <Link href={props.nextHref} preserveScroll class="p-1 px-2 text-[11px] font-medium hover:bg-gray-50">
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

          <div class="flex items-center gap-4">
            <div class="flex gap-3">
              <div class="flex items-center gap-1 text-[10px] font-bold uppercase text-gray-400">
                <div class="w-2 h-2 rounded-full bg-emerald-500" /> Ferme
              </div>
              <div class="flex items-center gap-1 text-[10px] font-bold uppercase text-gray-400">
                <div class="w-2 h-2 rounded-full bg-blue-500" /> Planifié
              </div>
              <div class="flex items-center gap-1 text-[10px] font-bold uppercase text-gray-400">
                <div class="w-2 h-2 rounded-full bg-amber-500" /> Suggéré
              </div>
            </div>
            <button class="flex items-center gap-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[10px] font-bold text-gray-600 hover:bg-white transition-all uppercase">
              <span class="material-symbols-outlined text-[14px]">table_view</span> Export CSV
            </button>
          </div>
        </div>

        <Show when={props.x3Error}>
          <div class="mb-2 bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 text-xs rounded flex items-center gap-2">
            <span class="material-symbols-outlined text-sm">warning</span>
            X3 injoignable — données{' '}
            {props.cached ? `du cache (${props.cached})` : 'indisponibles'}.
            <Link href="/scheduler/board?refresh=1" class="font-bold underline">
              Réessayer
            </Link>
          </div>
        </Show>

        <Show
          when={props.lineCount > 0}
          fallback={
            <div class="flex-1 flex items-center justify-center text-gray-400 italic p-10">
              Aucun OF planifiable dans la fenêtre (vérifier gammes / dates OF).
            </div>
          }
        >
          <BoardGrid store={store} onSelectOf={onSelectOf} />
        </Show>
      </main>

      <OfDetailSheet num={selectedOf()} open={detailOpen()} onOpenChange={setDetailOpen} />
    </AppLayout>
  )
}

export default ExpertBoard
