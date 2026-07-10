import { createMemo, createSignal, For, Show, type Component } from 'solid-js'
import { Link } from '@/lib/inertia-solid'
import { route } from '@/lib/routes'

import type { SuiviPageProps, SuiviStatusKey, ProactiveVerdictKey } from '@/lib/suivi/types'
import { Masthead } from '@/components/masthead'
import { EMPTY, PROACTIVE_EMPTY, fmtMs } from '@/lib/suivi/tracking-shared'
import { useTimedFetch } from '@/lib/suivi/use-timed-fetch'
import { ReactiveView } from '@/components/tracking/reactive-view'
import { ProactiveView } from '@/components/tracking/proactive-view'
import type { SuiviRowsResponse, ProactiveRowsResponse } from '@/lib/suivi/types'

/**
 * Page « Suivi des commandes » (issue #19) — axe allocation / expédition.
 *
 * Shell Inertia rendu instantanément (SuiviController.board) ; les lignes (calcul
 * lourd : assignation des 4 statuts + causes + signal CQ depuis X3) sont chargées
 * en différé par fetch JSON (SuiviController.rows). Même motif que la page
 * ruptures (scheduler/shortages). Registre Papier harmonisé avec shortage-table
 * + Rangée rupture (design_system §07).
 *
 * Shell (fetch + toolbar + switch) — le rendu de chaque mode (réactif/proactif)
 * vit dans components/tracking/*-view.tsx (issue #52).
 */

