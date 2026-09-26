import { useMemo, useState, type ReactNode } from 'react'
import {
  CircleX,
  CloudOff,
  Download,
  Inbox,
  LoaderCircle,
  Search,
  TriangleAlert,
} from 'lucide-react'

import AppLayout from '@r/layouts/app'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import { StockArticleSheet } from '@r/components/board/stock-article-sheet'
import {
  FilterMenu,
  FilterMenuSectionLabel,
  PILL,
  RefreshPill,
  Segment,
  SegmentButton,
  ToolbarRow,
  ToolbarSpacer,
} from '@r/components/vision/toolbar'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'

/**
 * Page « Analyse logistique » (ZPERFSC2 corrigée).
 *
 * Même grammaire que les pages sœurs du groupe Logistique (Réceptions,
 * Conditionnements) : toolbar `ToolbarRow` (Segment de rubrique, filtres
 * secondaires derrière un `FilterMenu`, recherche à droite), bandeau de
 * compteurs en mono/fraunces, puis le `DataTable` maison (tri par en-tête,
 * virtualisation, cartes sous md). Rien n'est réimplémenté à la main.
 */

type Abc = 'A' | 'B' | 'C' | null
type Profile = 'strategique' | 'lancement' | 'fin_de_vie' | 'standard' | 'sans_activite'
type View = 'stock' | 'flux' | 'pilotage'

interface LogisticsRow {
  article: string
  designation: string
  categorie: string
  famille: string | null
  fournisseurCode: string | null
  fournisseurNom: string | null
  delaiReapproJours: number | null
  lotTechnique: number | null
  lotEconomique: number | null
  stockSecurite: number | null
  stockA: number
  stockQ: number
  stockAlloue: number
  pmp: number
  stockActuel: number
  stockDisponible: number
  stockMoyen: number
  besoin12m: number
  besoinEnRetard: number
  besoinMoyenMensuel: number
  consommation12m: number
  joursMouvement: number
  operations: number
  cmjCalendaire: number | null
  moyenneParOperation: number | null
  valorisationStock: number
  valorisationConsommation: number
  valorisationBesoin: number
  rotation: number | null
  couvertureJours: number | null
  abcHistoriqueValeur: Abc
  abcHistoriqueFrequence: Abc
  abcPrevisionValeur: Abc
  profil: Profile
}

interface Response {
  rows: LogisticsRow[]
  site: string
  from: string
  to: string
  calendarDays: number
  x3Error: string | null
  computedAt?: number
}

const fmtQty = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const fmtDec = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
const fmtMoney = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})
const fmtPmp = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

const profileLabels: Record<Profile, string> = {
  strategique: 'Stratégique',
  lancement: 'Lancement / star',
  fin_de_vie: 'Fin de vie / obso',
  standard: 'Standard',
  sans_activite: 'Sans activité',
}

const profileTone: Record<Profile, string> = {
  strategique: 'bg-brand-soft text-brand',
  lancement: 'bg-ferme/10 text-ferme',
  fin_de_vie: 'bg-destructive/10 text-destructive',
  standard: 'bg-muted text-muted-foreground',
  sans_activite: 'bg-muted/60 text-muted-foreground/70',
}

const EMPTY_ROWS: LogisticsRow[] = []

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

