import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from 'react'
import { Lightbulb, RefreshCw, TriangleAlert, CircleX } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { LoadingState } from '@r/components/ui/loading-state'
import { Pill } from '@r/components/ui/pill'
import { Separator } from '@r/components/ui/separator'
import {
  ToolbarFilterChip,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarRefresh,
  ToolbarSearch,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import {
  ConditionnementsTable,
  type DisplayRow,
  ETAT_LABELS,
  type Facette,
} from '@r/components/conditionnements/conditionnements-views'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import type {
  ConditionnementDisplayRow,
  ConditionnementsRowsResponse,
  EstimationsFetchResponse,
} from '@r/lib/conditionnements/types'

/**
 * Page « Conditionnements » (port React) : vue complète des articles actifs avec
 * leurs coefs + estimation US/palette (STOCK SM* / STOJOU rangement REC) + contexte.
 *
 * **Chargement en 2 temps** (cold start maîtrisé) :
 *  1. Articles seuls (ITMMASTER, fast) → tableau + filtres + KPI immédiats.
 *  2. Enrichissements (estimations + mouvements, coûteux) → chargés au trigger :
 *     bouton « Charger les estimations » ou automatiquement si filtre « manquants » actif.
 *
 * Migrée sur le design system cursor (vitrine `/design-system`) :
 * • `theme="cursor"` ; la barre passe par la prop `toolbar` d'AppLayout ;
 * • la barre suit le standard §18 : menu Filtres unique (État / Catégorie /
 *   Fournisseur), recherche et actualiser — plus de `vision/toolbar` ;
 * • la table est un `DataTable` dans une `Card` ; cellules `CellStack` /
 *   `CellNumber` / `CellDate` / `Badge` — plus de `font-fraunces` ni de filet
 *   Airbnb (`border-rule`, `shadow-float`).
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

const ETAT_TONES: Record<string, 'critical' | 'warning' | 'ok' | 'neutral'> = {
  complet: 'ok',
  manquant_0: 'warning',
  manquant_1: 'warning',
  manquant_les_deux: 'critical',
}

/** Une facette du menu Filtres : « Tous » (défaut = aucune sélection) + chips. */
function FacetteSection({
  title,
  facettes,
  selection,
  onToggle,
  onClear,
  tones,
  scrollable,
}: {
  title: string
  facettes: Facette[]
  selection: Set<string>
  onToggle: (cle: string) => void
  onClear: () => void
  tones?: Record<string, 'critical' | 'warning' | 'ok' | 'neutral'>
  scrollable?: boolean
}) {
  const total = facettes.reduce((s, f) => s + f.count, 0)
  const chips = (
    <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
      <ToolbarFilterChip
        label="Tous"
        count={total}
        tone="neutral"
        active={selection.size === 0}
        onClick={onClear}
      />
      {facettes.map((f) => (
        <ToolbarFilterChip
          key={f.cle}
          label={f.label}
          count={f.count}
          tone={tones?.[f.cle] ?? 'neutral'}
          active={selection.has(f.cle)}
          onClick={() => onToggle(f.cle)}
        />
      ))}
    </ToolbarSegmented>
  )
  return (
    <>
      <ToolbarFilterSection>{title}</ToolbarFilterSection>
      {scrollable ? <div className="max-h-[220px] overflow-y-auto">{chips}</div> : chips}
    </>
  )
}

export default function Conditionnements(props: ConditionnementsPageProps) {
  const [query, setQuery] = useState('')
  const [bust, setBust] = useState(0)

  // ── Filtres à facettes ──
  const [selCategories, setSelCategories] = useState<Set<string>>(new Set())
  const [selFournisseurs, setSelFournisseurs] = useState<Set<string>>(new Set())
  const [selEtats, setSelEtats] = useState<Set<string>>(new Set())

  // ── Chargement 1 : articles (fast) ──
  const url = useMemo(() => {
    return bust ? `${props.rowsHref}?refresh=${bust}` : props.rowsHref
  }, [props.rowsHref, bust])

  const { data, loading, error } = useTimedFetch<ConditionnementsRowsResponse>(url)

  const viewData = data ?? EMPTY
  const x3Error = viewData.x3Error

  // ── Chargement 2 : enrichissements (lazy) ──
  const [enrichTrigger, setEnrichTrigger] = useState(0)

  const estimationsUrl = useMemo(() => {
    const href = viewData.estimationsHref
    if (!href || enrichTrigger === 0) return null
    // Restreint aux articles manquants visibles (filtre actif) pour limiter le calcul.
    const manquants = viewData.rows.filter((r) => r.etatCoef !== 'complet').map((r) => r.article)
    const params = new URLSearchParams()
    if (manquants.length > 0 && manquants.length < 500) {
      params.set('articles', manquants.join(','))
    }
    const queryString = params.toString()
    return bust ? `${href}?${queryString}&refresh=${bust}` : `${href}?${queryString}`
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

  // `?? {}` rendait un objet NEUF à chaque rendu, ce qui faisait recalculer le
  // useMemo consommateur à chaque fois — mémoïsation annulée en silence.
  const enrichissements = useMemo(() => enrichments?.enrichissements ?? {}, [enrichments])
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

  const filtreCroise = useCallback(
    (rows: ConditionnementDisplayRow[], s: Sel, exclude: keyof Sel) =>
      rows.filter((r) => {
        if (exclude !== 'cats' && s.cats.size && !s.cats.has(r.categorie || '—')) return false
        if (exclude !== 'frns' && s.frns.size && !s.frns.has(r.nomFrnsr ?? '—')) return false
        if (exclude !== 'etats' && s.etats.size && !s.etats.has(r.etatCoef)) return false
        return true
      }),
    []
  )

  const compter = useCallback(
    (
      rows: ConditionnementDisplayRow[],
      key: (r: ConditionnementDisplayRow) => string
    ): Map<string, number> => {
      const m = new Map<string, number>()
      for (const r of rows) {
        const v = key(r)
        m.set(v, (m.get(v) ?? 0) + 1)
      }
      return m
    },
    []
  )

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
  }, [rowsByTexte, selCategories, selFournisseurs, selEtats, compter, filtreCroise])

  const filteredRows = useMemo(() => {
    const s: Sel = { cats: selCategories, frns: selFournisseurs, etats: selEtats }
    return filtreCroise(rowsByTexte, s, '__aucune__' as keyof Sel)
  }, [rowsByTexte, selCategories, selFournisseurs, selEtats, filtreCroise])

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

  const activeFilterCount =
    (selEtats.size > 0 ? 1 : 0) +
    (selCategories.size > 0 ? 1 : 0) +
    (selFournisseurs.size > 0 ? 1 : 0)

  /* ── Barre d'outils (standard §18) ───────────────────────────────────────
     Zone 01 portée : absente (une seule vue). Zone 02 : un déclencheur unique
     pour les trois facettes. Zone 03 : recherche. Zone 04 : action lazy
     + actualiser. Pas de `<Toolbar>` : la prop d'AppLayout en est déjà un. */
  const toolbar = (
    <>
      <ToolbarFilterMenu activeCount={activeFilterCount} width={320} align="start">
        <div className="max-h-[min(70vh,480px)] overflow-y-auto">
          <FacetteSection
            title="État"
            facettes={facettes.etats}
            selection={selEtats}
            onToggle={(cle) => toggleFacette(setSelEtats, cle)}
            onClear={() => setSelEtats(new Set<string>())}
            tones={ETAT_TONES}
          />
          <Separator className="my-2" />
          <FacetteSection
            title="Catégorie"
            facettes={facettes.categories}
            selection={selCategories}
            onToggle={(cle) => toggleFacette(setSelCategories, cle)}
            onClear={() => setSelCategories(new Set<string>())}
          />
          <Separator className="my-2" />
          <FacetteSection
            title="Fournisseur"
            facettes={facettes.fournisseurs}
            selection={selFournisseurs}
            onToggle={(cle) => toggleFacette(setSelFournisseurs, cle)}
            onClear={() => setSelFournisseurs(new Set<string>())}
            scrollable
          />
        </div>
      </ToolbarFilterMenu>

      <ToolbarSpacer />

      <ToolbarSearch
        value={query}
        onChange={setQuery}
        placeholder="Article, désignation, fournisseur…"
      />

      {(!estimationsChargees || enrichmentsLoading) && (
        <Pill
          variant="soft"
          className="gap-1.5"
          disabled={enrichmentsLoading}
          onClick={() => setEnrichTrigger((t) => t + 1)}
          title="Charger les estimations STOCK/STOJOU + mouvements (coûteux)"
        >
          {enrichmentsLoading ? (
            <RefreshCw size={14} strokeWidth={1.75} className="animate-spin" />
          ) : (
            <Lightbulb size={14} strokeWidth={1.75} />
          )}
          {enrichmentsLoading ? 'Calcul…' : 'Charger les estimations'}
        </Pill>
      )}

      <ToolbarRefresh loading={loading} onClick={() => setBust((b) => b + 1)} />
    </>
  )

  return (
    <AppLayout
      title="Conditionnements"
      active="conditionnements"
      subtitle="Conditionnements · Rattrapage référentiel"
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
    >
      {/* Colonne flex plein écran (même coquille que Réceptions / Expéditions) :
          `dense` + `scrollable={false}` donnent un <main> en overflow-hidden, donc
          c'est le tableau qui scrolle (via son `flex-1 min-h-0 overflow-auto`).
          Sans ce wrapper flex, le `flex-1` du tableau n'a pas de parent flex, ne
          borne rien, et le contenu est coupé sans ascenseur. */}
      <div data-print-page className="flex h-full min-h-0 flex-col overflow-hidden">
        {/* ═══ X3 injoignable ═══ */}
        {x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
            <span className="font-semibold">Erreur chargement :</span>
            <span className="truncate font-mono">{x3Error}</span>
          </div>
        )}

        {/* ═══ Tableau ═══ */}
        {loading && !data ? (
          <LoadingState
            className="flex-1"
            variant="orb"
            orbState="searching"
            title="Chargement des articles…"
            description="Lecture ITMMASTER · coefficients US/UC et UC/pal"
          />
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
            <CircleX size={20} strokeWidth={1.75} className="text-destructive" />
            <p className="text-sm font-medium text-foreground">Articles indisponibles</p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              ITMMASTER n'a pas répondu. Actualise ou réessaye. Si l'erreur persiste, vérifie la
              connexion VPN / X3.
            </p>
          </div>
        ) : filteredRows.length === 0 && !x3Error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
            <p className="text-sm font-medium text-foreground">
              {viewData.rows.length === 0 ? 'Aucun article' : 'Aucun article ne correspond'}
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              {viewData.rows.length === 0
                ? 'Aucun article actif n’a été renvoyé par X3.'
                : 'Aucune ligne ne correspond à ce filtre · enlève la recherche ou change les facettes.'}
            </p>
          </div>
        ) : (
          <ConditionnementsTable rows={displayRows} estimationsChargees={estimationsChargees} />
        )}
      </div>
    </AppLayout>
  )
}
