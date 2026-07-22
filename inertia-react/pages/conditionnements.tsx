import { type Dispatch, type SetStateAction, useMemo, useState } from 'react'
import { FilterX, Search, Lightbulb, LoaderCircle, TriangleAlert, CircleX, CircleCheck } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { PILL, RefreshPill, ToolbarRow } from '@r/components/vision/toolbar'
import {
  ConditionnementsTable,
  type DisplayRow,
  FacetteDropdown,
  ETAT_LABELS,
  type Facette,
} from '@r/components/conditionnements/conditionnements-views'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'
import type {
  ConditionnementsRowsResponse,
  EstimationsFetchResponse,
} from '@/lib/conditionnements/types'

/**
 * Page « Conditionnements » (port React) : vue complète des articles actifs avec
 * leurs coefs + estimation US/palette (STOCK SM* / STOJOU rangement REC) + contexte.
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

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

export default function Conditionnements(props: ConditionnementsPageProps) {
  const [query, setQuery] = useState('')
  const [bust, setBust] = useState(0)

  // ── Filtres à facettes ──
  const [selCategories, setSelCategories] = useState<Set<string>>(new Set())
  const [selFournisseurs, setSelFournisseurs] = useState<Set<string>>(new Set())
  const [selEtats, setSelEtats] = useState<Set<string>>(new Set())
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  // ── Chargement 1 : articles (fast) ──
  const url = useMemo(() => {
    return bust ? `${props.rowsHref}?refresh=${bust}` : props.rowsHref
  }, [props.rowsHref, bust])

  const { data, loading, error, elapsed } = useTimedFetch<ConditionnementsRowsResponse>(url)

  const viewData = data ?? EMPTY
  const stats = viewData.stats
  const x3Error = viewData.x3Error

  // ── Chargement 2 : enrichissements (lazy) ──
  const [enrichTrigger, setEnrichTrigger] = useState(0)

  const estimationsUrl = useMemo(() => {
    const href = viewData.estimationsHref
    if (!href || enrichTrigger === 0) return null
    // Restreint aux articles manquants visibles (filtre actif) pour limiter le calcul.
    const manquants = viewData.rows
      .filter((r) => r.etatCoef !== 'complet')
      .map((r) => r.article)
    const params = new URLSearchParams()
    if (manquants.length > 0 && manquants.length < 500) {
      params.set('articles', manquants.join(','))
    }
    const queryString = params.toString()
    return bust
      ? `${href}?${queryString}&refresh=${bust}`
      : `${href}?${queryString}`
  }, [viewData.estimationsHref, enrichTrigger, bust, viewData.rows])

  // On utilise un fetch simple pour les estimations (pas de useTimedFetch pour éviter le conflit)
  const [enrichments, setEnrichments] = useState<EstimationsFetchResponse | null>(null)
  const [enrichmentsLoading, setEnrichmentsLoading] = useState(false)

  // Fetch estimations quand l'URL change
  useMemo(() => {
    if (!estimationsUrl) {
      setEnrichments(null)
      setEnrichmentsLoading(false)
      return
    }
    let cancelled = false
    setEnrichmentsLoading(true)
    fetch(estimationsUrl, { headers: { accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<EstimationsFetchResponse>
      })
      .then((json) => {
        if (!cancelled) setEnrichments(json)
      })
      .catch(() => {
        if (!cancelled) setEnrichments(null)
      })
      .finally(() => {
        if (!cancelled) setEnrichmentsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [estimationsUrl])

  const enrichissements = enrichments?.enrichissements ?? {}
  const estimationsChargees = enrichTrigger > 0

  // ── Facettes ──
  const matchTexte = (
    r: { article: string; designation: string; nomFrnsr: string | null },
    q: string
  ) =>
    !q ||
    fold(r.article).includes(q) ||
    fold(r.designation).includes(q) ||
    fold(r.nomFrnsr ?? '').includes(q)

  type Sel = { cats: Set<string>; frns: Set<string>; etats: Set<string> }

  const rowsByTexte = useMemo(() => {
    const q = fold(query)
    return viewData.rows.filter((r) => matchTexte(r, q))
  }, [query, viewData.rows])

  const filtreCroise = (rows: typeof viewData.rows, s: Sel, exclude: keyof Sel) =>
    rows.filter((r) => {
      if (exclude !== 'cats' && s.cats.size && !s.cats.has(r.categorie || '—')) return false
      if (exclude !== 'frns' && s.frns.size && !s.frns.has(r.nomFrnsr ?? '—')) return false
      if (exclude !== 'etats' && s.etats.size && !s.etats.has(r.etatCoef)) return false
      return true
    })

  const compter = (
    rows: typeof viewData.rows,
    key: (r: (typeof rows)[0]) => string
  ): Map<string, number> => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const v = key(r)
      m.set(v, (m.get(v) ?? 0) + 1)
    }
    return m
  }

  const facettes = useMemo(() => {
    const base = rowsByTexte
    const s: Sel = { cats: selCategories, frns: selFournisseurs, etats: selEtats }
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
  }, [rowsByTexte, selCategories, selFournisseurs, selEtats])

  const filteredRows = useMemo(() => {
    const s: Sel = { cats: selCategories, frns: selFournisseurs, etats: selEtats }
    return filtreCroise(rowsByTexte, s, '__aucune__' as keyof Sel)
  }, [rowsByTexte, selCategories, selFournisseurs, selEtats])

  /** Fusionne une ligne de base avec son enrichissement (si chargé). */
  const displayRows = useMemo<DisplayRow[]>(() => {
    const enr = enrichissements
    return filteredRows.map((r) => {
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
  }, [filteredRows, enrichissements])

  const toggleFacette = (set: Dispatch<SetStateAction<Set<string>>>, cle: string) => {
    set((prev) => {
      const next = new Set(prev)
      if (next.has(cle)) next.delete(cle)
      else next.add(cle)
      return next
    })
  }

  const nbFiltresActifs = selCategories.size + selFournisseurs.size + selEtats.size

  const tauxRemplissageFiltre = useMemo(() => {
    const rows = filteredRows
    if (rows.length === 0) return 0
    return rows.filter((r) => r.etatCoef === 'complet').length / rows.length
  }, [filteredRows])

  return (
    <AppLayout
      title="Conditionnements"
      active="conditionnements"
      subtitle="Conditionnements · Rattrapage référentiel"
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <>
          <div className="font-fraunces text-[12px] font-bold capitalize not-italic text-brand">
            {stats.totalArticles} article{stats.totalArticles > 1 ? 's' : ''}
          </div>
          <div>
            <b className="font-bold text-ferme">{stats.nbComplets}</b> complet
            {stats.nbComplets > 1 ? 's' : ''}
            {' · '}
            <b className="font-bold text-destructive">
              {stats.nbManquant0 + stats.nbManquant1 + stats.nbManquantLesDeux}
            </b>{' '}
            à rattraper
          </div>
          <div>
            Remplissage&nbsp;
            <b
              className={cn(
                'font-bold tabular-nums',
                tauxRemplissageFiltre >= 0.8
                  ? 'text-ferme'
                  : tauxRemplissageFiltre >= 0.5
                    ? 'text-suggere'
                    : 'text-destructive'
              )}
            >
              {(tauxRemplissageFiltre * 100).toFixed(0)}%
            </b>
          </div>
        </>
      }
    >
      {/* Colonne flex plein écran (même coquille que Réceptions / Expéditions) :
          `dense` + `scrollable={false}` donnent un <main> en overflow-hidden, donc
          c'est le tableau qui scrolle (via son `flex-1 min-h-0 overflow-auto`).
          Sans ce wrapper flex, le `flex-1` du tableau n'a pas de parent flex, ne
          borne rien, et le contenu est coupé sans ascenseur. */}
      <div data-print-page className="flex h-full flex-col overflow-hidden">
        {/* ═══ Toolbar ═══ */}
        <ToolbarRow>
          <FacetteDropdown
            label="État"
            facettes={facettes.etats}
            selection={selEtats}
            open={openDropdown === 'etat'}
            onToggleOpen={() => setOpenDropdown((o) => (o === 'etat' ? null : 'etat'))}
            onToggle={(cle) => toggleFacette(setSelEtats, cle)}
            onClear={() => setSelEtats(new Set<string>())}
          />
          <FacetteDropdown
            label="Catégorie"
            facettes={facettes.categories}
            selection={selCategories}
            open={openDropdown === 'categorie'}
            onToggleOpen={() => setOpenDropdown((o) => (o === 'categorie' ? null : 'categorie'))}
            onToggle={(cle) => toggleFacette(setSelCategories, cle)}
            onClear={() => setSelCategories(new Set<string>())}
          />
          <FacetteDropdown
            label="Fournisseur"
            facettes={facettes.fournisseurs}
            selection={selFournisseurs}
            open={openDropdown === 'fournisseur'}
            onToggleOpen={() => setOpenDropdown((o) => (o === 'fournisseur' ? null : 'fournisseur'))}
            onToggle={(cle) => toggleFacette(setSelFournisseurs, cle)}
            onClear={() => setSelFournisseurs(new Set<string>())}
          />

          {nbFiltresActifs > 0 && (
            <button
              type="button"
              onClick={() => {
                setSelEtats(new Set<string>())
                setSelCategories(new Set<string>())
                setSelFournisseurs(new Set<string>())
              }}
              className={cn(PILL, 'text-muted-foreground hover:text-foreground')}
            >
              <FilterX size={14} strokeWidth={1.75} />
              Réinitialiser ({nbFiltresActifs})
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Recherche — systématiquement à droite (convention toolbar). */}
            <div className={PILL}>
              <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
              <input
                className="w-[200px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
                placeholder="Article, désignation, fournisseur…"
                type="text"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
              />
            </div>
            {/* Charger les estimations (lazy) */}
            {!estimationsChargees && (
              <button
                type="button"
                onClick={() => setEnrichTrigger((t) => t + 1)}
                className={cn(PILL, 'border-brand/40 bg-brand-soft text-brand hover:bg-brand/20')}
                title="Charger les estimations STOCK/STOJOU + mouvements (coûteux)"
              >
                <Lightbulb size={14} strokeWidth={1.75} />
                Charger les estimations
              </button>
            )}
            {estimationsChargees && enrichmentsLoading && (
              <span className="inline-flex items-center gap-1 text-[11px] text-planifie">
                <LoaderCircle size={14} strokeWidth={1.75} className="animate-spin" />
                Calcul…
              </span>
            )}

            {loading && (
              <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                {fmtMs(elapsed)}
              </span>
            )}
            <RefreshPill loading={loading} onClick={() => setBust((b) => b + 1)} />
          </div>
        </ToolbarRow>

        {/* ═══ X3 injoignable ═══ */}
        {x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Erreur chargement :</span>
            <span className="font-mono">{x3Error}</span>
          </div>
        )}

        {/* ═══ Tableau ═══ */}
        {loading && !data ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <LoaderCircle size={20} strokeWidth={1.75} className="animate-spin" />
            <span className="text-[13px] font-medium">Chargement des articles…</span>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
            <CircleX size={20} strokeWidth={1.75} />
            Échec du chargement.
          </div>
        ) : (
          <ConditionnementsTable
            rows={displayRows}
            estimationsChargees={estimationsChargees}
            emptyState={
              filteredRows.length === 0 && !x3Error ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
                  <CircleCheck size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
                  <span className="font-fraunces text-[14px] italic text-muted-foreground">
                    Aucun article ne correspond au filtre.
                  </span>
                </div>
              ) : undefined
            }
          />
        )}
      </div>
    </AppLayout>
  )
}