/** jj/mm/aaaa — l'ISO reste côté machine (données X3). */
const isoToFr = (iso: string) => {
  if (!iso) return '…'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const fmtMs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`)

/* ─── Champs ────────────────────────────────────────────────────────────────
   Une seule table de champs alimente la colonne du DataTable ET l'export CSV :
   les deux ne peuvent pas diverger. */

interface Field {
  id: keyof LogisticsRow & string
  label: string
  value: (row: LogisticsRow) => string | number | null
  /** Formatage du nombre ; défaut = quantité entière. */
  fmt?: (value: number) => string
  render?: (row: LogisticsRow) => ReactNode
  /** Valeur exportée quand le CSV ne doit pas dire la valeur brute (profil). */
  csv?: (row: LogisticsRow) => string | number | null
  left?: boolean
  /** Largeur max du texte, tronqué (évite qu'une valeur longue casse la ligne). */
  maxW?: string
  /** Colonne figée à gauche pendant le défilement horizontal. */
  sticky?: boolean
}

const AbcBadge = ({ value }: { value: Abc }) => {
  if (!value) return <span className="text-muted-foreground/60">—</span>
  const tone =
    value === 'A'
      ? 'bg-ferme/10 text-ferme'
      : value === 'B'
        ? 'bg-warning/10 text-warning'
        : 'bg-muted text-muted-foreground'
  return (
    <span className={cn('inline-block rounded px-1.5 py-0.5 font-mono text-2xs font-bold', tone)}>
      {value}
    </span>
  )
}

const LEAD_FIELDS: Field[] = [
  {
    id: 'article',
    label: 'Article',
    value: (row) => row.article,
    left: true,
    sticky: true,
    render: (row) => <span className="font-mono text-xs font-semibold">{row.article}</span>,
  },
  {
    id: 'designation',
    label: 'Désignation',
    value: (row) => row.designation,
    left: true,
    maxW: '20rem',
  },
]

const text = (id: keyof LogisticsRow & string, label: string, maxW?: string): Field => ({
  id,
  label,
  value: (row) => (row[id] as string | null) ?? null,
  left: true,
  maxW,
})

const STOCK_FIELDS: Field[] = [
  text('categorie', 'Catégorie'),
  text('famille', 'Famille'),
  text('fournisseurNom', 'Fournisseur', '14rem'),
  { id: 'stockA', label: 'Stock A', value: (row) => row.stockA },
  { id: 'stockQ', label: 'Stock Q', value: (row) => row.stockQ },
  { id: 'stockDisponible', label: 'Dispo. A', value: (row) => row.stockDisponible },
  { id: 'stockSecurite', label: 'Sécurité', value: (row) => row.stockSecurite },
  { id: 'delaiReapproJours', label: 'Délai (j)', value: (row) => row.delaiReapproJours },
  { id: 'lotTechnique', label: 'Lot tech.', value: (row) => row.lotTechnique },
  { id: 'lotEconomique', label: 'Lot éco.', value: (row) => row.lotEconomique },
  { id: 'pmp', label: 'PMP', value: (row) => row.pmp, fmt: (v) => fmtPmp.format(v) },
  {
    id: 'valorisationStock',
    label: 'Valeur stock',
    value: (row) => row.valorisationStock,
    fmt: (v) => fmtMoney.format(v),
    render: (row) => (
      <span className="font-semibold tabular-nums">{fmtMoney.format(row.valorisationStock)}</span>
    ),
  },
]

const FLUX_FIELDS: Field[] = [
  { id: 'consommation12m', label: 'Conso 12m', value: (row) => row.consommation12m },
  { id: 'joursMouvement', label: 'Jours mvt', value: (row) => row.joursMouvement },
  { id: 'operations', label: 'Opérations', value: (row) => row.operations },
  {
    id: 'moyenneParOperation',
    label: 'Moy. / opération',
    value: (row) => row.moyenneParOperation,
    fmt: (v) => fmtDec.format(v),
  },
  {
    id: 'cmjCalendaire',
    label: 'CMJ / jour',
    value: (row) => row.cmjCalendaire,
    fmt: (v) => fmtDec.format(v),
  },
  { id: 'stockMoyen', label: 'Stock moyen', value: (row) => row.stockMoyen },
  {
    id: 'rotation',
    label: 'Rotation',
    value: (row) => row.rotation,
    fmt: (v) => fmtDec.format(v),
  },
  {
    id: 'couvertureJours',
    label: 'Couverture (j)',
    value: (row) => row.couvertureJours,
    fmt: (v) => fmtDec.format(v),
  },
  { id: 'besoin12m', label: 'Besoins 12m', value: (row) => row.besoin12m },
  { id: 'besoinEnRetard', label: 'Dont retard', value: (row) => row.besoinEnRetard },
  { id: 'besoinMoyenMensuel', label: 'Moy. / mois', value: (row) => row.besoinMoyenMensuel },
]

const PILOTAGE_FIELDS: Field[] = [
  text('categorie', 'Catégorie'),
  text('fournisseurNom', 'Fournisseur', '14rem'),
  {
    id: 'abcHistoriqueValeur',
    label: 'ABC conso €',
    value: (row) => row.abcHistoriqueValeur,
    render: (row) => <AbcBadge value={row.abcHistoriqueValeur} />,
  },
  {
    id: 'abcHistoriqueFrequence',
    label: 'ABC fréquence',
    value: (row) => row.abcHistoriqueFrequence,
    render: (row) => <AbcBadge value={row.abcHistoriqueFrequence} />,
  },
  {
    id: 'abcPrevisionValeur',
    label: 'ABC besoin €',
    value: (row) => row.abcPrevisionValeur,
    render: (row) => <AbcBadge value={row.abcPrevisionValeur} />,
  },
  {
    id: 'profil',
    label: 'Profil',
    value: (row) => row.profil,
    csv: (row) => profileLabels[row.profil],
    left: true,
    render: (row) => (
      <span
        className={cn(
          'inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-2xs font-semibold',
          profileTone[row.profil]
        )}
      >
        {profileLabels[row.profil]}
      </span>
    ),
  },
  {
    id: 'valorisationConsommation',
    label: 'Valeur conso',
    value: (row) => row.valorisationConsommation,
    fmt: (v) => fmtMoney.format(v),
  },
  {
    id: 'valorisationBesoin',
    label: 'Valeur besoins',
    value: (row) => row.valorisationBesoin,
    fmt: (v) => fmtMoney.format(v),
  },
]

const FIELDS_BY_VIEW: Record<View, Field[]> = {
  stock: STOCK_FIELDS,
  flux: FLUX_FIELDS,
  pilotage: PILOTAGE_FIELDS,
}

const FIELD_BY_ID = new Map<string, Field>(
  [LEAD_FIELDS, STOCK_FIELDS, FLUX_FIELDS, PILOTAGE_FIELDS]
    .flat()
    .map((field) => [field.id, field] as const)
)

/** Colonnes de l'export = article, désignation puis toutes les rubriques, sans doublon. */
const CSV_FIELDS: Field[] = (() => {
  const seen = new Set<string>()
  const out: Field[] = []
  for (const field of [
    LEAD_FIELDS[0],
    LEAD_FIELDS[1],
    ...STOCK_FIELDS,
    ...FLUX_FIELDS,
    ...PILOTAGE_FIELDS,
  ]) {
    if (seen.has(field.id)) continue
    seen.add(field.id)
    out.push(field)
  }
  return out
})()

function downloadCsv(rows: LogisticsRow[]) {
  const escape = (value: string | number | null) => {
    const raw = value === null ? '' : String(value)
    const guard = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
    return `"${guard.replace(/"/g, '""')}"`
  }
  const content = [
    CSV_FIELDS.map((field) => escape(field.label)).join(';'),
    ...rows.map((row) =>
      CSV_FIELDS.map((field) => escape((field.csv ?? field.value)(row))).join(';')
    ),
  ].join('\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'analyse-logistique.csv'
  link.click()
  URL.revokeObjectURL(url)
}