const Tracking: Component<SuiviPageProps> = (props) => {
  // Calcul lourd différé : fetch client-side, relancé à chaque changement de date
  // ou de bust (bouton refresh → ?refresh=N invalide le cache serveur).
  const [bust, setBust] = createSignal(0)

  const { data, ms: rowsMs, elapsed } = useTimedFetch<SuiviRowsResponse>(
    () => `${props.rowsHref}${bust() ? `&refresh=${bust()}` : ''}`,
  )
  const view = createMemo(() => data() ?? EMPTY)

  // ── Vue proactive (réalisabilité des commandes via le moteur séquentiel) ──
  const [mode, setMode] = createSignal<'reactif' | 'proactif'>('reactif')
  const { data: proData, ms: proMs, elapsed: proElapsed } = useTimedFetch<ProactiveRowsResponse>(
    () => `${props.proactiveRowsHref}${bust() ? `&refresh=${bust()}` : ''}`,
  )
  const proView = createMemo(() => proData() ?? PROACTIVE_EMPTY)

  // Filtres côté client. Recherche/type/atelier transverses aux 2 vues ;
  // statut/verdict spécifiques à leur mode.
  const [query, setQuery] = createSignal('')
  const [statusFilter, setStatusFilter] = createSignal<SuiviStatusKey | 'all'>('all')
  const [verdictFilter, setVerdictFilter] = createSignal<ProactiveVerdictKey | 'all'>('all')
  const [typeFilter, setTypeFilter] = createSignal<Set<string>>(new Set(['MTS', 'MTO']))
  // Filtre atelier (#36) : ensemble de STOLOC retenus (vide = tous). Transverse aux 2 vues.
  const [atelierFilter, setAtelierFilter] = createSignal<Set<string>>(new Set())

  const toggleType = (t: string) =>
    setTypeFilter((prev) => {
      const next = new Set(prev)
      next.has(t) ? next.delete(t) : next.add(t)
      return next
    })

  const toggleAtelier = (code: string) =>
    setAtelierFilter((prev) => {
      const next = new Set(prev)
      next.has(code) ? next.delete(code) : next.add(code)
      return next
    })

  // Ateliers de la vue active (réactif/proactif), pour les chips de filtre.
  const ateliers = createMemo(() => (mode() === 'proactif' ? proView().ateliers : view().ateliers))

  // Filtrage (le tri est de la responsabilité de chaque vue — cf reactive-view/proactive-view).
  const reactiveFilteredRows = createMemo(() => {
    const all = view().rows
    const q = query().trim().toLowerCase()
    const sf = statusFilter()
    const tf = typeFilter()
    const af = atelierFilter()
    let r = all.filter(
      (row) => (sf === 'all' || row.statusKey === sf) && tf.has(row.type) && (af.size === 0 || af.has(row.atelier)),
    )
    if (q) r = r.filter((row) => row.filter.includes(q))
    return r
  })
  const proFilteredRows = createMemo(() => {
    const all = proView().rows
    const q = query().trim().toLowerCase()
    const vf = verdictFilter()
    const tf = typeFilter()
    const af = atelierFilter()
    let r = all.filter(
      (row) => (vf === 'all' || row.verdictKey === vf) && tf.has(row.type) && (af.size === 0 || af.has(row.atelier)),
    )
    if (q) r = r.filter((row) => row.filter.includes(q))
    return r
  })

  const refLabel = () =>
    new Date(props.referenceDate + 'T00:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

  const statusChip = (k: SuiviStatusKey | 'all', label: string) => {
    const on = statusFilter() === k
    return (
      <button
        type="button"
        class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
          on ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setStatusFilter(on ? 'all' : k)}
      >
        {label}
      </button>
    )
  }

  const verdictChip = (k: ProactiveVerdictKey | 'all', label: string) => {
    const on = verdictFilter() === k
    return (
      <button
        type="button"
        class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
          on ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
        }`}
        onClick={() => setVerdictFilter(on ? 'all' : k)}
      >
        {label}
      </button>
    )
  }

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Suivi · Allocation & expédition"
        active="tracking"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold capitalize not-italic text-brand">{refLabel()}</div>
            <div>
              <b class="font-bold text-foreground">{mode() === 'reactif' ? view().total : proView().total}</b> lignes ouvertes
              <Show when={view().referenceDate}> · réf. <b class="font-bold text-foreground">{view().referenceDate}</b></Show>
            </div>
          </>
        }
        actions={
          <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
            <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
            <input
              class="w-[200px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
              placeholder="Commande, article, client…"
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
        {/* Bascule Réactif / Proactif */}
        <div class="inline-flex items-center rounded-md border border-rule bg-card p-0.5">
          <button
            type="button"
            class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
              mode() === 'reactif' ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('reactif')}
            title="Suivi as-is : statuts allocation/expédition + causes de retard"
          >
            Réactif
          </button>
          <button
            type="button"
            class={`rounded-[5px] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
              mode() === 'proactif' ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setMode('proactif')}
            title="Réalisabilité projetée : consommation séquentielle des composants entre OFs"
          >
            Proactif
          </button>
        </div>
        <Show when={mode() === 'reactif'}>
          <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Statut</span>
            {statusChip('all', 'Tous')}
            {statusChip('ret', 'Retard')}
            {statusChip('alc', 'À allouer')}
            {statusChip('exp', 'À expédier')}
          </div>
        </Show>
        <Show when={mode() === 'proactif'}>
          <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Verdict</span>
            {verdictChip('all', 'Tous')}
            {verdictChip('blocked', 'Bloquée')}
            {verdictChip('uncov', 'Sans couverture')}
            {verdictChip('late', 'Retard')}
            {verdictChip('risk', 'À risque')}
          </div>
        </Show>
        <div class="inline-flex items-center gap-1 rounded-md border border-rule bg-card p-0.5">
          <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Type</span>
          <For each={['MTS', 'MTO', 'NOR']}>
            {(t) => (
              <button
                type="button"
                class={`rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  typeFilter().has(t) ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => toggleType(t)}
              >
                {t}
              </button>
            )}
          </For>
        </div>
        {/* Filtre atelier (#36) — chips STOLOC, apparaît dès qu'un atelier est connu. Transverse aux 2 vues. */}
        <Show when={ateliers().length > 0}>
          <div class="inline-flex flex-wrap items-center gap-1 rounded-md border border-rule bg-card p-0.5">
            <span class="px-1.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Atelier</span>
            <For each={ateliers()}>
              {(a) => (
                <button
                  type="button"
                  class={`rounded-[5px] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors ${
                    atelierFilter().has(a.code) ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => toggleAtelier(a.code)}
                  title={a.label}
                >
                  {a.label}
                </button>
              )}
            </For>
            <Show when={atelierFilter().size > 0}>
              <button
                type="button"
                class="rounded-[5px] px-1.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setAtelierFilter(new Set())}
                title="Réinitialiser le filtre atelier"
              >
                ✕
              </button>
            </Show>
          </div>
        </Show>
        <div class="ml-auto flex items-center gap-2">
          {/* Durée de chargement X3 */}
          <Show when={mode() === 'reactif' ? data.loading : proData.loading}>
            <span class="font-mono text-[11px] tabular-nums text-muted-foreground">
              {fmtMs(mode() === 'reactif' ? elapsed() : proElapsed())}
            </span>
          </Show>
          <Show when={mode() === 'reactif' ? (!data.loading && rowsMs() !== null) : (!proData.loading && proMs() !== null)}>
            <span class="font-mono text-[11px] tabular-nums text-muted-foreground/60" title="Durée dernier chargement X3">
              {fmtMs((mode() === 'reactif' ? rowsMs() : proMs())!)}
            </span>
          </Show>
          <button
            type="button"
            onClick={() => setBust((b) => b + 1)}
            disabled={mode() === 'reactif' ? data.loading : proData.loading}
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-brand disabled:opacity-50"
            title="Recharger les données X3 (cache → re-fetch live)"
          >
            <span
              class="material-symbols-outlined text-[14px] text-muted-foreground"
              classList={{ 'animate-spin': mode() === 'reactif' ? data.loading : proData.loading }}
            >
              refresh
            </span>
            Actualiser
          </button>
          <Link
            href={`${route('suivi.board')}?referenceDate=${encodeURIComponent(new Date().toISOString().slice(0, 10))}`}
            preserveScroll
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-brand"
            title="Recharger à aujourd'hui"
          >
            <span class="material-symbols-outlined text-[14px] text-muted-foreground">calendar_month</span>
            Aujourd'hui
          </Link>
        </div>
      </div>

      <Show
        when={mode() === 'reactif'}
        fallback={
          <ProactiveView
            view={proView}
            filteredRows={proFilteredRows}
            loading={() => proData.loading}
            error={() => !!proData.error}
          />
        }
      >
        <ReactiveView
          view={view}
          filteredRows={reactiveFilteredRows}
          loading={() => data.loading}
          error={() => !!data.error}
        />
      </Show>
    </div>
  )
}

export default Tracking
