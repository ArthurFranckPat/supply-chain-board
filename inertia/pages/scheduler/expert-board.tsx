import { createEffect, createSignal, For, on, Show, type Component } from 'solid-js'
import { Link, router } from '@/lib/inertia-solid'
import { createBoardStore } from '@/lib/board/store'
import type { BoardData } from '@/lib/board/types'
import AppLayout from '@/layouts/app'
import BoardGrid from '@/components/board/board-grid'
import OfDetailSheet from '@/components/of/of-detail-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { SegmentedControl } from '@/components/ui/segmented-control'

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
      <header class="fixed top-0 w-full z-50 flex justify-between items-center gap-4 px-4 h-12 bg-card border-b border-border">
        <div class="flex items-center gap-4 min-w-0">
          {/* Marque */}
          <div class="flex items-center gap-2 shrink-0">
            <div class="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
              <span class="material-symbols-outlined text-white text-[16px]">precision_manufacturing</span>
            </div>
            <h1 class="font-headline-sm text-sm font-bold text-foreground tracking-tight">
              FactoryOS
              <span class="text-[10px] mono font-normal text-muted-foreground align-top ml-1">v4.2</span>
            </h1>
          </div>

          <Separator orientation="vertical" class="h-6" />

          {/* Recherche multi-scope */}
          <div class="flex items-center gap-2">
            <div class="group relative flex items-center">
              <span class="material-symbols-outlined absolute left-2.5 text-muted-foreground text-[18px] pointer-events-none group-focus-within:text-primary transition-colors">
                search
              </span>
              <Input
                size="sm"
                class="w-60 pl-9 pr-9 rounded-lg"
                placeholder="Rechercher un OF, article, poste…"
                type="text"
                autocomplete="off"
                value={store.query()}
                onInput={(e) => store.onQueryInput(e.currentTarget.value)}
              />
              <kbd class="absolute right-2 text-[9px] font-sans font-semibold text-muted-foreground bg-muted border border-border rounded px-1 py-0.5 pointer-events-none group-focus-within:opacity-0 transition-opacity">
                ⌘K
              </kbd>
            </div>
            <select
              title="Portée de la recherche"
              aria-label="Portée de la recherche"
              class="h-8 bg-card border border-border rounded-md pl-2.5 pr-7 text-xs text-muted-foreground hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer transition-colors appearance-none bg-[length:10px] bg-[right_0.5rem_center] bg-no-repeat"
              style={{
                'background-image':
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path fill='%239ca3af' d='M5 6.5L1.5 3h7z'/></svg>\")",
              }}
              value={store.scope()}
              onChange={(e) => store.onScopeChange(e.currentTarget.value as typeof SCOPES[number]['v'])}
            >
              <For each={SCOPES}>{(s) => <option value={s.v}>{s.label}</option>}</For>
            </select>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          {/* Mode d'allocation stock */}
          <SegmentedControl
            class="hidden md:inline-flex"
            value={store.mode()}
            onChange={(v) => store.setMode(v as 'immediate' | 'sequential')}
            options={[
              { value: 'immediate', label: 'Instantanée', title: 'Stock vu en intégralité par chaque OF' },
              { value: 'sequential', label: 'Projetée', title: 'Stock consommé OF par OF selon priorité' },
            ]}
          />

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

          <Separator orientation="vertical" class="h-6 mx-1" />

          <Button variant="ghost" size="icon" title="Notifications" class="text-muted-foreground">
            <span class="material-symbols-outlined text-[20px]">notifications</span>
          </Button>
          <Button variant="ghost" size="icon" title="Réglages" class="text-muted-foreground">
            <span class="material-symbols-outlined text-[20px]">settings</span>
          </Button>
          <div class="w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center text-[10px] font-bold text-muted-foreground">
            OP
          </div>
        </div>
      </header>

      <main class="ml-12 mt-12 p-2 h-[calc(100vh-48px)] overflow-hidden flex flex-col">
        {/* Barre d'outils : navigation fenêtre + légende */}
        <div class="mb-2 flex items-center justify-between gap-3 bg-card p-2 rounded-lg border border-border shadow-sm">
          <div class="flex items-center gap-2">
            {/* Navigation fenêtre (segmented prev/today/next) */}
            <div class="inline-flex items-center bg-muted/60 rounded-lg border border-border p-0.5">
              <Link
                href={props.prevHref}
                preserveScroll
                class="px-2.5 h-7 inline-flex items-center text-[11px] font-semibold text-muted-foreground hover:text-foreground rounded-md transition-colors"
                title="Période précédente"
              >
                <span class="material-symbols-outlined text-[18px]">chevron_left</span>
              </Link>
              <Link
                href={props.todayHref}
                preserveScroll
                class="px-3 h-7 inline-flex items-center text-[11px] font-bold bg-card text-foreground border-x border-border hover:text-primary rounded-none transition-colors"
                title="Revenir à aujourd'hui"
              >
                {props.weekLabel}
              </Link>
              <Link
                href={props.nextHref}
                preserveScroll
                class="px-2.5 h-7 inline-flex items-center text-[11px] font-semibold text-muted-foreground hover:text-foreground rounded-md transition-colors"
                title="Période suivante"
              >
                <span class="material-symbols-outlined text-[18px]">chevron_right</span>
              </Link>
            </div>
            <span class="text-xs font-bold text-foreground mono">{props.dateRange}</span>

            {/* Horizon (jours) */}
            <form
              onSubmit={onHorizon}
              class="flex items-center gap-1 h-8 border border-border rounded-md px-2 bg-card"
              title="Horizon (jours)"
            >
              <span class="material-symbols-outlined text-[14px] text-muted-foreground">date_range</span>
              <input type="hidden" name="start" value={props.windowFrom} />
              <input
                type="number"
                name="days"
                min="1"
                max="90"
                value={props.horizon}
                class="w-8 text-[11px] font-bold mono text-foreground text-right bg-transparent focus:outline-none"
              />
              <span class="text-[10px] font-bold text-muted-foreground">j</span>
            </form>
          </div>

          <div class="flex items-center gap-3">
            {/* Légende statuts */}
            <div class="hidden sm:flex items-center gap-2">
              <Badge variant="success" class="gap-1 bg-transparent text-emerald-600 border-transparent hover:bg-transparent">
                <span class="w-2 h-2 rounded-full bg-emerald-500" /> Ferme
              </Badge>
              <Badge variant="secondary" class="gap-1 bg-transparent text-blue-600 border-transparent hover:bg-transparent">
                <span class="w-2 h-2 rounded-full bg-blue-500" /> Planifié
              </Badge>
              <Badge variant="warning" class="gap-1 bg-transparent text-amber-600 border-transparent hover:bg-transparent">
                <span class="w-2 h-2 rounded-full bg-amber-500" /> Suggéré
              </Badge>
            </div>
            <Button variant="outline" size="sm" class="gap-1.5 uppercase text-[10px]" title="Exporter le board en CSV">
              <span class="material-symbols-outlined text-[14px]">table_view</span> Export
            </Button>
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