/** Cellule : `—` pour l'inconnu, format français pour les nombres. */
const display = (field: Field, row: LogisticsRow): ReactNode => {
  const value = field.value(row)
  if (value === null || value === '') return <span className="text-muted-foreground/60">—</span>
  if (typeof value === 'number') return (field.fmt ?? fmtQty.format)(value)
  if (field.maxW)
    return (
      <span className="block truncate" style={{ maxWidth: field.maxW }} title={value}>
        {value}
      </span>
    )
  return value
}

const columnFor = (field: Field): ColumnDef<LogisticsRow> => ({
  id: field.id,
  header: field.label,
  cell: ({ row }) => (field.render ? field.render(row.original) : display(field, row.original)),
  meta: {
    // `whitespace-nowrap` sur l'en-tête : sans lui, « Dispo. A » ou « Valeur stock »
    // passent à la ligne et le libellé se chevauche avec la flèche de tri.
    thClass: cn(
      'whitespace-nowrap',
      field.left ? 'text-left' : 'text-right',
      field.sticky && 'sticky left-0 z-20 bg-card'
    ),
    tdClass: cn(
      'whitespace-nowrap text-xs',
      field.left ? 'text-left' : 'text-right font-mono tabular-nums',
      field.sticky && 'sticky left-0 z-[1] bg-card'
    ),
  },
})

