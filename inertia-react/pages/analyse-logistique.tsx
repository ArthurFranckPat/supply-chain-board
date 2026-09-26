import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, RefreshCw, Search } from 'lucide-react'
import AppLayout from '@r/layouts/app'
import { StockArticleSheet } from '@r/components/board/stock-article-sheet'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'

type Abc = 'A' | 'B' | 'C' | null
type Profile = 'strategique' | 'lancement' | 'fin_de_vie' | 'standard' | 'sans_activite'
type View = 'stock' | 'flux' | 'pilotage'
type Sort = 'article' | 'valeur' | 'couverture' | 'besoin' | 'consommation'

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
const EMPTY_ROWS: LogisticsRow[] = []
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const numberOrDash = (value: number | null, format = fmtQty) =>
  value === null ? '—' : format.format(value)

const ALL_COLUMNS: Array<[string, (row: LogisticsRow) => string | number | null]> = [
  ['Article', (row) => row.article],
  ['Désignation', (row) => row.designation],
  ['Catégorie', (row) => row.categorie],
  ['Famille', (row) => row.famille],
  ['Code fournisseur', (row) => row.fournisseurCode],
  ['Fournisseur', (row) => row.fournisseurNom],
  ['Délai réappro (j)', (row) => row.delaiReapproJours],
  ['Lot technique', (row) => row.lotTechnique],
  ['Lot économique', (row) => row.lotEconomique],
  ['Stock A', (row) => row.stockA],
  ['Stock Q', (row) => row.stockQ],
  ['Stock A + Q', (row) => row.stockActuel],
  ['Stock alloué', (row) => row.stockAlloue],
  ['Stock disponible A', (row) => row.stockDisponible],
  ['Stock sécurité', (row) => row.stockSecurite],
  ['Besoins ouverts 12m', (row) => row.besoin12m],
  ['Dont en retard', (row) => row.besoinEnRetard],
  ['Besoin moyen / mois', (row) => row.besoinMoyenMensuel],
  ['Stock moyen estimé', (row) => row.stockMoyen],
  ['Consommation 12m', (row) => row.consommation12m],
  ['Jours de mouvement', (row) => row.joursMouvement],
  ['Opérations nettes', (row) => row.operations],
  ['CMJ calendaire', (row) => row.cmjCalendaire],
  ['Moyenne / opération', (row) => row.moyenneParOperation],
  ['PMP', (row) => row.pmp],
  ['Valeur stock', (row) => row.valorisationStock],
  ['Valeur consommation', (row) => row.valorisationConsommation],
  ['Rotation', (row) => row.rotation],
  ['Couverture historique (j)', (row) => row.couvertureJours],
  ['ABC consommation valeur', (row) => row.abcHistoriqueValeur],
  ['ABC fréquence', (row) => row.abcHistoriqueFrequence],
  ['ABC besoin valeur', (row) => row.abcPrevisionValeur],
  ['Profil', (row) => profileLabels[row.profil]],
]

