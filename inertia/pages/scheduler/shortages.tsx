import { createMemo, createResource, createSignal, Match, Show, Switch, type Component } from 'solid-js'
import { Link } from '@/lib/inertia-solid'
import { route } from '@/lib/routes'
import { ShortageComposants, ShortageRegistre, ShortageTimeline } from '@/components/shortages/shortage-table'
import OfDetailSheet from '@/components/of/of-detail-sheet'
import { Masthead } from '@/components/masthead'
import type { ShortageRowsResponse, ShortageVerdictKey } from '@/lib/shortages/types'

/**
 * Page « Suivi des ruptures » (issue #15/#16) — design system « Papier », harmonisée
 * avec /suivi (masthead FactoryOS, bandeau KPI, toolbar à bascule).
 *
 * Shell Inertia instantané (SchedulerController.shortageTracker) ; les lignes (calcul
 * lourd : faisabilité + réceptions) chargées en différé par fetch JSON (shortageRows).
 * Trois vues d'une même donnée : « Registre » (table éditoriale), « Par composant »
 * (agrégation dégâts) et « Couverture » (frise réception ↔ expédition).
 */

type ShortagesProps = {
  horizon: number
  windowStart: string
  dateRange: string
  prevHref: string
  nextHref: string
  todayHref: string
  rowsHref: string
}

const EMPTY: ShortageRowsResponse = {
  rows: [],
  stats: { nbRuptures: 0, nbCouvertes: 0, nbSansCouverture: 0 },
  x3Error: null,
}

