/**
 * Page « Contrôle prod » — incohérences entre le pointage atelier et ce qu'ORDERS
 * annonce, en deux onglets symétriques :
 *  - « Écarts déclaration » (issue #95) : déclaré PF > pointé ;
 *  - « OF à solder » : gamme pointée à 100 %, rien de déclaré, reste annoncé non nul.
 *    Ces OF sont écartés de l'offre par le moteur, donc ils font basculer des commandes
 *    en « sans couverture » — la colonne « Commandes » porte cette conséquence.
 *
 * Coquille Inertia + fetch JSON différé, calque /ruptures. L'onglet « OF à solder »
 * n'est fetché qu'à son ouverture (il déclenche le pipeline ruptures).
 */
import { useCallback, useMemo, useState } from 'react'
import { Search, TriangleAlert, CircleX, RefreshCw } from 'lucide-react'
import { LoadingState } from '@r/components/ui/loading-state'

import AppLayout from '@r/layouts/app'
import { OfDetailSheet } from '@r/components/of/of-detail-sheet'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'
import {
  PILL,
  Segment,
  SegmentButton,
  ToolbarRow,
  ToolbarSpacer,
} from '@r/components/vision/toolbar'
import { route } from '@r/lib/routes'
import { router } from '@inertiajs/react'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'

type Source = 'live' | 'ouvert'

interface ControleProdRow {
  numOf: string
  article: string
  designation: string | null
  qtyDeclaree: number
  qtyPointee: number
  qtyLancee: number | null
  ecart: number
  qteRestante: number
  source: Source
  dateDebutIso: string | null
  dateFinIso: string | null
  datePremierSuiviIso: string | null
  dateDernierSuiviIso: string | null
  mfgSta: number | null
  mfgStaLabel: string | null
  planner: string | null
  site: string | null
  derniereOpPointee: number | null
  nbOperations: number
}

interface ControleProdResponse {
  rows: ControleProdRow[]
  stats: {
    nbEcarts: number
    totalEcart: number
    nbLive: number
    nbOuverts: number
  }
  x3Error: string | null
}

const EMPTY: ControleProdResponse = {
  rows: [],
  stats: { nbEcarts: 0, totalEcart: 0, nbLive: 0, nbOuverts: 0 },
  x3Error: null,
}

interface CommandeImpactee {
  numCommande: string
  ligne: string | null
  client: string
  qteRestante: number
  dateExpedition: string
}

interface OfASolderRow {
  numOf: string
  article: string
  designation: string | null
  qteRestante: number
  qtyRealisee: number
  qtyPrevueOp: number
  dernierPointageIso: string | null
  joursDepuisPointage: number | null
  poste: string | null
  dateDebutIso: string | null
  dateFinIso: string | null
  planner: string | null
  site: string | null
  commandes: CommandeImpactee[]
}

interface OfASolderResponse {
  rows: OfASolderRow[]
  stats: { nbOfs: number; totalQte: number; nbBloquants: number; nbSansCommande: number }
  x3Error: string | null
}

const EMPTY_SOLDER: OfASolderResponse = {
  rows: [],
  stats: { nbOfs: 0, totalQte: 0, nbBloquants: 0, nbSansCommande: 0 },
  x3Error: null,
}

type Tab = 'ecarts' | 'solder'

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

const fmt = (n: number) =>
  Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '—'