/* ─── Filtre (facette du FilterMenu) ─────────────────────────────────────── */

function Facet({
  label,
  value,
  options,
  onChange,
  allLabel,
  labels,
}: {
  label: string
  value: string
  options: string[]
  onChange: (value: string) => void
  allLabel: string
  labels?: Record<string, string>
}) {
  if (options.length === 0) return null
  const rowClass = (active: boolean) =>
    cn(
      'w-full truncate rounded-md px-2 py-1 text-left text-xs transition-colors',
      active ? 'bg-brand-soft font-semibold text-brand' : 'text-foreground hover:bg-muted'
    )
  return (
    <div className="border-b border-rule-soft px-0.5 pb-2 last:border-b-0 last:pb-0 mb-2 last:mb-0">
      <FilterMenuSectionLabel>{label}</FilterMenuSectionLabel>
      <div className="max-h-40 overflow-auto">
        <button type="button" className={rowClass(value === '')} onClick={() => onChange('')}>
          {allLabel}
        </button>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={rowClass(value === option)}
            onClick={() => onChange(option)}
            title={labels?.[option] ?? option}
          >
            {labels?.[option] ?? option}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AnalyseLogistique({ rowsHref }: { rowsHref: string }) {
  const [bust, setBust] = useState(0)
  const [query, setQuery] = useState('')
  const [categorie, setCategorie] = useState('')
  const [famille, setFamille] = useState('')
  const [fournisseur, setFournisseur] = useState('')
  const [profil, setProfil] = useState('')
  const [view, setView] = useState<View>('stock')
  const [sorting, setSorting] = useState<SortingState[]>([{ id: 'valorisationStock', desc: true }])
  const [article, setArticle] = useState<string | null>(null)

  const url = bust ? `${rowsHref}?refresh=${bust}` : rowsHref
  const { data, loading, error, ms, elapsed } = useTimedFetch<Response>(url)
  const rows = data?.rows ?? EMPTY_ROWS

  const options = useMemo(() => {
    const distinct = (values: Array<string | null>) =>
      [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
        a.localeCompare(b, 'fr')
      )
    return {
      categories: distinct(rows.map((row) => row.categorie)),
      familles: distinct(rows.map((row) => row.famille)),
      fournisseurs: distinct(rows.map((row) => row.fournisseurNom)),
    }
  }, [rows])

  const filtered = useMemo(() => {
    const needle = fold(query.trim())
    return rows.filter(
      (row) =>
        (!needle ||
          fold(`${row.article} ${row.designation} ${row.fournisseurNom ?? ''}`).includes(needle)) &&
        (!categorie || row.categorie === categorie) &&
        (!famille || row.famille === famille) &&
        (!fournisseur || row.fournisseurNom === fournisseur) &&
        (!profil || row.profil === profil)
    )
  }, [rows, query, categorie, famille, fournisseur, profil])

  const sorted = useMemo(() => {
    const first = sorting[0]
    const field = first ? FIELD_BY_ID.get(first.id) : undefined
    if (!first || !field) return filtered
    const direction = first.desc ? -1 : 1
    return [...filtered].sort((a, b) => {
      const left = field.value(a)
      const right = field.value(b)
      const byArticle = a.article.localeCompare(b.article, 'fr')
      if (left === null && right === null) return byArticle
      if (left === null) return 1
      if (right === null) return -1
      const order =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'fr')
      return direction * order || byArticle
    })
  }, [filtered, sorting])

  const totals = useMemo(
    () => ({
      stock: filtered.reduce((sum, row) => sum + row.valorisationStock, 0),
      consommation: filtered.reduce((sum, row) => sum + row.valorisationConsommation, 0),
      besoin: filtered.reduce((sum, row) => sum + row.valorisationBesoin, 0),
      sousSecurite: filtered.filter(
        (row) => row.stockSecurite !== null && row.stockDisponible < row.stockSecurite
      ).length,
    }),
    [filtered]
  )

  const activeFilters = [categorie, famille, fournisseur, profil].filter(Boolean).length
  const columns = useMemo(
    () => [LEAD_FIELDS[0], LEAD_FIELDS[1], ...FIELDS_BY_VIEW[view]].map(columnFor),
    [view]
  )
  const resetFilters = () => {
    setCategorie('')
    setFamille('')
    setFournisseur('')
    setProfil('')
  }

  return (
    <AppLayout
      title="Analyse logistique"
      active="logistics_analysis"
      subtitle="Logistique · Analyse ABC"
      theme="airbnb"
      dense
      scrollable={false}
    >
      <div data-print-page className="flex h-full flex-col overflow-hidden">
        {/* ═══ Toolbar ═══ */}
        <ToolbarRow>
          <Segment role="radiogroup" ariaLabel="Rubrique">
            <SegmentButton
              role="radio"
              active={view === 'stock'}
              onClick={() => setView('stock')}
              title="Stock, articles et paramètres d'approvisionnement"
            >
              Stock
            </SegmentButton>
            <SegmentButton
              role="radio"
              active={view === 'flux'}
              onClick={() => setView('flux')}
              title="Consommation, rotation et couverture"
            >
              Flux
            </SegmentButton>
            <SegmentButton
              role="radio"
              active={view === 'pilotage'}
              onClick={() => setView('pilotage')}
              title="Classes ABC et profil de vie"
            >
              Pilotage
            </SegmentButton>
          </Segment>

          <FilterMenu
            label="Filtres"
            indicators={
              activeFilters > 0 ? (
                <span className="font-mono text-2xs font-bold text-brand">{activeFilters}</span>
              ) : undefined
            }
          >
            <Facet
              label="Catégorie"
              value={categorie}
              options={options.categories}
              onChange={setCategorie}
              allLabel="Toutes catégories"
            />
            <Facet
              label="Famille"
              value={famille}
              options={options.familles}
              onChange={setFamille}
              allLabel="Toutes familles"
            />
            <Facet
              label="Fournisseur"
              value={fournisseur}
              options={options.fournisseurs}
              onChange={setFournisseur}
              allLabel="Tous fournisseurs"
            />
            <Facet
              label="Profil"
              value={profil}
              options={Object.keys(profileLabels)}
              labels={profileLabels}
              onChange={setProfil}
              allLabel="Tous profils"
            />
            {activeFilters > 0 && (
              <button
                type="button"
                className={cn(PILL, 'w-full justify-center')}
                onClick={resetFilters}
              >
                Réinitialiser les filtres
              </button>
            )}
          </FilterMenu>

          <ToolbarSpacer />

          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {loading ? fmtMs(elapsed) : ms !== null ? fmtMs(ms) : ''}
          </span>

          {/* Recherche — systématiquement à droite (convention toolbar). */}
          <div className={PILL}>
            <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[180px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none placeholder:text-muted-foreground"
              placeholder="Article, désignation, fournisseur…"
              type="text"
              autoComplete="off"
              aria-label="Rechercher un article"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>

          <button
            type="button"
            onClick={() => downloadCsv(sorted)}
            disabled={sorted.length === 0}
            className={cn(PILL, 'disabled:opacity-40')}
            title="Exporter la sélection en CSV"
          >
            <Download size={14} strokeWidth={1.75} className="text-muted-foreground" />
            <span className="font-mono text-2xs font-semibold">CSV</span>
          </button>

          <RefreshPill loading={loading} onClick={() => setBust((value) => value + 1)} />
        </ToolbarRow>

        {/* ═══ Bandeau compteurs ═══ */}
        <div className="flex flex-none flex-wrap items-stretch border-b border-rule-soft px-4 md:px-7 print:hidden">
          {(
            [
              ['Articles', fmtQty.format(filtered.length), 'après filtres'],
              ['Valeur stock A + Q', fmtMoney.format(totals.stock), null],
              ['Valeur consommation', fmtMoney.format(totals.consommation), 'sorties nettes'],
              [
                'Sous stock de sécurité',
                fmtQty.format(totals.sousSecurite),
                'sur stock A non alloué',
              ],
            ] as const
          ).map(([label, value, hint]) => (
            <div
              key={label}
              className="flex flex-col justify-center gap-0.5 border-l border-rule-soft px-4 py-1.5 first:border-l-0 first:pl-0"
            >
              <span className="font-mono text-3xs font-bold uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
              <span className="font-fraunces text-[18px] font-extrabold leading-none tabular-nums text-foreground">
                {value}
              </span>
              {hint && <span className="font-mono text-3xs text-muted-foreground/70">{hint}</span>}
            </div>
          ))}

          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 font-mono text-[11px] text-muted-foreground">
            <span>
              Site {data?.site ?? 'AE1'} · {isoToFr(data?.from ?? '')} → {isoToFr(data?.to ?? '')} ·{' '}
              {data?.calendarDays ?? 0} j
            </span>
            <span title="Valeur des besoins ouverts à moins de 12 mois, retards inclus">
              Besoins {fmtMoney.format(totals.besoin)}
            </span>
          </div>
        </div>

        {/* ═══ X3 injoignable ═══ */}
        {data?.x3Error && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 md:px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Erreur chargement analyse :</span>
            <span className="font-mono">{data.x3Error}</span>
          </div>
        )}

        {/* ═══ Table ═══ */}
        {loading && !data ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
            <LoaderCircle size={20} strokeWidth={1.75} className="animate-spin" />
            <span className="text-[13px] font-medium">
              Calcul de l'analyse logistique… {fmtMs(elapsed)}
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
            <CircleX size={20} strokeWidth={1.75} />
            Échec du chargement de l'analyse logistique.
          </div>
        ) : (
          <div
            className={cn(
              'flex min-h-0 flex-1 flex-col transition-opacity duration-150',
              loading && 'pointer-events-none opacity-50'
            )}
          >
            <DataTable
              columns={columns}
              rows={sorted}
              sorting={sorting}
              onSortingChange={setSorting}
              getRowKey={(row) => row.article}
              selectedRowKey={article}
              onRowClick={(row) => setArticle(row.article)}
              columnDividers
              mobileCards
              scrollContainerClass="h-full rounded-lg border-rule"
              emptyState={
                <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center">
                  {data?.x3Error ? (
                    <CloudOff size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
                  ) : (
                    <Inbox size={32} strokeWidth={1.75} className="text-muted-foreground/50" />
                  )}
                  <span className="font-fraunces text-[14px] italic text-muted-foreground">
                    {data?.x3Error
                      ? 'Données indisponibles (X3 injoignable).'
                      : 'Aucun article ne correspond aux filtres.'}
                  </span>
                </div>
              }
            />
          </div>
        )}

        {/* ═══ Méthode de calcul ═══ */}
        <details className="flex-none border-t border-rule-soft px-4 pb-1.5 md:px-7 print:hidden">
          <summary className="cursor-pointer list-none py-1.5 font-mono text-3xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground">
            Méthode de calcul
          </summary>
          <div className="grid gap-1.5 pb-2 text-[11px] text-muted-foreground md:grid-cols-2">
            <p>
              Stock disponible = stock A moins allocations, borné à zéro. Le stock Q reste visible à
              part et entre dans la valorisation A + Q.
            </p>
            <p>
              Consommation = sorties nettes par document (livraisons des produits concernés et
              sorties d'OF). La CMJ divise cette quantité par les jours calendaires de la fenêtre.
            </p>
            <p>
              Stock moyen = moyenne des stocks de fin de mois reconstruits depuis le stock courant.
              Rotation = consommation / stock moyen ; couverture = stock disponible / CMJ.
            </p>
            <p>
              Besoins = commandes clients et besoins matières ouverts à moins de 12 mois, retards
              inclus. Les classes ABC répartissent la valeur ou les opérations aux seuils 80 % / 95
              %.
            </p>
          </div>
        </details>

        <StockArticleSheet
          article={article}
          open={article !== null}
          onOpenChange={(open) => !open && setArticle(null)}
        />
      </div>
    </AppLayout>
  )
}
