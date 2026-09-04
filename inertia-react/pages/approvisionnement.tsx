/**
 * Page « Approvisionnement » — plan besoins matières (lot 1).
 *
 * Coquille Inertia instantanée ; le calcul (explosion nomenclature complète +
 * netting priorité ferme) est fetché via useTimedFetch — même motif que
 * /suivi. Mise en page alignée sur scheduler/tracking.tsx (thème airbnb
 * dense, ToolbarRow unique, FilterMenu, PILL recherche, DataTable officiel,
 * drawer latéral) : en-têtes de périodes empilés sur une rangée (DataTable
 * ne gère pas le colSpan — le libellé n'est rendu qu'une fois, côté Ferme).
 */
import { Fragment, useMemo, useState } from 'react'
import { CircleX, FilterX, Search, TriangleAlert } from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { cn } from '@r/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@r/components/ui/sheet'
import DataTable, { type ColumnDef } from '@r/components/ui/data-table'
import { SkeletonRow } from '@r/components/ui/skeleton'
import { DynamicIcon } from '@r/components/ui/dynamic-icon'
import {
  PILL,
  Segment,
  SegmentButton,
  RefreshPill,
  ToolbarRow,
  ToolbarSpacer,
  FilterMenu,
  FilterMenuSectionLabel,
} from '@r/components/vision/toolbar'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { useDataStatusStore } from '@r/lib/data-status-store'
import { route } from '@r/lib/routes'
import type {
  ApproBucket,
  ApproCran,
  ApproDetail,
  ApproGran,
  ApproPayload,
  ApproRow,
} from '@r/lib/appro/types'

type Preset = '2sem' | 'mois' | 'moisprochain' | '3mois' | '6mois' | 'libre'

const PRESETS: { id: Preset; label: string }[] = [
  { id: '2sem', label: '2 semaines' },
  { id: 'mois', label: 'Mois en cours' },
  { id: 'moisprochain', label: 'Mois prochain' },
  { id: '3mois', label: '3 mois' },
  { id: '6mois', label: '6 mois' },
  { id: 'libre', label: 'Libre' },
]

const GRANS: { id: ApproGran; label: string }[] = [
  { id: 'jour', label: 'Jour' },
  { id: 'semaine', label: 'Semaine' },
  { id: 'mois', label: 'Mois' },
]

const CRANS: { id: ApproCran; label: string; hint: string }[] = [
  { id: 'brut', label: 'Brut', hint: 'Besoin explosé, avant toute déduction' },
  { id: 'net', label: 'Net', hint: 'Brut − stock (le stock couvre le ferme en priorité)' },
  {
    id: 'reste',
    label: 'Reste à couvrir',
    hint: 'Net − pièces déjà produites sur OF en cours (sous-ensembles)',
  },
]