/** ISO YYYY-MM-DD → JJ/MM/AA. */
function fmtFr(iso: string | null): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`
}

/** Tri générique une colonne — repli sur l'ordre reçu du serveur si aucun tri actif. */
function sortByColumn<T>(rows: T[], sorting: SortingState[]): T[] {
  const s = sorting[0]
  if (!s) return rows
  const dir = s.desc ? -1 : 1
  return [...rows].sort((a, b) => {
    const av = a[s.id as keyof T]
    const bv = b[s.id as keyof T]
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av ?? '').localeCompare(String(bv ?? '')) * dir
  })
}

function createColumns(onSelectOf: (numOf: string) => void): ColumnDef<ControleProdRow>[] {
  return [
    {
      accessorKey: 'numOf',
      header: () => 'OF',
      cell: ({ row: { original: r } }) => (
        <>
          <button
            type="button"
            className="cursor-pointer font-mono text-[12px] font-bold tracking-tight text-brand hover:underline"
            onClick={(e) => {
              e.stopPropagation()
              onSelectOf(r.numOf)
            }}
          >
            {r.numOf}
          </button>
          <div className="mt-0.5 max-w-[14rem] truncate font-mono text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{r.article}</span>
            {r.designation && <span className="font-sans font-normal"> · {r.designation}</span>}
          </div>
          {(r.planner || r.site) && (
            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">
              {[r.site, r.planner].filter(Boolean).join(' · ')}
            </div>
          )}
        </>
      ),
      meta: { tdClass: 'align-top' },
    },
    {
      accessorKey: 'qtyLancee',
      header: () => 'Lancée',
      cell: ({ row: { original: r } }) => <Qty n={r.qtyLancee} muted />,
      meta: { thClass: 'text-right', tdClass: 'text-right align-top' },
    },
    {
      accessorKey: 'qtyDeclaree',
      header: () => 'Déclaré',
      cell: ({ row: { original: r } }) => <Qty n={r.qtyDeclaree} />,
      meta: { thClass: 'text-right', tdClass: 'text-right align-top' },
    },
    {
      accessorKey: 'qtyPointee',
      header: () => 'Pointé',
      cell: ({ row: { original: r } }) => <Qty n={r.qtyPointee} muted />,
      meta: { thClass: 'text-right', tdClass: 'text-right align-top' },
    },
    {
      accessorKey: 'ecart',
      header: () => 'Écart',
      cell: ({ row: { original: r } }) => (
        <span className="text-[14px] font-bold tabular-nums tracking-tight text-destructive">
          +{fmt(r.ecart)}
          <span className="ml-0.5 text-[9px] font-medium text-muted-foreground/70">u</span>
        </span>
      ),
      meta: { thClass: 'text-right', tdClass: 'text-right align-top' },
    },
    {
      accessorKey: 'qteRestante',
      header: () => 'Reste',
      cell: ({ row: { original: r } }) =>
        r.qteRestante > 0 ? <Qty n={r.qteRestante} muted /> : <Dash />,
      meta: { thClass: 'text-right', tdClass: 'text-right align-top' },
    },
    {
      accessorKey: 'derniereOpPointee',
      header: () => 'Op',
      cell: ({ row: { original: r } }) =>
        r.derniereOpPointee != null ? (
          <>
            <span className="font-semibold text-foreground">{r.derniereOpPointee}</span>
            <span className="text-muted-foreground/70">/{r.nbOperations}</span>
          </>
        ) : (
          '—'
        ),
      meta: { tdClass: 'align-top font-mono text-[11px] tabular-nums text-muted-foreground' },
    },
    {
      accessorKey: 'dateDebutIso',
      header: () => 'Début',
      cell: ({ row: { original: r } }) => fmtFr(r.dateDebutIso),
      meta: { tdClass: 'align-top font-mono text-[11px] tabular-nums text-muted-foreground' },
    },
    {
      accessorKey: 'dateFinIso',
      header: () => 'Fin',
      cell: ({ row: { original: r } }) => fmtFr(r.dateFinIso),
      meta: { tdClass: 'align-top font-mono text-[11px] tabular-nums text-muted-foreground' },
    },
    {
      accessorKey: 'datePremierSuiviIso',
      header: () => '1er suivi',
      cell: ({ row: { original: r } }) => fmtFr(r.datePremierSuiviIso),
      meta: { tdClass: 'align-top font-mono text-[11px] tabular-nums text-muted-foreground' },
    },
    {
      accessorKey: 'dateDernierSuiviIso',
      header: () => 'Dern. suivi',
      cell: ({ row: { original: r } }) => fmtFr(r.dateDernierSuiviIso),
      meta: {
        tdClass: 'align-top font-mono text-[11px] font-semibold tabular-nums text-foreground',
      },
    },
    {
      accessorKey: 'mfgStaLabel',
      header: () => 'Statut',
      cell: ({ row: { original: r } }) => (
        <div className="max-w-[7rem] truncate text-[11px] font-medium text-foreground">
          {r.mfgStaLabel ?? '—'}
        </div>
      ),
      meta: { tdClass: 'align-top' },
    },
    {
      accessorKey: 'source',
      header: () => 'Source',
      cell: ({ row: { original: r } }) => (
        <span
          className={cn(
            'inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold uppercase tracking-wide',
            r.source === 'live' ? 'bg-ferme/15 text-ferme' : 'bg-suggere/15 text-[#b54800]'
          )}
        >
          {r.source === 'live' ? 'Live' : 'Ouvert'}
        </span>
      ),
      meta: { tdClass: 'align-top' },
    },
  ]
}

/** Colonnes « OF à solder ». L'ordre suit la décision : quoi, combien, depuis quand, pour qui. */
function createSolderColumns(onSelectOf: (numOf: string) => void): ColumnDef<OfASolderRow>[] {
  return [
    {
      accessorKey: 'numOf',
      header: () => 'OF',
      cell: ({ row: { original: r } }) => (
        <>
          <button
            type="button"
            className="cursor-pointer font-mono text-[12px] font-bold tracking-tight text-brand hover:underline"
            onClick={(e) => {
              e.stopPropagation()
              onSelectOf(r.numOf)
            }}
          >
            {r.numOf}
          </button>
          <div className="mt-0.5 max-w-[14rem] truncate font-mono text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{r.article}</span>
            {r.designation && <span className="font-sans font-normal"> · {r.designation}</span>}
          </div>
          {(r.planner || r.site || r.poste) && (
            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/80">
              {[r.site, r.planner, r.poste].filter(Boolean).join(' · ')}
            </div>
          )}
        </>
      ),
      meta: { tdClass: 'align-top' },
    },
    {
      accessorKey: 'qteRestante',
      header: () => 'Reste annoncé',
      cell: ({ row: { original: r } }) => (
        <span className="text-[14px] font-bold tabular-nums tracking-tight text-destructive">
          {fmt(r.qteRestante)}
          <span className="ml-0.5 text-[9px] font-medium text-muted-foreground/70">u</span>
        </span>
      ),
      meta: { thClass: 'text-right', tdClass: 'text-right align-top' },
    },
    {
      accessorKey: 'qtyRealisee',
      header: () => 'Pointé',
      cell: ({ row: { original: r } }) => (
        <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">
          {fmt(r.qtyRealisee)}/{fmt(r.qtyPrevueOp)}
        </span>
      ),
      meta: { thClass: 'text-right', tdClass: 'text-right align-top' },
    },
    {
      accessorKey: 'joursDepuisPointage',
      header: () => 'Dernier pointage',
      cell: ({ row: { original: r } }) => {
        if (!r.dernierPointageIso) return <Dash />
        // Le délai depuis le pointage EST l'action : récent = déclaration en retard,
        // ancien = OF mort. Seuil à 30 j, franc pour rester lisible d'un coup d'œil.
        const vieux = (r.joursDepuisPointage ?? 0) > 30
        return (
          <>
            <div className="font-mono text-[11px] tabular-nums text-foreground">
              {fmtFr(r.dernierPointageIso)}
            </div>
            <div
              className={cn(
                'mt-0.5 text-[10px] font-semibold',
                vieux ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {r.joursDepuisPointage} j
            </div>
          </>
        )
      },
      meta: { thClass: 'text-right', tdClass: 'text-right align-top' },
    },
    {
      id: 'action',
      header: () => 'Action',
      cell: ({ row: { original: r } }) => {
        const vieux = (r.joursDepuisPointage ?? 0) > 30
        return (
          <span
            className={cn(
              'inline-flex h-5 items-center rounded-full px-2 text-[10px] font-bold uppercase tracking-wide',
              vieux ? 'bg-destructive/15 text-destructive' : 'bg-ferme/15 text-ferme'
            )}
          >
            {vieux ? 'Solder' : 'Déclarer'}
          </span>
        )
      },
      meta: { tdClass: 'align-top' },
    },
    {
      id: 'commandes',
      header: () => 'Commandes sans couverture',
      cell: ({ row: { original: r } }) =>
        r.commandes.length === 0 ? (
          <span className="text-[11px] italic text-muted-foreground">aucune</span>
        ) : (
          <div className="space-y-0.5">
            {r.commandes.slice(0, 3).map((c) => (
              <div key={`${c.numCommande}-${c.ligne ?? ''}`} className="text-[11px] leading-tight">
                <span className="font-mono font-semibold text-foreground">{c.numCommande}</span>
                <span className="text-muted-foreground">
                  {' · '}
                  {c.client}
                  {' · '}
                  {fmt(c.qteRestante)} u{' · '}
                  {fmtFr(c.dateExpedition)}
                </span>
              </div>
            ))}
            {r.commandes.length > 3 && (
              <div className="text-[10px] text-muted-foreground/80">
                +{r.commandes.length - 3} autre{r.commandes.length - 3 > 1 ? 's' : ''}
              </div>
            )}
          </div>
        ),
      meta: { tdClass: 'align-top' },
    },
    {
      accessorKey: 'dateDebutIso',
      header: () => 'Début',
      cell: ({ row: { original: r } }) => fmtFr(r.dateDebutIso),
      meta: { tdClass: 'align-top font-mono text-[11px] tabular-nums text-muted-foreground' },
    },
    {
      accessorKey: 'dateFinIso',
      header: () => 'Fin',
      cell: ({ row: { original: r } }) => fmtFr(r.dateFinIso),
      meta: { tdClass: 'align-top font-mono text-[11px] tabular-nums text-muted-foreground' },
    },
  ]
}

interface Props {
  rowsHref: string
  solderHref: string
}

export default function ControleProd(props: Props) {
  const [tab, setTab] = useState<Tab>('ecarts')
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<Source | 'all'>('all')
  const [selectedOf, setSelectedOf] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [sorting, setSorting] = useState<SortingState[]>([])

  const { data, loading, error } = useTimedFetch<ControleProdResponse>(props.rowsHref)
  const viewData = data ?? EMPTY

  // `null` tant que l'onglet n'est pas ouvert : ce payload déclenche le pipeline
  // ruptures, on ne le paie pas pour un utilisateur qui reste sur les écarts.
  const solder = useTimedFetch<OfASolderResponse>(tab === 'solder' ? props.solderHref : null)
  const solderData = solder.data ?? EMPTY_SOLDER

  const filtered = useMemo(() => {
    const q = fold(query)
    return viewData.rows.filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false
      if (!q) return true
      const hay = fold(
        `${r.numOf} ${r.article} ${r.designation ?? ''} ${r.planner ?? ''} ${r.site ?? ''} ${r.mfgStaLabel ?? ''}`
      )
      return hay.includes(q)
    })
  }, [viewData.rows, query, sourceFilter])

  const filteredSolder = useMemo(() => {
    const q = fold(query)
    if (!q) return solderData.rows
    return solderData.rows.filter((r) => {
      const cmds = r.commandes.map((c) => `${c.numCommande} ${c.client}`).join(' ')
      const hay = fold(
        `${r.numOf} ${r.article} ${r.designation ?? ''} ${r.planner ?? ''} ${r.site ?? ''} ${r.poste ?? ''} ${cmds}`
      )
      return hay.includes(q)
    })
  }, [solderData.rows, query])

  const sorted = useMemo(() => sortByColumn(filtered, sorting), [filtered, sorting])
  const sortedSolder = useMemo(
    () => sortByColumn(filteredSolder, sorting),
    [filteredSolder, sorting]
  )

  const sumVisible = useMemo(() => filtered.reduce((s, r) => s + r.ecart, 0), [filtered])

  const onSelectOf = useCallback((num: string) => {
    setSelectedOf(num)
    setDetailOpen(true)
  }, [])

  const columns = useMemo(() => createColumns(onSelectOf), [onSelectOf])
  const solderColumns = useMemo(() => createSolderColumns(onSelectOf), [onSelectOf])

  const refresh = () => {
    router.visit(route('controle_prod.index') + '?refresh=1', { preserveScroll: true })
  }

  return (
    <AppLayout
      title="Contrôle prod"
      active="controle-prod"
      subtitle={
        tab === 'ecarts'
          ? 'Déclaration PF vs pointage atelier'
          : 'Gamme pointée à 100 %, rien de déclaré'
      }
      theme="airbnb"
      dense
      scrollable={false}
      meta={
        <>
          <div className="font-fraunces text-[12px] font-bold capitalize not-italic text-brand">
            Contrôle prod
          </div>
          {tab === 'ecarts' ? (
            <div>
              <b className="font-bold text-foreground">{viewData.stats.nbEcarts}</b> écarts · Σ{' '}
              <b className="font-bold text-foreground">{fmt(viewData.stats.totalEcart)}</b> pcs
            </div>
          ) : (
            <div>
              <b className="font-bold text-foreground">{solderData.stats.nbOfs}</b> OF · dont{' '}
              <b className="font-bold text-destructive">{solderData.stats.nbBloquants}</b> avec
              commande sans couverture
            </div>
          )}
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <ToolbarRow>
          <Segment role="radiogroup" ariaLabel="Famille d'anomalie">
            <SegmentButton active={tab === 'ecarts'} onClick={() => setTab('ecarts')}>
              Écarts déclaration
              <span className="ml-1 opacity-60">{viewData.stats.nbEcarts}</span>
            </SegmentButton>
            <SegmentButton active={tab === 'solder'} onClick={() => setTab('solder')}>
              OF à solder
              {solder.data && <span className="ml-1 opacity-60">{solderData.stats.nbOfs}</span>}
            </SegmentButton>
          </Segment>

          {tab === 'ecarts' && (
            <Segment role="radiogroup" ariaLabel="Périmètre">
              <SegmentButton active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>
                Tous
                <span className="ml-1 opacity-60">{viewData.stats.nbEcarts}</span>
              </SegmentButton>
              <SegmentButton
                active={sourceFilter === 'live'}
                onClick={() => setSourceFilter(sourceFilter === 'live' ? 'all' : 'live')}
              >
                Live
                <span className="ml-1 opacity-60">{viewData.stats.nbLive}</span>
              </SegmentButton>
              <SegmentButton
                active={sourceFilter === 'ouvert'}
                onClick={() => setSourceFilter(sourceFilter === 'ouvert' ? 'all' : 'ouvert')}
              >
                Ouverts
                <span className="ml-1 opacity-60">{viewData.stats.nbOuverts}</span>
              </SegmentButton>
            </Segment>
          )}

          <ToolbarSpacer />

          <div className={PILL}>
            <Search size={17} strokeWidth={1.75} className="text-muted-foreground" />
            <input
              className="w-[220px] border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
              placeholder="OF, article, planner…"
              type="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
          </div>
          <button
            type="button"
            onClick={refresh}
            className={cn(
              PILL,
              'cursor-pointer px-2.5 text-muted-foreground hover:text-foreground'
            )}
            title="Rafraîchir"
            aria-label="Rafraîchir"
          >
            <RefreshCw size={16} strokeWidth={1.75} />
          </button>
        </ToolbarRow>

        {(tab === 'ecarts' ? viewData.x3Error : solderData.x3Error) && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-7 py-2 text-[12px] text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="text-destructive" />
            <span className="font-bold">Erreur chargement :</span>
            <span className="font-mono">
              {tab === 'ecarts' ? viewData.x3Error : solderData.x3Error}
            </span>
          </div>
        )}

        {tab === 'solder' ? (
          solder.loading && !solder.data ? (
            <LoadingState
              className="flex-1"
              variant="orb"
              orbState="searching"
              title="Recherche des OF non soldés…"
            />
          ) : solder.error ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
              <CircleX size={20} strokeWidth={1.75} className="text-destructive" />
              Échec du chargement.
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-7 pb-7">
              {filteredSolder.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
                  Aucun OF à solder sur ce filtre.
                </div>
              ) : (
                <>
                  <div className="flex-none pb-2 pt-2 text-[11px] text-muted-foreground">
                    {filteredSolder.length} OF · gamme pointée à 100 %, aucune déclaration en stock
                    — écartés de la couverture. Σ reste fictif{' '}
                    <span className="font-semibold text-destructive">
                      {fmt(solderData.stats.totalQte)}
                    </span>
                  </div>
                  <div className="min-h-0 flex-1">
                    <DataTable
                      columns={solderColumns}
                      rows={sortedSolder}
                      sorting={sorting}
                      onSortingChange={setSorting}
                      tableClass="w-full min-w-[1100px] border-collapse"
                      scrollContainerClass="h-full border border-rule rounded-lg shadow-float bg-card"
                      theadRowClass="sticky top-0 z-10 bg-secondary"
                      getRowClass={() =>
                        'cursor-pointer border-t border-rule-soft transition-colors even:bg-foreground/[0.015] hover:bg-foreground/[0.07]'
                      }
                      onRowClick={(r) => onSelectOf(r.numOf)}
                      getRowKey={(r) => r.numOf}
                    />
                  </div>
                </>
              )}
            </div>
          )
        ) : loading && !data ? (
          <LoadingState
            className="flex-1"
            variant="orb"
            orbState="searching"
            title="Scan des écarts…"
          />
        ) : error ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-destructive">
            <CircleX size={20} strokeWidth={1.75} className="text-destructive" />
            Échec du chargement.
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col px-7 pb-7">
            {filtered.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-10 text-center font-fraunces text-[14px] italic text-muted-foreground">
                Aucun écart sur ce filtre.
              </div>
            ) : (
              <>
                <div className="flex-none pb-2 pt-2 text-[11px] text-muted-foreground">
                  {filtered.length} ligne{filtered.length > 1 ? 's' : ''} · Σ écart visible{' '}
                  <span className="font-semibold text-destructive">+{fmt(sumVisible)}</span>
                </div>
                <div className="min-h-0 flex-1">
                  <DataTable
                    columns={columns}
                    rows={sorted}
                    sorting={sorting}
                    onSortingChange={setSorting}
                    tableClass="w-full min-w-[1100px] border-collapse"
                    scrollContainerClass="h-full border border-rule rounded-lg shadow-float bg-card"
                    theadRowClass="sticky top-0 z-10 bg-secondary"
                    getRowClass={() =>
                      'cursor-pointer border-t border-rule-soft transition-colors even:bg-foreground/[0.015] hover:bg-foreground/[0.07]'
                    }
                    onRowClick={(r) => onSelectOf(r.numOf)}
                    getRowKey={(r) => r.numOf}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <OfDetailSheet num={selectedOf} open={detailOpen} onOpenChange={setDetailOpen} />
    </AppLayout>
  )
}

function Qty({ n, muted }: { n: number | null; muted?: boolean }) {
  if (n == null || !Number.isFinite(n)) return <Dash />
  return (
    <span
      className={cn(
        'tabular-nums tracking-tight',
        muted
          ? 'text-[13px] font-semibold text-muted-foreground'
          : 'text-[14px] font-bold text-foreground'
      )}
    >
      {fmt(n)}
      <span className="ml-0.5 text-[9px] font-medium text-muted-foreground/70">u</span>
    </span>
  )
}

function Dash() {
  return <span className="text-[13px] text-muted-foreground">—</span>
}