function downloadCsv(rows: LogisticsRow[]) {
  const escape = (value: string | number | null) => {
    const raw = value === null ? '' : String(value)
    const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
    return `"${text.replace(/"/g, '""')}"`
  }
  const content = [
    ALL_COLUMNS.map(([label]) => escape(label)).join(';'),
    ...rows.map((row) => ALL_COLUMNS.map(([, value]) => escape(value(row))).join(';')),
  ].join('\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'analyse-logistique.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function AbcBadge({ value }: { value: Abc }) {
  if (!value) return <span className="text-muted-foreground">—</span>
  const color =
    value === 'A'
      ? 'bg-emerald-50 text-emerald-700'
      : value === 'B'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-slate-100 text-slate-600'
  return <span className={`rounded px-2 py-0.5 text-xs font-bold ${color}`}>{value}</span>
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

const cell = 'whitespace-nowrap border-b border-border/70 px-3 py-2 text-right tabular-nums'
const head =
  'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted/80 px-3 py-2 text-right text-xs font-semibold'

export default function AnalyseLogistique({ rowsHref }: { rowsHref: string }) {
  const [refresh, setRefresh] = useState(0)
  const [query, setQuery] = useState('')
  const [categorie, setCategorie] = useState('')
  const [famille, setFamille] = useState('')
  const [fournisseur, setFournisseur] = useState('')
  const [profil, setProfil] = useState('')
  const [view, setView] = useState<View>('stock')
  const [sort, setSort] = useState<Sort>('valeur')
  const [ascending, setAscending] = useState(false)
  const [page, setPage] = useState(0)
  const [article, setArticle] = useState<string | null>(null)
  const url = refresh ? `${rowsHref}?refresh=${refresh}` : rowsHref
  const { data, loading, error, elapsed } = useTimedFetch<Response>(url)
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
    const matches = rows.filter(
      (row) =>
        (!needle ||
          fold(`${row.article} ${row.designation} ${row.fournisseurNom ?? ''}`).includes(needle)) &&
        (!categorie || row.categorie === categorie) &&
        (!famille || row.famille === famille) &&
        (!fournisseur || row.fournisseurNom === fournisseur) &&
        (!profil || row.profil === profil)
    )
    const values: Record<Sort, (row: LogisticsRow) => string | number> = {
      article: (row) => row.article,
      valeur: (row) => row.valorisationStock,
      couverture: (row) => row.couvertureJours ?? -1,
      besoin: (row) => row.besoin12m,
      consommation: (row) => row.consommation12m,
    }
    return matches.sort((a, b) => {
      const left = values[sort](a)
      const right = values[sort](b)
      const order =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'fr')
      return (ascending ? order : -order) || a.article.localeCompare(b.article)
    })
  }, [rows, query, categorie, famille, fournisseur, profil, sort, ascending])

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
  const pageSize = 75
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  const visibleRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize)
  const changeFilter = (update: () => void) => {
    update()
    setPage(0)
  }

  const toolbar = (
    <div className="flex w-full flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <input
          aria-label="Rechercher un article"
          placeholder="Article, désignation, fournisseur…"
          value={query}
          onChange={(event) => changeFilter(() => setQuery(event.target.value))}
          className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm"
        />
      </div>
      <select
        aria-label="Catégorie"
        value={categorie}
        onChange={(event) => changeFilter(() => setCategorie(event.target.value))}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="">Toutes catégories</option>
        {options.categories.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select
        aria-label="Famille"
        value={famille}
        onChange={(event) => changeFilter(() => setFamille(event.target.value))}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="">Toutes familles</option>
        {options.familles.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select
        aria-label="Fournisseur"
        value={fournisseur}
        onChange={(event) => changeFilter(() => setFournisseur(event.target.value))}
        className="h-9 max-w-52 rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="">Tous fournisseurs</option>
        {options.fournisseurs.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select
        aria-label="Profil"
        value={profil}
        onChange={(event) => changeFilter(() => setProfil(event.target.value))}
        className="h-9 rounded-md border border-border bg-background px-2 text-sm"
      >
        <option value="">Tous profils</option>
        {Object.entries(profileLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setRefresh(Date.now())}
        className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm"
        title="Recalculer les données"
      >
        <RefreshCw size={15} /> Actualiser
      </button>
    </div>
  )

  return (
    <AppLayout
      active="logistics_analysis"
      subtitle="Analyse logistique"
      title="Analyse logistique"
      toolbar={toolbar}
      maxWidth="full"
    >
      <div className="space-y-4 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Analyse logistique</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Site {data?.site ?? 'AE1'} · {data?.from || '…'} au {data?.to || '…'} · 12 mois
              calendaires, mois en cours inclus.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Trier par"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="valeur">Valeur du stock</option>
              <option value="article">Article</option>
              <option value="couverture">Couverture</option>
              <option value="besoin">Besoins</option>
              <option value="consommation">Consommation</option>
            </select>
            <button
              type="button"
              onClick={() => setAscending((value) => !value)}
              aria-label={ascending ? 'Tri croissant' : 'Tri décroissant'}
              className="flex size-9 items-center justify-center rounded-md border border-border"
            >
              {ascending ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
            </button>
            <button
              type="button"
              onClick={() => downloadCsv(filtered)}
              disabled={!filtered.length}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm disabled:opacity-50"
            >
              <Download size={15} /> CSV
            </button>
          </div>
        </div>

        {loading && !data && (
          <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Chargement des données X3… {Math.round(elapsed / 1000)} s
          </p>
        )}
        {(error || data?.x3Error) && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {data?.x3Error ?? error?.message}
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Articles" value={fmtQty.format(filtered.length)} hint="Après filtres" />
          <Metric label="Valeur du stock A + Q" value={fmtMoney.format(totals.stock)} />
          <Metric
            label="Valeur consommation"
            value={fmtMoney.format(totals.consommation)}
            hint="Sorties nettes sur la période"
          />
          <Metric
            label="Sous stock de sécurité"
            value={fmtQty.format(totals.sousSecurite)}
            hint="Stock A non alloué"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Rubrique"
            className="inline-flex rounded-lg border border-border bg-muted/50 p-1"
          >
            {(
              [
                ['stock', 'Stock'],
                ['flux', 'Flux'],
                ['pilotage', 'Pilotage'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={view === value}
                onClick={() => setView(value)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium ${view === value ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Besoins ouverts : {fmtMoney.format(totals.besoin)} · CMJ par jour calendaire ·
            couverture sur stock A non alloué
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr>
                <th className={head + ' left-0 text-left'}>Article</th>
                <th className={head + ' text-left'}>Désignation</th>
                {view === 'stock' && (
                  <>
                    <th className={head + ' text-left'}>Catégorie</th>
                    <th className={head + ' text-left'}>Famille</th>
                    <th className={head + ' text-left'}>Fournisseur</th>
                    <th className={head}>Stock A</th>
                    <th className={head}>Stock Q</th>
                    <th className={head}>Disponible A</th>
                    <th className={head}>Sécurité</th>
                    <th className={head}>Délai</th>
                    <th className={head}>Lot tech.</th>
                    <th className={head}>Lot éco.</th>
                    <th className={head}>PMP</th>
                    <th className={head}>Valeur</th>
                  </>
                )}
                {view === 'flux' && (
                  <>
                    <th className={head}>Conso 12m</th>
                    <th className={head}>Jours mvt</th>
                    <th className={head}>Opérations</th>
                    <th className={head}>Moy. / opération</th>
                    <th className={head}>CMJ calendaire</th>
                    <th className={head}>Stock moyen</th>
                    <th className={head}>Rotation</th>
                    <th className={head}>Couverture</th>
                    <th className={head}>Besoins 12m</th>
                    <th className={head}>Dont retard</th>
                    <th className={head}>Moy. / mois</th>
                  </>
                )}
                {view === 'pilotage' && (
                  <>
                    <th className={head + ' text-left'}>Catégorie</th>
                    <th className={head + ' text-left'}>Fournisseur</th>
                    <th className={head}>ABC conso €</th>
                    <th className={head}>ABC fréquence</th>
                    <th className={head}>ABC besoin €</th>
                    <th className={head + ' text-left'}>Profil</th>
                    <th className={head}>Valeur conso</th>
                    <th className={head}>Valeur besoins</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.article} className="hover:bg-muted/40">
                  <td className={cell + ' sticky left-0 bg-card text-left font-medium'}>
                    <button
                      type="button"
                      onClick={() => setArticle(row.article)}
                      className="text-primary hover:underline"
                    >
                      {row.article}
                    </button>
                  </td>
                  <td className={cell + ' max-w-64 truncate text-left'} title={row.designation}>
                    {row.designation}
                  </td>
                  {view === 'stock' && (
                    <>
                      <td className={cell + ' text-left'}>{row.categorie}</td>
                      <td className={cell + ' text-left'}>{row.famille ?? '—'}</td>
                      <td className={cell + ' text-left'}>{row.fournisseurNom ?? '—'}</td>
                      <td className={cell}>{fmtQty.format(row.stockA)}</td>
                      <td className={cell}>{fmtQty.format(row.stockQ)}</td>
                      <td className={cell}>{fmtQty.format(row.stockDisponible)}</td>
                      <td className={cell}>{numberOrDash(row.stockSecurite)}</td>
                      <td className={cell}>{numberOrDash(row.delaiReapproJours)}</td>
                      <td className={cell}>{numberOrDash(row.lotTechnique)}</td>
                      <td className={cell}>{numberOrDash(row.lotEconomique)}</td>
                      <td className={cell}>{fmtPmp.format(row.pmp)}</td>
                      <td className={cell + ' font-semibold'}>
                        {fmtMoney.format(row.valorisationStock)}
                      </td>
                    </>
                  )}
                  {view === 'flux' && (
                    <>
                      <td className={cell}>{fmtQty.format(row.consommation12m)}</td>
                      <td className={cell}>{fmtQty.format(row.joursMouvement)}</td>
                      <td className={cell}>{fmtQty.format(row.operations)}</td>
                      <td className={cell}>{numberOrDash(row.moyenneParOperation)}</td>
                      <td className={cell}>{numberOrDash(row.cmjCalendaire, fmtDec)}</td>
                      <td className={cell}>{fmtQty.format(row.stockMoyen)}</td>
                      <td className={cell}>{numberOrDash(row.rotation, fmtDec)}</td>
                      <td className={cell}>
                        {row.couvertureJours === null
                          ? '—'
                          : `${fmtDec.format(row.couvertureJours)} j`}
                      </td>
                      <td className={cell}>{fmtQty.format(row.besoin12m)}</td>
                      <td className={cell}>{fmtQty.format(row.besoinEnRetard)}</td>
                      <td className={cell}>{fmtQty.format(row.besoinMoyenMensuel)}</td>
                    </>
                  )}
                  {view === 'pilotage' && (
                    <>
                      <td className={cell + ' text-left'}>{row.categorie}</td>
                      <td className={cell + ' text-left'}>{row.fournisseurNom ?? '—'}</td>
                      <td className={cell}>
                        <AbcBadge value={row.abcHistoriqueValeur} />
                      </td>
                      <td className={cell}>
                        <AbcBadge value={row.abcHistoriqueFrequence} />
                      </td>
                      <td className={cell}>
                        <AbcBadge value={row.abcPrevisionValeur} />
                      </td>
                      <td className={cell + ' text-left'}>{profileLabels[row.profil]}</td>
                      <td className={cell}>{fmtMoney.format(row.valorisationConsommation)}</td>
                      <td className={cell}>{fmtMoney.format(row.valorisationBesoin)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && !data?.x3Error && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Aucun article ne correspond aux filtres.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {fmtQty.format(filtered.length)} articles · page {currentPage + 1} / {pageCount}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Précédent
            </button>
            <button
              type="button"
              disabled={currentPage >= pageCount - 1}
              onClick={() => setPage(currentPage + 1)}
              className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
            >
              Suivant
            </button>
          </div>
        </div>
        <details className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Méthode de calcul</summary>
          <div className="mt-3 grid gap-2 text-muted-foreground md:grid-cols-2">
            <p>
              Stock disponible = stock A moins allocations, borné à zéro. Le stock Q reste visible à
              part et entre dans la valorisation A + Q.
            </p>
            <p>
              Consommation = sorties nettes par document (livraisons des produits concernés et
              sorties d’OF). La CMJ divise cette quantité par les jours calendaires de la fenêtre.
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
      </div>
      <StockArticleSheet
        article={article}
        open={article !== null}
        onOpenChange={(open) => !open && setArticle(null)}
      />
    </AppLayout>
  )
}
