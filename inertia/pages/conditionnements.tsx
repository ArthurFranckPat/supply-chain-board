import {
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  Show,
  createEffect,
  For,
  type Component,
} from 'solid-js'
import { cx } from '@/libs/cva'
import { Masthead } from '@/components/masthead'
import type {
  ArticleEnrichissement,
  ConditionnementDisplayRow,
  ConditionnementsRowsResponse,
  EstimationSourceDisplay,
  EstimationsFetchResponse,
} from '@/lib/conditionnements/types'

/**
 * Page « Conditionnements » : vue complète des articles actifs avec leurs coefs
 * + estimation US/palette (STOCK SM* / STOJOU rangement REC) + contexte.
 *
 * **Chargement en 2 temps** (cold start maîtrisé) :
 *  1. Articles seuls (ITMMASTER, fast) → tableau + filtres + KPI immédiats.
 *  2. Enrichissements (estimations + mouvements, coûteux) → chargés au trigger :
 *     bouton « Charger les estimations » ou automatiquement si filtre « manquants » actif.
 */

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** Valeur distincte d'une facette avec son compte. */
interface Facette {
  cle: string
  label: string
  count: number
}

/** ISO (YYYY-MM-DD) → JJ/MM/AA, ou chaîne vide si invalide. */
const fmtFr = (iso: string | null | undefined): string => {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1]!.slice(2)}`
}

const EMPTY: ConditionnementsRowsResponse = {
  rows: [],
  estimationsHref: '',
  stats: {
    totalArticles: 0,
    nbComplets: 0,
    nbManquant0: 0,
    nbManquant1: 0,
    nbManquantLesDeux: 0,
    tauxRemplissage: 0,
  },
  x3Error: null,
}

interface ConditionnementsPageProps {
  rowsHref: string
}

/** Ligne de base + enrichissement fusionné (pour l'affichage). */
interface DisplayRow extends ConditionnementDisplayRow, ArticleEnrichissement {}

const Conditionnements: Component<ConditionnementsPageProps> = (props) => {
  const [query, setQuery] = createSignal('')
  const [bust, setBust] = createSignal(0)
  const [elapsed, setElapsed] = createSignal(0)

  // ── Filtres à facettes ──
  const [selCategories, setSelCategories] = createSignal<Set<string>>(new Set())
  const [selFournisseurs, setSelFournisseurs] = createSignal<Set<string>>(new Set())
  const [selEtats, setSelEtats] = createSignal<Set<string>>(new Set())
  const [openDropdown, setOpenDropdown] = createSignal<string | null>(null)

  // ── Chargement 1 : articles (fast) ──
  const url = createMemo(() => (bust() ? `${props.rowsHref}?refresh=${bust()}` : props.rowsHref))
  const [data] = createResource(url, async (u): Promise<ConditionnementsRowsResponse> => {
    const res = await fetch(u, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return (await res.json()) as ConditionnementsRowsResponse
  })

  createEffect(() => {
    if (!data.loading) {
      setElapsed(0)
      return
    }
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Date.now() - t0), 200)
    onCleanup(() => clearInterval(id))
  })

  const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

  const viewData = createMemo(() => data() ?? EMPTY)
  const stats = createMemo(() => viewData().stats)
  const x3Error = createMemo(() => viewData().x3Error)

  // ── Chargement 2 : enrichissements (lazy) ──
  const [enrichTrigger, setEnrichTrigger] = createSignal(0)
  const estimationsUrl = createMemo(() => {
    const href = viewData().estimationsHref
    if (!href || enrichTrigger() === 0) return null
    // Restreint aux articles manquants visibles (filtre actif) pour limiter le calcul.
    const manquants = viewData()
      .rows.filter((r) => r.etatCoef !== 'complet')
      .map((r) => r.article)
    const params = new URLSearchParams()
    if (manquants.length > 0 && manquants.length < 500) {
      params.set('articles', manquants.join(','))
    }
    return bust() ? `${href}?${params}&refresh=${bust()}` : `${href}?${params}`
  })

  const [enrichments] = createResource(
    estimationsUrl,
    async (u): Promise<EstimationsFetchResponse> => {
      const res = await fetch(u, { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as EstimationsFetchResponse
    }
  )

  const enrichissements = createMemo(() => enrichments()?.enrichissements ?? {})

  // ── Facettes ──
  const matchTexte = (
    r: { article: string; designation: string; nomFrnsr: string | null },
    q: string
  ) =>
    !q ||
    fold(r.article).includes(q) ||
    fold(r.designation).includes(q) ||
    fold(r.nomFrnsr ?? '').includes(q)

  const ETAT_LABELS: Record<string, string> = {
    complet: 'Complet',
    manquant_0: 'US/UC manquant',
    manquant_1: 'UC/pal manquant',
    manquant_les_deux: 'Les deux manquants',
  }

  const rowsByTexte = createMemo(() => {
    const q = fold(query())
    return viewData().rows.filter((r) => matchTexte(r, q))
  })

  type Sel = { cats: Set<string>; frns: Set<string>; etats: Set<string> }

  const filtreCroise = (rows: ConditionnementDisplayRow[], s: Sel, exclude: keyof Sel) =>
    rows.filter((r) => {
      if (exclude !== 'cats' && s.cats.size && !s.cats.has(r.categorie || '—')) return false
      if (exclude !== 'frns' && s.frns.size && !s.frns.has(r.nomFrnsr ?? '—')) return false
      if (exclude !== 'etats' && s.etats.size && !s.etats.has(r.etatCoef)) return false
      return true
    })

  const compter = (
    rows: ConditionnementDisplayRow[],
    key: (r: ConditionnementDisplayRow) => string
  ): Map<string, number> => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const v = key(r)
      m.set(v, (m.get(v) ?? 0) + 1)
    }
    return m
  }

  const facettes = createMemo(() => {
    const base = rowsByTexte()
    const s: Sel = { cats: selCategories(), frns: selFournisseurs(), etats: selEtats() }
    const toF = (
      m: Map<string, number>,
      labels?: Record<string, string>,
      triDesc = false
    ): Facette[] => {
      const arr = [...m.entries()].map(([cle, count]) => ({
        cle,
        label: labels?.[cle] ?? cle,
        count,
      }))
      return triDesc
        ? arr.sort((a, b) => b.count - a.count)
        : arr.sort((a, b) => a.label.localeCompare(b.label))
    }
    return {
      etats: toF(
        compter(filtreCroise(base, s, 'etats'), (r) => r.etatCoef),
        ETAT_LABELS
      ),
      categories: toF(compter(filtreCroise(base, s, 'cats'), (r) => r.categorie || '—')),
      fournisseurs: toF(
        compter(filtreCroise(base, s, 'frns'), (r) => r.nomFrnsr ?? '—'),
        undefined,
        true
      ),
    }
  })

  const filteredRows = createMemo(() => {
    const s: Sel = { cats: selCategories(), frns: selFournisseurs(), etats: selEtats() }
    return filtreCroise(rowsByTexte(), s, '__aucune__' as keyof Sel)
  })

  /** Fusionne une ligne de base avec son enrichissement (si chargé). */
  const displayRows = createMemo<DisplayRow[]>(() => {
    const enr = enrichissements()
    return filteredRows().map((r) => {
      const e = enr[r.article]
      return {
        ...r,
        stock: e?.stock ?? null,
        stojou: e?.stojou ?? null,
        derniereEntree: e?.derniereEntree ?? null,
        typeEntree: e?.typeEntree ?? null,
        derniereSortie: e?.derniereSortie ?? null,
        typeSortie: e?.typeSortie ?? null,
        concordance: e?.concordance ?? { niveau: 0, nbSources: 0, nbConcordantes: 0 },
      }
    })
  })

  const toggleFacette = (set: (fn: (prev: Set<string>) => Set<string>) => void, cle: string) =>
    set((prev) => {
      const next = new Set(prev)
      if (next.has(cle)) next.delete(cle)
      else next.add(cle)
      return next
    })

  const nbFiltresActifs = createMemo(
    () => selCategories().size + selFournisseurs().size + selEtats().size
  )

  const tauxRemplissageFiltre = createMemo(() => {
    const rows = filteredRows()
    if (rows.length === 0) return 0
    return rows.filter((r) => r.etatCoef === 'complet').length / rows.length
  })

  const estimationsChargees = createMemo(() => enrichTrigger() > 0)

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead
        subtitle="Conditionnements · Rattrapage référentiel"
        active="conditionnements"
        meta={
          <>
            <div class="font-fraunces text-[12px] font-bold capitalize not-italic text-brand">
              {stats().totalArticles} article{stats().totalArticles > 1 ? 's' : ''}
            </div>
            <div>
              <b class="font-bold text-ferme">{stats().nbComplets}</b> complet
              {stats().nbComplets > 1 ? 's' : ''}
              {' · '}
              <b class="font-bold text-destructive">
                {stats().nbManquant0 + stats().nbManquant1 + stats().nbManquantLesDeux}
              </b>{' '}
              à rattraper
            </div>
            <div>
              Remplissage&nbsp;
              <b
                class={cx(
                  'font-bold tabular-nums',
                  tauxRemplissageFiltre() >= 0.8
                    ? 'text-ferme'
                    : tauxRemplissageFiltre() >= 0.5
                      ? 'text-suggere'
                      : 'text-destructive'
                )}
              >
                {(tauxRemplissageFiltre() * 100).toFixed(0)}%
              </b>
            </div>
          </>
        }
      />

      {/* ═══ Toolbar ═══ */}
      <div class="flex flex-none flex-wrap items-center gap-2.5 border-b border-rule px-7 py-2">
        <FacetteDropdown
          label="État"
          facettes={facettes().etats}
          selection={selEtats()}
          open={openDropdown() === 'etat'}
          onToggleOpen={() => setOpenDropdown((o) => (o === 'etat' ? null : 'etat'))}
          onToggle={(cle) => toggleFacette(setSelEtats, cle)}
          onClear={() => setSelEtats(new Set<string>())}
        />
        <FacetteDropdown
          label="Catégorie"
          facettes={facettes().categories}
          selection={selCategories()}
          open={openDropdown() === 'categorie'}
          onToggleOpen={() => setOpenDropdown((o) => (o === 'categorie' ? null : 'categorie'))}
          onToggle={(cle) => toggleFacette(setSelCategories, cle)}
          onClear={() => setSelCategories(new Set<string>())}
        />
        <FacetteDropdown
          label="Fournisseur"
          facettes={facettes().fournisseurs}
          selection={selFournisseurs()}
          open={openDropdown() === 'fournisseur'}
          onToggleOpen={() => setOpenDropdown((o) => (o === 'fournisseur' ? null : 'fournisseur'))}
          onToggle={(cle) => toggleFacette(setSelFournisseurs, cle)}
          onClear={() => setSelFournisseurs(new Set<string>())}
        />

        <Show when={nbFiltresActifs() > 0}>
          <button
            type="button"
            onClick={() => {
              setSelEtats(new Set<string>())
              setSelCategories(new Set<string>())
              setSelFournisseurs(new Set<string>())
            }}
            class="inline-flex items-center gap-1 rounded-md border border-rule bg-card px-2 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          >
            <span class="material-symbols-outlined text-[13px]">filter_alt_off</span>
            Réinitialiser ({nbFiltresActifs()})
          </button>
        </Show>

        {/* Recherche */}
        <div class="flex h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3 transition-shadow focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
          <span class="material-symbols-outlined text-[17px] text-muted-foreground">search</span>
          <input
            class="w-[200px] border-0 bg-transparent px-0 text-[12px] font-medium text-foreground shadow-none outline-none"
            placeholder="Article, désignation, fournisseur…"
            type="text"
            autocomplete="off"
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </div>

        <div class="ml-auto flex items-center gap-2">
          {/* Charger les estimations (lazy) */}
          <Show when={!estimationsChargees()}>
            <button
              type="button"
              onClick={() => setEnrichTrigger((t) => t + 1)}
              class="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-[11px] font-semibold text-brand transition-colors hover:bg-brand/20"
              title="Charger les estimations STOCK/STOJOU + mouvements (coûteux)"
            >
              <span class="material-symbols-outlined text-[14px]">insights</span>
              Charger les estimations
            </button>
          </Show>
          <Show when={estimationsChargees() && enrichments.loading}>
            <span class="inline-flex items-center gap-1 text-[11px] text-planifie">
              <span class="material-symbols-outlined animate-spin text-[14px]">
                progress_activity
              </span>
              Calcul…
            </span>
          </Show>

          <Show when={data.loading}>
            <span class="font-mono text-[11px] tabular-nums text-muted-foreground">
              {fmtMs(elapsed())}
            </span>
          </Show>
          <button
            type="button"
            onClick={() => setBust((b) => b + 1)}
            disabled={data.loading}
            class="inline-flex items-center gap-1 rounded-full border border-rule bg-card px-3 py-1 text-[11px] font-semibold transition-colors hover:border-brand disabled:opacity-50"
            title="Recharger les données X3"
          >
            <span
              class="material-symbols-outlined text-[14px] text-muted-foreground"
              classList={{ 'animate-spin': data.loading }}
            >
              refresh
            </span>
            Actualiser
          </button>
        </div>
      </div>

      {/* ═══ X3 injoignable ═══ */}
      <Show when={x3Error()}>
        <div class="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
          <span class="material-symbols-outlined text-[16px] text-destructive">warning</span>
          <span class="font-bold">Erreur chargement :</span>
          <span class="font-mono">{x3Error()}</span>
        </div>
      </Show>

      {/* ═══ Tableau ═══ */}
      <Show
        when={!data.loading}
        fallback={
          <div class="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <span class="material-symbols-outlined animate-spin text-[20px]">
              progress_activity
            </span>
            <span class="text-[13px] font-medium">Chargement des articles…</span>
          </div>
        }
      >
        <Show
          when={!data.error}
          fallback={
            <div class="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
              <span class="material-symbols-outlined text-[20px]">error</span>
              Échec du chargement.
            </div>
          }
        >
          <Show
            when={filteredRows().length > 0 || x3Error()}
            fallback={
              <div class="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
                <span class="material-symbols-outlined text-[32px] text-muted-foreground/50">
                  check_circle
                </span>
                <span class="font-fraunces text-[14px] italic text-muted-foreground">
                  Aucun article ne correspond au filtre.
                </span>
              </div>
            }
          >
            <div class="flex-1 overflow-auto">
              <table class="w-full border-collapse text-left">
                <thead class="sticky top-0 z-10 bg-card">
                  <tr>
                    <th class={TH}>Article</th>
                    <th class={TH}>Désignation</th>
                    <th class={TH}>Fournisseur</th>
                    <th class={cx(TH, 'text-right')}>US/UC</th>
                    <th class={cx(TH, 'text-right')}>UC/pal</th>
                    <Show when={estimationsChargees()}>
                      <th class={TH}>Dernière entrée</th>
                      <th class={TH}>Dernière sortie</th>
                    </Show>
                    <th class={cx(TH, 'text-right')}>STOCK</th>
                    <th class={cx(TH, 'text-right')}>STOJOU</th>
                    <Show when={estimationsChargees()}>
                      <th class={cx(TH, 'text-center')}>Concordance</th>
                    </Show>
                  </tr>
                </thead>
                <tbody>
                  <For each={displayRows()}>
                    {(r) => (
                      <tr
                        class={cx(
                          'border-t border-rule-soft hover:bg-foreground/[0.04]',
                          rowClass(r)
                        )}
                      >
                        <td class={TD}>
                          <div class="font-mono text-[13px] font-bold tracking-tight text-foreground">
                            {r.article}
                          </div>
                          <Show when={r.categorie}>
                            <span class="font-mono text-[9px] uppercase text-muted-foreground">
                              {r.categorie}
                            </span>
                          </Show>
                        </td>
                        <td class={TD}>
                          <span class="truncate text-[12px] text-secondary-foreground">
                            {r.designation || '—'}
                          </span>
                        </td>
                        <td class={TD}>
                          <Show
                            when={r.nomFrnsr}
                            fallback={
                              <span class="text-[11px] italic text-muted-foreground/40">—</span>
                            }
                          >
                            <div class="truncate text-[12px] text-foreground">{r.nomFrnsr}</div>
                            <Show when={r.codeFrnsr}>
                              <span class="font-mono text-[9px] text-muted-foreground">
                                {r.codeFrnsr}
                              </span>
                            </Show>
                          </Show>
                        </td>
                        <td class={cx(TD, 'text-right')}>
                          <CoefCell value={r.pcuStuCoe} />
                        </td>
                        <td class={cx(TD, 'text-right')}>
                          <CoefCell value={r.ucParPal} />
                        </td>
                        <Show when={estimationsChargees()}>
                          <td class={TD}>
                            <Show
                              when={r.derniereEntree}
                              fallback={
                                <span class="text-[11px] italic text-muted-foreground/40">—</span>
                              }
                            >
                              <div class="font-mono text-[11px] tabular-nums text-foreground">
                                {fmtFr(r.derniereEntree)}
                              </div>
                              <Show when={r.typeEntree}>
                                <span class="font-mono text-[9px] text-muted-foreground">
                                  {r.typeEntree}
                                </span>
                              </Show>
                            </Show>
                          </td>
                          <td class={TD}>
                            <Show
                              when={r.derniereSortie}
                              fallback={
                                <span class="text-[11px] italic text-muted-foreground/40">—</span>
                              }
                            >
                              <div class="font-mono text-[11px] tabular-nums text-foreground">
                                {fmtFr(r.derniereSortie)}
                              </div>
                              <Show when={r.typeSortie}>
                                <span class="font-mono text-[9px] text-muted-foreground">
                                  {r.typeSortie}
                                </span>
                              </Show>
                            </Show>
                          </td>
                        </Show>
                        <td class={cx(TD, 'text-right')}>
                          <Show
                            when={estimationsChargees()}
                            fallback={
                              <span class="text-[11px] italic text-muted-foreground/40">…</span>
                            }
                          >
                            <SourceCell src={r.stock} tone="ferme" label="STOCK" />
                          </Show>
                        </td>
                        <td class={cx(TD, 'text-right')}>
                          <Show
                            when={estimationsChargees()}
                            fallback={
                              <span class="text-[11px] italic text-muted-foreground/40">…</span>
                            }
                          >
                            <SourceCell src={r.stojou} tone="planifie" label="STOJOU" />
                          </Show>
                        </td>
                        <Show when={estimationsChargees()}>
                          <td class={cx(TD, 'text-center')}>
                            <ConcordanceBadge concordance={r.concordance} />
                          </td>
                        </Show>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  )
}

const TH =
  'px-4 py-[11px] font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground border-b border-rule border-r border-rule-soft'
const TD = 'px-4 py-[11px] align-middle border-r border-rule-soft'

/** Classe de ligne selon l'état du conditionnement. */
function rowClass(r: { etatCoef: string; stock: unknown; stojou: unknown }): string {
  if (r.etatCoef === 'complet') return ''
  const estime = r.stock || r.stojou
  if (!estime) {
    return 'bg-destructive/[0.03] [box-shadow:inset_3px_0_var(--color-destructive)]'
  }
  return 'bg-planifie/[0.03] [box-shadow:inset_3px_0_var(--color-planifie)]'
}

/** Cellule de coef : valeur si présente, « ? » rouge si manquant. */
const CoefCell: Component<{ value: number | null }> = (p) => (
  <Show
    when={p.value && p.value > 0}
    fallback={<span class="font-mono text-[13px] font-bold text-destructive">?</span>}
  >
    <span class="font-mono text-[12px] font-bold tabular-nums text-foreground">{p.value}</span>
  </Show>
)

/** Cellule d'une source d'estimation. */
const SourceCell: Component<{
  src: EstimationSourceDisplay | null
  tone: 'ferme' | 'planifie'
  label: string
}> = (p) => (
  <Show
    when={p.src}
    fallback={<span class="font-sans text-[11px] italic text-muted-foreground/40">—</span>}
  >
    <span
      class="inline-flex items-center gap-1"
      title={`${p.label} — ${p.src!.observations} observation(s) — confiance ${p.src!.confiance}`}
    >
      <span
        class={cx(
          'font-fraunces text-[14px] font-bold tabular-nums',
          p.tone === 'ferme' ? 'text-ferme' : 'text-planifie'
        )}
      >
        {p.src!.usParPalette}
      </span>
      <span class="font-mono text-[9px] text-muted-foreground">US/pal</span>
      <Show when={p.src!.confiance === 'faible'}>
        <span class="text-suggere" title="Confiance faible (< 3 observations)">
          ⚠
        </span>
      </Show>
    </span>
  </Show>
)

/**
 * Filtre à facettes : un bouton qui ouvre un panneau de cases à cocher.
 */
const FacetteDropdown: Component<{
  label: string
  facettes: Facette[]
  selection: Set<string>
  open: boolean
  onToggleOpen: () => void
  onToggle: (cle: string) => void
  onClear: () => void
}> = (p) => {
  const nbSelectionnees = () => p.selection.size
  return (
    <div class="relative">
      <button
        type="button"
        onClick={p.onToggleOpen}
        class={cx(
          'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors',
          nbSelectionnees() > 0
            ? 'border-brand/40 bg-brand/10 text-brand'
            : 'border-rule bg-card text-muted-foreground hover:text-foreground'
        )}
      >
        {p.label}
        <Show when={nbSelectionnees() > 0}>
          <span class="rounded bg-brand/20 px-1 text-[9px] tabular-nums">{nbSelectionnees()}</span>
        </Show>
        <span class="material-symbols-outlined text-[12px]">
          {p.open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      <Show when={p.open}>
        <div class="fixed inset-0 z-10" onClick={p.onToggleOpen} />
        <div class="absolute left-0 top-full z-20 mt-1 max-h-[320px] w-[240px] overflow-auto rounded-md border border-rule bg-card shadow-lg">
          <div class="sticky top-0 flex items-center justify-between border-b border-rule-soft bg-card px-2 py-1">
            <span class="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
              {p.label} ({p.facettes.length})
            </span>
            <Show when={nbSelectionnees() > 0}>
              <button
                type="button"
                onClick={p.onClear}
                class="font-mono text-[9px] font-bold uppercase tracking-wider text-brand hover:underline"
              >
                Effacer
              </button>
            </Show>
          </div>
          <For each={p.facettes}>
            {(f) => (
              <label class="flex cursor-pointer items-center gap-2 border-b border-rule-soft px-2 py-1.5 last:border-b-0 hover:bg-secondary/40">
                <input
                  type="checkbox"
                  class="accent-brand"
                  checked={p.selection.has(f.cle)}
                  onChange={() => p.onToggle(f.cle)}
                />
                <span class="flex-1 truncate text-[11px] text-foreground">{f.label}</span>
                <span class="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {f.count}
                </span>
              </label>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

/** Badge de concordance entre les 3 sources (UC/pal, STOCK, STOJOU). */
const ConcordanceBadge: Component<{
  concordance: { niveau: 0 | 1 | 2 | 3; nbSources: number; nbConcordantes: number }
}> = (p) => {
  const c = p.concordance
  // Pas de source → gris. 1 source isolée → ambre. 2 concordantes → bleu. 3 → vert.
  const cls = () => {
    if (c.nbSources === 0) return 'bg-muted text-muted-foreground'
    if (c.niveau >= 3) return 'bg-ferme/15 text-ferme'
    if (c.niveau >= 2) return 'bg-planifie/15 text-planifie'
    if (c.niveau === 1) return 'bg-suggere/15 text-suggere'
    return 'bg-destructive/15 text-destructive'
  }
  const label = () => {
    if (c.nbSources === 0) return '—'
    // Affiche nbConcordantes/nbSources (ex : "3/3", "2/3", "1/2").
    return `${c.nbConcordantes}/${(c.nbSources * (c.nbSources - 1)) / 2}`
  }
  const points = () => {
    // Points pleins selon le niveau de concordance (max 3).
    return '●'.repeat(c.niveau) + '○'.repeat(Math.max(0, 3 - c.niveau))
  }
  return (
    <span
      class={cx(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider',
        cls()
      )}
      title={`${c.nbConcordantes} paire(s) concordante(s) sur ${c.nbSources} source(s) disponible(s)`}
    >
      {points()}
    </span>
  )
}

export default Conditionnements