const isoDay = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${da}`
}

const endOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() + 1, 0)
const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * 86_400_000)

function presetRange(preset: Preset, today: Date): { from: string; to: string } {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  switch (preset) {
    case '2sem':
      return { from: isoDay(t), to: isoDay(addDays(t, 13)) }
    case 'mois':
      return { from: isoDay(t), to: isoDay(endOfMonth(t)) }
    case 'moisprochain': {
      const first = new Date(t.getFullYear(), t.getMonth() + 1, 1)
      return { from: isoDay(first), to: isoDay(endOfMonth(first)) }
    }
    case '3mois':
      return {
        from: isoDay(t),
        to: isoDay(addDays(new Date(t.getFullYear(), t.getMonth() + 3, 1), -1)),
      }
    case '6mois':
      return {
        from: isoDay(t),
        to: isoDay(addDays(new Date(t.getFullYear(), t.getMonth() + 6, 1), -1)),
      }
    case 'libre':
      return { from: isoDay(t), to: isoDay(addDays(t, 13)) }
  }
}

/**
 * Compte de périodes côté client — même règle que le serveur
 * (`materialBuckets`, plafond 14) : l'option hors-plafond est désactivée AVANT
 * le fetch, pas refusée après.
 */
function countPeriods(fromIso: string, toIso: string, gran: ApproGran): number | null {
  const from = new Date(`${fromIso}T00:00:00`)
  const to = new Date(`${toIso}T00:00:00`)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return null
  if (gran === 'jour') return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
  if (gran === 'semaine') {
    const dow = (from.getDay() + 6) % 7
    const monday = new Date(from.getTime() - dow * 86_400_000)
    return Math.floor((to.getTime() - monday.getTime()) / (7 * 86_400_000)) + 1
  }
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1
}

/** Séparateur décimal français : la virgule, pas le point (convention suivi). */
const fr = (n: number): string => n.toString().replace('.', ',')

/** Valorisation stock en euros — même formatter que la fiche article dashboard. */
const fmtEuro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

type SupplyFilter = 'TOUS' | 'ACHAT' | 'FABRICATION'
/** Tri par défaut : valorisation du stock (enjeu financier d'abord). */
type SortKey = 'valeur' | 'net' | 'article'

const cranOf = (row: ApproRow, cran: ApproCran, i: number, ferme: boolean): number => {
  if (cran === 'brut') return ferme ? row.brutFerme[i] : row.brutPrevi[i]
  if (cran === 'net') return ferme ? row.netFerme[i] : row.netPrevi[i]
  return ferme ? row.resteFerme[i] : row.restePrevi[i]
}

const cranTotal = (row: ApproRow, cran: ApproCran): number => {
  const pick =
    cran === 'brut'
      ? row.brutFerme.concat(row.brutPrevi)
      : cran === 'net'
        ? row.netFerme.concat(row.netPrevi)
        : row.resteFerme.concat(row.restePrevi)
  return pick.reduce((s, v) => s + v, 0)
}

const resteTotal = (row: ApproRow): number =>
  row.resteFerme.reduce((s, v) => s + v, 0) + row.restePrevi.reduce((s, v) => s + v, 0)

export default function Approvisionnement() {
  const today = useMemo(() => new Date(), [])
  const [preset, setPreset] = useState<Preset>('moisprochain')
  const [custom, setCustom] = useState(() => presetRange('libre', new Date()))
  const [gran, setGran] = useState<ApproGran>('semaine')
  const [cran, setCran] = useState<ApproCran>('net')
  const [query, setQuery] = useState('')
  const [supply, setSupply] = useState<SupplyFilter>('ACHAT')
  const [manquesOnly, setManquesOnly] = useState(false)
  const [sort, setSort] = useState<SortKey>('valeur')
  const [selected, setSelected] = useState<string | null>(null)

  const range = preset === 'libre' ? custom : presetRange(preset, today)
  const granAllowed = (g: ApproGran): boolean => (countPeriods(range.from, range.to, g) ?? 99) <= 14
  // Maille effective DÉRIVÉE (pas d'état, pas de double fetch) : repli sur la
  // plus fine encore permise quand le choix dépasse le plafond — signalé par
  // le liseré, jamais corrigé en silence.
  const effGran: ApproGran = granAllowed(gran)
    ? gran
    : ((['jour', 'semaine', 'mois'] as ApproGran[]).find((g) => granAllowed(g)) ?? gran)
  const folded = effGran !== gran
  const overCap = !granAllowed(effGran)

  // Même geste, même chemin que le ⟳ du masthead (cf. tracking.tsx) : le bump
  // incrémente le nonce, qui relance le fetch AVEC ?refresh (force le re-fetch
  // X3 côté serveur au lieu du cache SWR).
  const bust = useDataStatusStore((s) => s.nonce)
  const url = overCap
    ? null
    : `${route('material.plan')}?from=${range.from}&to=${range.to}&gran=${effGran}${bust ? `&refresh=${bust}` : ''}`
  const { data, loading, error, ms, elapsed } = useTimedFetch<ApproPayload>(url)
  const view = useMemo(() => data?.rows ?? [], [data])

  const rows = useMemo(() => {
    const q = fold(query.trim())
    const out = view.filter((r) => {
      if (supply !== 'TOUS' && r.supplyType !== supply) return false
      if (manquesOnly && resteTotal(r) <= 0) return false
      if (q && !fold(`${r.article} ${r.description}`).includes(q)) return false
      return true
    })
    // Valorisation : décroissante, PMP inconnu en dernier (pas de valeur = pas
    // de priorité financière, jamais l'inverse).
    out.sort((a, b) => {
      if (sort === 'article') return a.article.localeCompare(b.article)
      if (sort === 'valeur') {
        if (a.valeur == null && b.valeur == null) return 0
        if (a.valeur == null) return 1
        if (b.valeur == null) return -1
        return b.valeur - a.valeur
      }
      return cranTotal(b, cran) - cranTotal(a, cran)
    })
    return out
  }, [view, query, supply, manquesOnly, sort, cran])

  // Filtres secondaires uniquement (hors recherche, toujours visible) — même
  // doctrine que suivi : un filtre est « actif » quand il s'écarte du défaut.
  const filtersActive = supply !== 'ACHAT' || manquesOnly || sort !== 'valeur'
  const isFiltered = !!query.trim() || filtersActive

  const resetFilters = () => {
    setQuery('')
    setSupply('ACHAT')
    setManquesOnly(false)
    setSort('valeur')
  }

  const chipCount = (on: boolean, count?: number) =>
    count !== undefined && count > 0 ? (
      <span
        className={cn(
          'rounded-full px-1.5 py-px text-[8px] font-extrabold leading-none tabular-nums',
          on ? 'bg-brand/15 text-brand' : 'bg-foreground/[0.06] text-muted-foreground'
        )}
      >
        {count}
      </span>
    ) : null

  const manquesCount = useMemo(() => view.filter((r) => resteTotal(r) > 0).length, [view])

  return (
    <AppLayout
      title="Approvisionnement"
      active="approvisionnement"
      subtitle="Approvisionnement · Besoins matières"
      theme="airbnb"
      dense
      scrollable={false}
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* ═══ Toolbar ═══ */}
        <ToolbarRow className="select-none" noWrap>
          <Segment role="radiogroup" ariaLabel="Fenêtre" className="shrink-0">
            {PRESETS.map((p) => (
              <SegmentButton
                key={p.id}
                role="radio"
                active={preset === p.id}
                onClick={() => setPreset(p.id)}
              >
                {p.label}
              </SegmentButton>
            ))}
          </Segment>
          {preset === 'libre' && (
            <span className="flex shrink-0 items-center gap-1 text-xs">
              <input
                type="date"
                value={custom.from}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                aria-label="Début de fenêtre"
                className="min-h-[30px] rounded-full border border-rule bg-card px-3 text-xs font-semibold"
              />
              <span className="text-muted-foreground">→</span>
              <input
                type="date"
                value={custom.to}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                aria-label="Fin de fenêtre"
                className="min-h-[30px] rounded-full border border-rule bg-card px-3 text-xs font-semibold"
              />
            </span>
          )}
          <Segment role="radiogroup" ariaLabel="Maille" className="shrink-0">
            {GRANS.map((g) => {
              const ok = granAllowed(g.id)
              return (
                <span
                  key={g.id}
                  title={
                    ok
                      ? undefined
                      : 'Hors plafond 14 périodes à cette fenêtre — élargissez la maille'
                  }
                  className={cn(!ok && 'opacity-40')}
                >
                  <SegmentButton
                    role="radio"
                    active={gran === g.id}
                    onClick={() => ok && setGran(g.id)}
                  >
                    {g.label}
                  </SegmentButton>
                </span>
              )
            })}
          </Segment>
          <Segment role="radiogroup" ariaLabel="Cran de quantité" className="shrink-0">
            {CRANS.map((c) => (
              <SegmentButton
                key={c.id}
                role="radio"
                active={cran === c.id}
                onClick={() => setCran(c.id)}
                title={c.hint}
              >
                {c.label}
              </SegmentButton>
            ))}
          </Segment>
          <FilterMenu
            label="Filtres"
            indicators={
              filtersActive ? (
                <span className="ml-0.5 size-1.5 rounded-full bg-brand" aria-hidden="true" />
              ) : null
            }
          >
            <FilterMenuSectionLabel>Type</FilterMenuSectionLabel>
            <Segment className="w-full justify-between">
              {(['TOUS', 'ACHAT', 'FABRICATION'] as SupplyFilter[]).map((s) => (
                <SegmentButton key={s} active={supply === s} onClick={() => setSupply(s)}>
                  {s === 'TOUS' ? 'Tous' : s === 'ACHAT' ? 'Achetés' : 'Fabriqués'}
                </SegmentButton>
              ))}
            </Segment>
            <div className="my-2.5 border-t border-rule-soft" />
            <FilterMenuSectionLabel>Affichage</FilterMenuSectionLabel>
            <Segment className="w-full flex-wrap">
              <SegmentButton
                active={manquesOnly}
                onClick={() => setManquesOnly((v) => !v)}
                title="N'afficher que les composants dont le reste à couvrir est non nul"
              >
                Manques seuls
                {chipCount(manquesOnly, manquesCount)}
              </SegmentButton>
            </Segment>
            <div className="my-2.5 border-t border-rule-soft" />
            <FilterMenuSectionLabel>Tri</FilterMenuSectionLabel>
            <Segment className="w-full flex-wrap">
              <SegmentButton
                active={sort === 'valeur'}
                onClick={() => setSort('valeur')}
                title="Stock × PMP actuel, décroissant (PMP inconnu en dernier)"
              >
                Valorisation
              </SegmentButton>
              <SegmentButton active={sort === 'net'} onClick={() => setSort('net')}>
                Net ↓
              </SegmentButton>
              <SegmentButton active={sort === 'article'} onClick={() => setSort('article')}>
                A→Z
              </SegmentButton>
            </Segment>
          </FilterMenu>
          <ToolbarSpacer />
          <div className={cn(PILL, 'shrink-0')}>
            <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[200px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
              placeholder="Article, désignation…"
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
          {isFiltered && (
            <span className="font-mono text-xs font-bold tabular-nums text-brand">
              {rows.length}{' '}
              <span className="font-medium text-muted-foreground">/ {view.length}</span>
            </span>
          )}
          {loading && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {elapsed >= 1000 ? `${(elapsed / 1000).toFixed(1)}s` : `${elapsed}ms`}
            </span>
          )}
          {!loading && ms !== null && (
            <span
              className="font-mono text-xs tabular-nums text-muted-foreground/60"
              title="Durée dernier chargement X3"
            >
              {ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}
            </span>
          )}
          <RefreshPill loading={loading} onClick={() => useDataStatusStore.getState().bump()} />
        </ToolbarRow>
        {/* Mentions explicites non négociables (D1, §6.2) — ligne discrète,
            pas de titre : le contexte est déjà porté par le Masthead. */}
        <div className="flex-none px-7 pt-1.5 text-[11px] leading-snug text-muted-foreground">
          Besoins datés à la date de demande client, sans décalage de délai · Quantités en unités de
          stock (pas en unités d'achat) · Stock affecté au{' '}
          <span className="font-semibold text-foreground">ferme en priorité</span> (lecture
          différente de /charge) · Voici mon besoin, pas « à commander ».
        </div>
        {/* ═══ Bannières ═══ */}
        {data?.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Erreur chargement :</span>
            <span className="font-mono">{data.x3Error}</span>
          </div>
        )}
        {data && data.truncated > 0 && (
          <div className="flex flex-none items-center gap-2 border-b border-warning/40 bg-warning/10 px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-warning" />
            <span className="font-bold">Profondeur tronquée :</span>
            <span>
              {data.truncated} branche(s) coupée(s) — les lignes marquées ⚠ ont une descendance
              incomplète.
            </span>
          </div>
        )}

        {/* Sélection hors plafond : liseré, PAS remplacement — le dernier plan
            calculé reste affiché, le calcul est suspendu (url null). */}
        {overCap && (
          <div className="flex flex-none items-center gap-2 border-b border-warning/40 bg-warning/10 px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-warning" />
            <span className="font-bold">Sélection hors plafond :</span>
            <span>
              14 périodes max — dernier plan affiché, élargissez la maille ou réduisez la fenêtre
              pour recalculer.
            </span>
          </div>
        )}
        {folded && !overCap && (
          <div className="flex flex-none items-center gap-2 px-7 pt-1 text-[11px] text-muted-foreground">
            <span>
              Maille repliée sur {GRANS.find((g) => g.id === effGran)?.label} (plafond 14 périodes)
              — votre choix ({GRANS.find((g) => g.id === gran)?.label}) est conservé pour les
              fenêtres plus courtes.
            </span>
          </div>
        )}

        {/* ═══ Table ═══
            Le plan précédent reste affiché pendant le re-fetch (donnée gardée
            par useTimedFetch) : changer de filtre ne vide jamais l'écran. */}
        {loading && !data ? (
          <div className="flex-1 overflow-hidden p-5">
            <SkeletonRow count={6} />
          </div>
        ) : error && !data ? (
          <div className="flex flex-1 items-center justify-center p-12 text-center">
            <div className="flex flex-col items-center">
              <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground/60">
                <DynamicIcon name="cloud_off" size={28} strokeWidth={1.75} />
              </div>
              <h3 className="mb-1 font-sans text-[14px] font-bold text-foreground">
                Erreur de connexion Sage X3
              </h3>
              <p className="mb-5 max-w-sm font-sans text-[12px] leading-normal text-muted-foreground">
                Impossible de récupérer le plan besoins depuis le serveur ERP Sage X3.
              </p>
            </div>
          </div>
        ) : !data ? (
          <div className="flex flex-1 items-center justify-center p-12 text-center">
            <div className="flex flex-col items-center">
              <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground/60">
                <DynamicIcon name="search_off" size={28} strokeWidth={1.75} />
              </div>
              <h3 className="mb-1 font-sans text-[14px] font-bold text-foreground">
                Fenêtre trop large pour cette maille
              </h3>
              <p className="mb-5 max-w-sm font-sans text-[12px] leading-normal text-muted-foreground">
                Plafond 14 périodes : élargissez la maille ou réduisez la fenêtre.
              </p>
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-12 text-center">
            <div className="flex flex-col items-center">
              <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-secondary text-muted-foreground/60">
                <DynamicIcon name="search_off" size={28} strokeWidth={1.75} />
              </div>
              <h3 className="mb-1 font-sans text-[14px] font-bold text-foreground">
                Aucun résultat trouvé
              </h3>
              <p className="mb-5 max-w-sm font-sans text-[12px] leading-normal text-muted-foreground">
                Aucun composant ne correspond aux filtres ou à la recherche actuels.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-card px-4 py-1.5 font-sans text-[11px] font-bold text-foreground transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand"
              >
                <FilterX size={13} strokeWidth={1.75} className="leading-none" />
                Réinitialiser les filtres
              </button>
            </div>
          </div>
        ) : (
          data && (
            <div className="min-h-0 flex-1 overflow-hidden p-5">
              <ApproTable
                buckets={data.buckets}
                rows={rows}
                cran={cran}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
          )
        )}
        {/* Drawer « appelé par » — même motif que le diagnostic de ligne suivi. */}
        <ApproDetailSheet
          article={selected}
          version={data?.version ?? null}
          from={range.from}
          to={range.to}
          onClose={() => setSelected(null)}
        />
      </div>
    </AppLayout>
  )
}

/**
 * Table besoins — composant `DataTable` officiel (même rendu que /suivi :
 * virtualisation, surlignage de sélection, filets). Tri désactivé colonne par
 * colonne (le tri reste piloté par le menu Filtres › Tri) ; en-têtes de
 * périodes empilés (période + Ferme/Prév.) sur une seule rangée.
 */
function ApproTable(props: {
  buckets: ApproBucket[]
  rows: ApproRow[]
  cran: ApproCran
  selected: string | null
  onSelect: (article: string) => void
}) {
  const { buckets, rows, cran } = props

  const columns = useMemo<ColumnDef<ApproRow>[]>(
    () => [
      {
        id: 'article',
        header: 'Composant',
        accessorFn: (r) => r.article,
        enableSorting: false,
        meta: {
          thClass: 'w-[110px]',
          tdClass: 'font-mono text-[12px] font-bold tracking-tight text-foreground',
        },
        cell: ({ row }) => (
          <span title="Voir l'origine du besoin (appelé par)">
            {row.original.article}
            {row.original.tronque && (
              <span title="Descendance incomplète (plafond de profondeur)"> ⚠</span>
            )}
          </span>
        ),
      },
      {
        id: 'description',
        header: 'Désignation',
        accessorFn: (r) => r.description,
        enableSorting: false,
        // Plancher anti-écrasement : flexible au-delà, jamais sous le libellé.
        meta: { thClass: 'min-w-[220px]', tdClass: 'min-w-[220px]' },
        cell: ({ row }) => (
          <span className="block truncate text-muted-foreground" title={row.original.description}>
            {row.original.description}
          </span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        accessorFn: (r) => r.supplyType,
        enableSorting: false,
        meta: { thClass: 'w-[80px]', tdClass: 'text-muted-foreground' },
        cell: ({ row }) => (row.original.supplyType === 'ACHAT' ? 'Acheté' : 'Fabriqué'),
      },
      {
        id: 'stock',
        header: 'Stock',
        accessorFn: (r) => r.stock,
        enableSorting: false,
        meta: {
          thClass: 'w-[95px] text-right',
          tdClass: 'text-right font-mono tabular-nums',
        },
        cell: ({ row }) => fr(row.original.stock),
      },
      {
        id: 'valeur',
        header: 'Valo',
        accessorFn: (r) => r.valeur,
        enableSorting: false,
        meta: {
          thClass: 'w-[100px] text-right',
          tdClass: 'text-right font-mono tabular-nums text-muted-foreground',
        },
        cell: ({ row }) =>
          row.original.valeur == null ? (
            <span
              className="text-muted-foreground/50"
              title="PMP inconnu — Stock × PMP actuel (ITMMVT)"
            >
              —
            </span>
          ) : (
            <span title={`Stock × PMP actuel = ${fmtEuro.format(row.original.valeur)}`}>
              {fmtEuro.format(row.original.valeur)}
            </span>
          ),
      },
      {
        id: 'total',
        header: `Total ${cran}`,
        accessorFn: (r) => cranTotal(r, cran),
        enableSorting: false,
        meta: {
          thClass: 'w-[150px] text-right font-bold text-foreground whitespace-nowrap',
          tdClass: 'text-right font-mono font-bold tabular-nums',
        },
        cell: ({ row }) => fr(cranTotal(row.original, cran)),
      },
      // En-tête groupé sans colSpan (DataTable : une rangée) : le libellé de
      // période n'est rendu qu'une fois, côté Ferme — le filet vertical marque
      // le début du groupe, comme un colSpan visuel.
      ...buckets.flatMap((b, i) => [
        {
          id: `${b.key}-ferme`,
          header: (
            <span className="flex flex-col items-end whitespace-nowrap leading-tight">
              <span className="font-bold text-foreground">{b.label}</span>
              <span className="text-[11px] font-medium">Ferme</span>
            </span>
          ),
          accessorFn: (r: ApproRow) => cranOf(r, cran, i, true),
          enableSorting: false,
          meta: {
            thClass: 'w-[104px] border-l border-rule text-right',
            tdClass: 'border-l border-rule text-right font-mono tabular-nums',
          },
          cell: ({ row }: { row: { original: ApproRow } }) => {
            const v = cranOf(row.original, cran, i, true)
            return v === 0 ? <span className="text-muted-foreground/50">—</span> : fr(v)
          },
        },
        {
          id: `${b.key}-prevision`,
          header: (
            <span className="text-[11px] font-medium whitespace-nowrap text-muted-foreground/70">
              Prév.
            </span>
          ),
          accessorFn: (r: ApproRow) => cranOf(r, cran, i, false),
          enableSorting: false,
          meta: {
            thClass: 'w-[104px] text-right',
            tdClass: 'text-right font-mono tabular-nums text-muted-foreground',
          },
          cell: ({ row }: { row: { original: ApproRow } }) => {
            const v = cranOf(row.original, cran, i, false)
            return v === 0 ? <span className="text-muted-foreground/50">—</span> : fr(v)
          },
        },
      ]),
    ],
    [buckets, cran]
  )

  return (
    <DataTable
      columns={columns}
      rows={rows}
      sorting={[]}
      onSortingChange={() => {}}
      tableClass="table-fixed"
      scrollContainerClass="h-full border border-rule rounded-lg shadow-float bg-card"
      theadRowClass="sticky top-0 z-10 bg-secondary"
      getRowKey={(r) => r.article}
      onRowClick={(r) => props.onSelect(r.article)}
      selectedRowKey={props.selected}
    />
  )
}

function ApproDetailSheet(props: {
  article: string | null
  version: string | null
  from: string
  to: string
  onClose: () => void
}) {
  const url =
    props.article && props.version
      ? `${route('material.detail')}?v=${encodeURIComponent(props.version)}&article=${encodeURIComponent(props.article)}&from=${props.from}&to=${props.to}`
      : null
  const { data, loading, error } = useTimedFetch<ApproDetail>(url)

  return (
    <Sheet open={props.article !== null} onOpenChange={(open) => !open && props.onClose()}>
      {props.article &&
        (loading || !data ? (
          <SheetContent className="no-scrollbar overflow-y-auto sm:max-w-xl">
            <SheetHeader>
              <SheetTitle className="font-mono">{props.article}</SheetTitle>
              <SheetDescription>{error ? error.message : 'Origines du besoin…'}</SheetDescription>
            </SheetHeader>
          </SheetContent>
        ) : (
          <SheetContent className="no-scrollbar overflow-y-auto sm:max-w-xl">
            <SheetHeader>
              <SheetTitle className="font-mono">{data.article}</SheetTitle>
              <SheetDescription>
                Appelé par — {data.lignes.length} origine(s), rejouée(s) depuis le snapshot de la
                grille.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">
              {data.lignes.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-muted-foreground">
                  Aucune origine sur cette fenêtre.
                </p>
              ) : (
                <table className="w-full border-collapse text-[12px]">
                  <thead>
                    <tr className="text-left text-xs font-medium text-muted-foreground">
                      <th className="px-2 py-1.5 font-medium">Commande</th>
                      <th className="px-2 py-1.5 font-medium">Client</th>
                      <th className="px-2 py-1.5 font-medium">Produit fini</th>
                      <th className="px-2 py-1.5 font-medium">Nature</th>
                      <th className="px-2 py-1.5 text-right font-medium">Qté appelée</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lignes.map((l, i) => (
                      <Fragment key={i}>
                        <tr className="border-t border-rule-soft">
                          <td className="px-2 py-1.5 font-mono font-bold tracking-tight">
                            {l.numCommande ?? '—'}
                            {l.ligne ? (
                              <span className="ml-1.5 text-[10px] font-medium text-muted-foreground">
                                L{l.ligne}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-2 py-1.5 text-muted-foreground">{l.client || '—'}</td>
                          <td className="px-2 py-1.5 font-mono">{l.pfArticle}</td>
                          <td className="px-2 py-1.5">
                            {l.nature === 'ferme' ? (
                              'Ferme'
                            ) : (
                              <span className="text-muted-foreground">Prévision</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums">
                            {fr(l.quantite)}
                          </td>
                        </tr>
                        {l.path.length > 0 && (
                          <tr>
                            <td
                              colSpan={5}
                              className="px-2 pb-1.5 font-mono text-[10px] text-muted-foreground"
                              title={l.path.join(' › ')}
                            >
                              via {l.path.join(' › ')}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </SheetContent>
        ))}
    </Sheet>
  )
}