const Shortages: Component<ShortagesProps> = (props) => {
  const [data] = createResource(
    () => props.rowsHref,
    async (url): Promise<ShortageRowsResponse> => {
      const res = await fetch(url, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as ShortageRowsResponse
    },
  )
  const view = createMemo(() => data() ?? EMPTY)

  // Bascule de vue + filtres client.
  const [mode, setMode] = createSignal<'registre' | 'composants' | 'couverture'>('registre')
  const [query, setQuery] = createSignal('')
  const [verdictFilter, setVerdictFilter] = createSignal<ShortageVerdictKey | 'all'>('all')

  const filteredRows = createMemo(() => {
    const all = view().rows
    const q = query().trim().toLowerCase()
    const vf = verdictFilter()
    let r = vf === 'all' ? all : all.filter((row) => row.verdictKey === vf)
    if (q) r = r.filter((row) => row.filter.includes(q))
    return r
  })

  // Vue Couverture : tri chronologique par date d'expédition (nulls en fin).
  const timelineRows = createMemo(() =>
    [...filteredRows()].sort((a, b) => {
      const da = a.dateExpeditionIso ?? '9999-12-31'
      const db = b.dateExpeditionIso ?? '9999-12-31'
      return da < db ? -1 : da > db ? 1 : 0
    }),
  )

  // Compteurs KPI (dérivés des lignes, indépendants des filtres).
  const counts = createMemo(() => {
    const c = { couvert: 0, retard: 0, sans_couverture: 0, sous_ensemble: 0 }
    for (const r of view().rows) c[r.verdictKey]++
    return c
  })

  // Détail OF : drawer contextuel (même composant que le board).
  const [selectedOf, setSelectedOf] = createSignal<string | null>(null)
  const [detailOpen, setDetailOpen] = createSignal(false)
  const onSelectOf = (num: string) => {
    setSelectedOf(num)
    setDetailOpen(true)
  }

  const verdictChip = (k: ShortageVerdictKey | 'all', label: string) => {
    const on = () => verdictFilter() === k
    const count = () => (k === 'all' ? view().rows.length : counts()[k])
    return (
      <button
        type="button"
        class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
          on() ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setVerdictFilter(on() ? 'all' : k)}
      >
        {label}
        <Show when={count() > 0}>
          <span class="ml-1 opacity-60">{count()}</span>
        </Show>
      </button>
    )
  }

  const emptyState = (
    <div class="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
      <div class="flex flex-col items-center gap-2">
        <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">
          {view().x3Error ? 'cloud_off' : 'task_alt'}
        </span>
        {view().x3Error
          ? 'Données indisponibles (X3 injoignable).'
          : 'Aucune rupture détectée dans la fenêtre.'}
      </div>
    </div>
  )

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Ruptures · Couverture composants"
        active="ruptures"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold capitalize not-italic text-terra">{props.dateRange}</div>
            <div>
              <b class="font-bold text-foreground">{view().stats.nbRuptures}</b> ruptures · horizon{' '}
              <b class="font-bold text-foreground">+{props.horizon} j</b>
            </div>
          </>
        }
        actions={
          <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-terra focus-within:ring-2 focus-within:ring-terra/25">
            <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
            <input
              class="w-[200px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
              placeholder="Composant, OF, commande, fournisseur…"
              type="text"
              autocomplete="off"
              value={query()}
              onInput={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
        }
      />

      {/* ═══ Toolbar ═══ */}
      <div class="flex flex-none flex-wrap items-center gap-2.5 border-b border-rule px-7 py-2">
        {/* Bascule Registre / Par composant / Couverture */}
        <div class="inline-flex items-center rounded-md border border-rule bg-card p-0.5">
          {(
            [
              ['registre', 'Registre', 'Table éditoriale : une ligne par composant × OF bloqué'],
              ['composants', 'Par composant', 'Agrégation : quel composant bloque le plus d’OF ?'],
              ['couverture', 'Couverture', 'Frise temporelle : réception couvrante ↔ date d’expédition'],
            ] as const
          ).map(([key, label, title]) => (
            <button
              type="button"
              class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                mode() === key ? 'bg-terra-soft text-terra' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setMode(key)}
              title={title}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filtre verdict */}
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Verdict</span>
          {verdictChip('all', 'Tous')}
          {verdictChip('sans_couverture', 'Sans couv.')}
          {verdictChip('sous_ensemble', 'S/E')}
          {verdictChip('retard', 'Retard')}
          {verdictChip('couvert', 'Couvert')}
        </div>

        {/* Fenêtre */}
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Fenêtre</span>
          <Link href={props.prevHref} preserveScroll class="rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">Préc.</Link>
          <Link href={props.todayHref} preserveScroll class="rounded-[5px] bg-terra-soft px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-terra">Auj.</Link>
          <Link href={props.nextHref} preserveScroll class="rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">Suiv.</Link>
        </div>

        <div class="ml-auto flex items-center gap-2">
          <Link
            href={`${route('scheduler.shortage_tracker')}?start=${props.windowStart}&days=${props.horizon}&refresh=1`}
            preserveScroll
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-terra"
            title="Recharger les données X3 (cache → re-fetch live)"
          >
            <span class="material-symbols-outlined text-[14px] text-muted-foreground">refresh</span>
            Actualiser
          </Link>
        </div>
      </div>

      {/* ═══ X3 injoignable ═══ */}
      <Show when={view().x3Error}>
        <div class="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-destructive">warning</span>
          <span class="font-bold">Erreur chargement ruptures :</span>
          <span class="font-mono">{view().x3Error}</span>
        </div>
      </Show>

      {/* ═══ Vue active ═══ */}
      <Show
        when={!data.loading}
        fallback={
          <div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <span class="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
            <span class="text-[13px] font-medium">Calcul des ruptures…</span>
          </div>
        }
      >
        <Show
          when={!data.error}
          fallback={
            <div class="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
              <span class="material-symbols-outlined text-[20px]">error</span>
              Échec du calcul des ruptures.
            </div>
          }
        >
          <div class="flex-1 overflow-hidden p-5">
            <Switch>
              <Match when={mode() === 'registre'}>
                <ShortageRegistre rows={filteredRows} onSelectOf={onSelectOf} emptyState={emptyState} />
              </Match>
              <Match when={mode() === 'composants'}>
                <ShortageComposants rows={filteredRows} onSelectOf={onSelectOf} emptyState={emptyState} />
              </Match>
              <Match when={mode() === 'couverture'}>
                <ShortageTimeline
                  rows={timelineRows()}
                  windowStartIso={props.windowStart}
                  horizon={props.horizon}
                  onSelectOf={onSelectOf}
                  emptyState={emptyState}
                />
              </Match>
            </Switch>
          </div>
        </Show>
      </Show>

      <OfDetailSheet num={selectedOf()} open={detailOpen()} onOpenChange={setDetailOpen} />
    </div>
  )
}

export default Shortages
