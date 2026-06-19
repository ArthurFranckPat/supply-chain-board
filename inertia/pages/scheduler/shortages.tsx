import { createMemo, createResource, createSignal, Show, type Component } from 'solid-js'
import { Link, router } from '@/lib/inertia-solid'
import AppLayout from '@/layouts/app'
import ShortageTable from '@/components/shortages/shortage-table'
import OfDetailSheet from '@/components/of/of-detail-sheet'
import UserMenu from '@/components/user-menu'
import { Button } from '@/components/ui/button'
import { TextField, TextFieldInput } from '@/components/ui/text-field'
import type { ShortageRowsResponse } from '@/lib/shortages/types'
import { route } from '@/lib/routes'

type ShortagesProps = {
  horizon: number
  windowStart: string
  dateRange: string
  prevHref: string
  nextHref: string
  todayHref: string
  /** URL JSON du calcul lourd (lignes + stats). Re-fetch auto quand elle change. */
  rowsHref: string
}

const EMPTY: ShortageRowsResponse = { rows: [], stats: { nbRuptures: 0, nbCouvertes: 0, nbSansCouverture: 0 }, x3Error: null }

const Shortages: Component<ShortagesProps> = (props) => {
  // Calcul lourd différé : fetch client-side, relancé à chaque changement de fenêtre.
  const [data] = createResource(
    () => props.rowsHref,
    async (url): Promise<ShortageRowsResponse> => {
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as ShortageRowsResponse
    }
  )

  // Filtre texte client (sur le champ `filter` pré-concaténé par le serveur).
  const [query, setQuery] = createSignal('')
  const filteredRows = createMemo(() => {
    const all = (data() ?? EMPTY).rows
    const q = query().trim().toLowerCase()
    return q ? all.filter((r) => r.filter.includes(q)) : all
  })

  // Détail OF : drawer contextuel (même composant que le board).
  const [selectedOf, setSelectedOf] = createSignal<string | null>(null)
  const [detailOpen, setDetailOpen] = createSignal(false)
  const onSelectOf = (num: string) => {
    setSelectedOf(num)
    setDetailOpen(true)
  }

  const onHorizon = (e: Event) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const days = (form.elements.namedItem('days') as HTMLInputElement).value
    router.visit(route('scheduler.shortage_tracker'), {
      data: { start: props.windowStart, days },
      preserveScroll: true,
    })
  }

  return (
    <AppLayout active="shortages">
      {/* En-tête fixe */}
      <header class="fixed top-0 w-full z-50 flex justify-between items-center gap-4 px-4 h-12 bg-card border-b border-border">
        <div class="flex items-center gap-6 min-w-0">
          <div class="flex items-center gap-2 shrink-0">
            <div class="w-6 h-6 bg-error rounded flex items-center justify-center">
              <span class="material-symbols-outlined text-white text-[16px]">report</span>
            </div>
            <h1 class="font-headline-sm text-base font-bold text-foreground tracking-tight">Suivi des ruptures</h1>
          </div>
          <TextField class="contents">
            <div class="group relative flex items-center">
              <span class="material-symbols-outlined absolute left-2.5 text-muted-foreground text-[18px] pointer-events-none group-focus-within:text-primary transition-colors">
                search
              </span>
              <TextFieldInput
                class="w-72 h-8 pl-9 pr-3 rounded-md"
                placeholder="Filtrer composant, commande, fournisseur…"
                type="text"
                autocomplete="off"
                value={query()}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
          </TextField>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Link
            href={`${route('scheduler.shortage_tracker')}?start=${props.windowStart}&days=${props.horizon}&refresh=1`}
            preserveScroll
            class="inline-flex items-center gap-1 px-2.5 h-8 bg-muted/60 border border-border rounded text-[10px] font-bold text-muted-foreground hover:bg-card transition-all uppercase"
            title="Recharger les données X3"
          >
            <span class="material-symbols-outlined text-[15px]">refresh</span>
          </Link>
          <Link
            href={route('scheduler.expert_board')}
            class="inline-flex items-center gap-1 px-3 h-8 bg-muted/60 border border-border rounded text-[10px] font-bold text-muted-foreground hover:bg-card transition-all uppercase"
          >
            <span class="material-symbols-outlined text-[15px]">grid_view</span> Board
          </Link>
          <UserMenu tone="primary" />
        </div>
      </header>

      <main class="ml-12 mt-12 p-2 h-[calc(100vh-48px)] overflow-hidden flex flex-col">
        {/* Barre d'outils : navigation fenêtre + légende */}
        <div class="mb-2 flex items-center justify-between bg-card p-2 rounded border border-border shadow-sm">
          <div class="flex items-center gap-4">
            <div class="inline-flex items-center border border-border rounded p-0.5">
              <Link
                href={props.prevHref}
                preserveScroll
                class="p-1 px-2 text-[11px] font-medium hover:bg-muted/60 rounded"
              >
                Préc.
              </Link>
              <Link
                href={props.todayHref}
                preserveScroll
                class="p-1 px-3 text-[11px] font-bold bg-muted/60 border-x border-border text-foreground hover:text-primary"
                title="Revenir à aujourd'hui"
              >
                Auj.
              </Link>
              <Link
                href={props.nextHref}
                preserveScroll
                class="p-1 px-2 text-[11px] font-medium hover:bg-muted/60 rounded"
              >
                Suiv.
              </Link>
            </div>
            <span class="text-[13px] font-bold text-foreground mono">{props.dateRange}</span>
            <form
              onSubmit={onHorizon}
              class="flex items-center gap-1 border border-border rounded px-1.5 py-0.5"
              title="Horizon (jours)"
            >
              <span class="material-symbols-outlined text-[14px] text-muted-foreground">date_range</span>
              <input type="hidden" name="start" value={props.windowStart} />
              <input
                type="number"
                name="days"
                min="1"
                max="90"
                value={props.horizon}
                class="w-10 text-[11px] font-bold mono text-foreground text-right bg-transparent focus:outline-none"
              />
              <span class="text-[10px] font-bold text-muted-foreground">j</span>
            </form>
          </div>
          <div class="flex items-center gap-3 text-[10px] font-bold uppercase text-muted-foreground">
            <div class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-error" /> Sans couverture</div>
            <div class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-amber-500" /> Retard</div>
            <div class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-emerald-500" /> Couvert</div>
          </div>
        </div>

        <Show
          when={!data.loading}
          fallback={
            <div class="flex-1 flex items-center justify-center text-muted-foreground gap-2">
              <span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
              <span class="text-xs font-medium">Calcul des ruptures…</span>
            </div>
          }
        >
          <Show
            when={!data.error}
            fallback={
              <div class="flex-1 flex items-center justify-center text-error gap-2 text-sm">
                <span class="material-symbols-outlined text-[20px]">error</span>
                Échec du calcul des ruptures.
              </div>
            }
          >
            <ShortageTable
              rows={filteredRows()}
              stats={(data() ?? EMPTY).stats}
              x3Error={(data() ?? EMPTY).x3Error}
              onSelectOf={onSelectOf}
            />
          </Show>
        </Show>
      </main>

      <OfDetailSheet num={selectedOf()} open={detailOpen()} onOpenChange={setDetailOpen} />
    </AppLayout>
  )
}

export default Shortages
