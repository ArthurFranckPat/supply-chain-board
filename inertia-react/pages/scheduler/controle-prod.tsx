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
 *
 * Migrée sur le design system cursor (vitrine `/design-system`) :
 * • `theme="cursor"` ; la barre passe par la prop `toolbar` d'AppLayout ;
 * • la barre suit le standard §17 : bascule de vue + menu Filtres unique
 *   (périmètre Live/Ouverts), recherche et actualiser — plus de `vision/toolbar` ;
 * • les deux tables sont rendues par `DataTable` avec les cellules canoniques
 *   `CellStack` / `CellNumber` / `Badge` ; plus de classes artisanales.
 */
import { useCallback, useMemo, useState } from 'react'
import { TriangleAlert, CircleX } from 'lucide-react'
import { LoadingState } from '@r/components/ui/loading-state'

import AppLayout from '@r/layouts/app'
import { OfDetailSheet } from '@r/components/of/of-detail-sheet'
import { useTimedFetch } from '@r/lib/suivi/use-timed-fetch'
import { cn } from '@r/lib/utils'
import {
  ToolbarFilterChip,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarRefresh,
  ToolbarSearch,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import { Badge } from '@r/components/ui/badge'
import { CellNumber, CellStack } from '@r/components/ui/table-row'
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

const STATUS_BADGE: Record<number, 'success' | 'outline' | 'warning' | 'destructive'> = {
  1: 'success',
  2: 'outline',
  3: 'warning',
  4: 'destructive',
}

function createColumns(onSelectOf: (numOf: string) => void): ColumnDef<ControleProdRow>[] {
  return [
    {
      accessorKey: 'numOf',
      header: () => 'OF',
      cell: ({ row: { original: r } }) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <CellStack
            code={
              <button
                type="button"
                className="cursor-pointer font-mono text-xs font-bold tracking-tight text-brand underline decoration-dotted decoration-brand/30 underline-offset-2 hover:text-brand/70"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectOf(r.numOf)
                }}
              >
                {r.numOf}
              </button>
            }
            label={
              <>
                <span className="font-semibold text-foreground">{r.article}</span>
                {r.designation ? <span> · {r.designation}</span> : null}
              </>
            }
            labelTitle={r.designation ? `${r.article} · ${r.designation}` : r.article}
          />
          {(r.planner || r.site) && (
            <span className="truncate font-mono text-3xs text-muted-foreground/70">
              {[r.site, r.planner].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      ),
      meta: {
        thClass: 'w-[220px] text-left',
        tdClass: 'w-[220px] align-top',
      },
    },
    {
      accessorKey: 'qtyLancee',
      header: () => 'Lancée',
      cell: ({ row: { original: r } }) =>
        r.qtyLancee != null && Number.isFinite(r.qtyLancee) ? (
          <CellNumber
            emphasis="plain"
            value={
              <>
                {fmt(r.qtyLancee)}
                <span className="ml-0.5 text-3xs font-medium text-muted-foreground/60">u</span>
              </>
            }
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      meta: { thClass: 'w-[80px] text-right!', tdClass: 'w-[80px] text-right align-top' },
    },
    {
      accessorKey: 'qtyDeclaree',
      header: () => 'Déclaré',
      cell: ({ row: { original: r } }) => (
        <CellNumber
          value={
            <>
              {fmt(r.qtyDeclaree)}
              <span className="ml-0.5 text-3xs font-medium text-muted-foreground/60">u</span>
            </>
          }
        />
      ),
      meta: { thClass: 'w-[84px] text-right!', tdClass: 'w-[84px] text-right align-top' },
    },
    {
      accessorKey: 'qtyPointee',
      header: () => 'Pointé',
      cell: ({ row: { original: r } }) => (
        <CellNumber
          emphasis="plain"
          value={
            <>
              {fmt(r.qtyPointee)}
              <span className="ml-0.5 text-3xs font-medium text-muted-foreground/60">u</span>
            </>
          }
        />
      ),
      meta: { thClass: 'w-[80px] text-right!', tdClass: 'w-[80px] text-right align-top' },
    },
    {
      accessorKey: 'ecart',
      header: () => 'Écart',
      cell: ({ row: { original: r } }) => (
        <CellNumber
          tone="critical"
          value={
            <>
              +{fmt(r.ecart)}
              <span className="ml-0.5 text-3xs font-medium text-muted-foreground/60">u</span>
            </>
          }
        />
      ),
      meta: { thClass: 'w-[84px] text-right!', tdClass: 'w-[84px] text-right align-top' },
    },
    {
      accessorKey: 'qteRestante',
      header: () => 'Reste',
      cell: ({ row: { original: r } }) =>
        r.qteRestante > 0 ? (
          <CellNumber
            emphasis="plain"
            value={
              <>
                {fmt(r.qteRestante)}
                <span className="ml-0.5 text-3xs font-medium text-muted-foreground/60">u</span>
              </>
            }
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      meta: { thClass: 'w-[72px] text-right!', tdClass: 'w-[72px] text-right align-top' },
    },
    {
      accessorKey: 'derniereOpPointee',
      header: () => 'Op',
      cell: ({ row: { original: r } }) =>
        r.derniereOpPointee != null ? (
          <span className="font-mono text-1.5xs tabular-nums text-muted-foreground">
            <span className="font-semibold text-foreground">{r.derniereOpPointee}</span>
            <span className="text-muted-foreground/60">/{r.nbOperations}</span>
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      meta: { thClass: 'w-[56px]', tdClass: 'w-[56px] align-top' },
    },
    {
      id: 'periode',
      header: () => 'Période',
      cell: ({ row: { original: r } }) => (
        <span className="flex flex-col gap-px font-mono text-1.5xs tabular-nums leading-tight">
          <span className="text-muted-foreground">
            {fmtFr(r.dateDebutIso)} → {fmtFr(r.dateFinIso)}
          </span>
          <span
            className="text-3xs text-muted-foreground/60"
            title={`1er suivi ${fmtFr(r.datePremierSuiviIso)} · Dern. ${fmtFr(r.dateDernierSuiviIso)}`}
          >
            suivi {fmtFr(r.datePremierSuiviIso)} ·{' '}
            <span className="font-semibold text-foreground">{fmtFr(r.dateDernierSuiviIso)}</span>
          </span>
        </span>
      ),
      meta: { thClass: 'w-[170px]', tdClass: 'w-[170px] align-top' },
    },
    {
      accessorKey: 'mfgStaLabel',
      header: () => 'Statut',
      cell: ({ row: { original: r } }) => {
        const sta = r.mfgSta ?? 0
        const variant = STATUS_BADGE[sta] ?? 'secondary'
        return r.mfgStaLabel ? (
          <Badge variant={variant} className="font-mono text-2xs">
            {r.mfgStaLabel}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )
      },
      meta: { thClass: 'w-[96px]', tdClass: 'w-[96px] align-top' },
    },
    {
      accessorKey: 'source',
      header: () => 'Source',
      cell: ({ row: { original: r } }) => (
        <Badge variant={r.source === 'live' ? 'success' : 'warning'}>
          {r.source === 'live' ? 'Live' : 'Ouvert'}
        </Badge>
      ),
      meta: { thClass: 'w-[88px]', tdClass: 'w-[88px] align-top' },
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
        <div className="flex min-w-0 flex-col gap-0.5">
          <CellStack
            code={
              <button
                type="button"
                className="cursor-pointer font-mono text-xs font-bold tracking-tight text-brand underline decoration-dotted decoration-brand/30 underline-offset-2 hover:text-brand/70"
                onClick={(e) => {
                  e.stopPropagation()
                  onSelectOf(r.numOf)
                }}
              >
                {r.numOf}
              </button>
            }
            label={
              <>
                <span className="font-semibold text-foreground">{r.article}</span>
                {r.designation ? <span> · {r.designation}</span> : null}
              </>
            }
            labelTitle={r.designation ? `${r.article} · ${r.designation}` : r.article}
          />
          {(r.planner || r.site || r.poste) && (
            <span className="truncate font-mono text-3xs text-muted-foreground/70">
              {[r.site, r.planner, r.poste].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      ),
      meta: { thClass: 'w-[220px] text-left', tdClass: 'w-[220px] align-top' },
    },
    {
      accessorKey: 'qteRestante',
      header: () => 'Reste annoncé',
      cell: ({ row: { original: r } }) => (
        <CellNumber
          tone="critical"
          value={
            <>
              {fmt(r.qteRestante)}
              <span className="ml-0.5 text-3xs font-medium text-muted-foreground/60">u</span>
            </>
          }
        />
      ),
      meta: { thClass: 'w-[96px] text-right!', tdClass: 'w-[96px] text-right align-top' },
    },
    {
      accessorKey: 'qtyRealisee',
      header: () => 'Pointé',
      cell: ({ row: { original: r } }) => (
        <span
          className={cn('font-mono text-1.5xs tabular-nums', 'font-semibold text-muted-foreground')}
        >
          {fmt(r.qtyRealisee)}/{fmt(r.qtyPrevueOp)}
        </span>
      ),
      meta: { thClass: 'w-[84px] text-right!', tdClass: 'w-[84px] text-right align-top' },
    },
    {
      accessorKey: 'joursDepuisPointage',
      header: () => 'Dernier pointage',
      cell: ({ row: { original: r } }) => {
        if (!r.dernierPointageIso) return <span className="text-xs text-muted-foreground">—</span>
        const vieux = (r.joursDepuisPointage ?? 0) > 30
        return (
          <div className="text-right leading-tight">
            <div className="font-mono text-1.5xs tabular-nums text-foreground">
              {fmtFr(r.dernierPointageIso)}
            </div>
            <div
              className={cn(
                'font-mono text-3xs font-semibold',
                vieux ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {r.joursDepuisPointage} j
            </div>
          </div>
        )
      },
      meta: { thClass: 'w-[110px] text-right!', tdClass: 'w-[110px] text-right align-top' },
    },
    {
      id: 'action',
      header: () => 'Action',
      cell: ({ row: { original: r } }) => {
        const vieux = (r.joursDepuisPointage ?? 0) > 30
        return (
          <Badge variant={vieux ? 'destructive' : 'success'}>{vieux ? 'Solder' : 'Déclarer'}</Badge>
        )
      },
      meta: { thClass: 'w-[92px]', tdClass: 'w-[92px] align-top' },
    },
    {
      id: 'commandes',
      header: () => 'Commandes sans couverture',
      cell: ({ row: { original: r } }) =>
        r.commandes.length === 0 ? (
          <span className="text-1.5xs italic text-muted-foreground">aucune</span>
        ) : (
          <div className="space-y-0.5">
            {r.commandes.slice(0, 3).map((c) => (
              <div key={`${c.numCommande}-${c.ligne ?? ''}`} className="text-1.5xs leading-tight">
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
              <div className="text-3xs text-muted-foreground/70">
                +{r.commandes.length - 3} autre{r.commandes.length - 3 > 1 ? 's' : ''}
              </div>
            )}
          </div>
        ),
      meta: { thClass: 'min-w-[260px]', tdClass: 'align-top' },
    },
    {
      id: 'periode',
      header: () => 'Période',
      enableSorting: false,
      cell: ({ row: { original: r } }) => (
        <span className="font-mono text-1.5xs tabular-nums text-muted-foreground">
          {fmtFr(r.dateDebutIso)} → {fmtFr(r.dateFinIso)}
        </span>
      ),
      meta: { thClass: 'w-[150px]', tdClass: 'w-[150px] align-top' },
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

  const sourceActiveCount = sourceFilter !== 'all' ? 1 : 0

  const toolbar = (
    <>
      <ToolbarSegmented semantics="tabs" aria-label="Famille d'anomalie">
        <ToolbarSegment active={tab === 'ecarts'} onClick={() => setTab('ecarts')}>
          Écarts déclaration
          <span className="ml-1 tabular-nums opacity-60">{viewData.stats.nbEcarts}</span>
        </ToolbarSegment>
        <ToolbarSegment active={tab === 'solder'} onClick={() => setTab('solder')}>
          OF à solder
          {solder.data && (
            <span className="ml-1 tabular-nums opacity-60">{solderData.stats.nbOfs}</span>
          )}
        </ToolbarSegment>
      </ToolbarSegmented>

      {tab === 'ecarts' && (
        <ToolbarFilterMenu activeCount={sourceActiveCount} width={280}>
          <ToolbarFilterSection>Périmètre</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
            <ToolbarFilterChip
              label="Tous"
              count={viewData.stats.nbEcarts}
              tone="neutral"
              active={sourceFilter === 'all'}
              onClick={() => setSourceFilter('all')}
            />
            <ToolbarFilterChip
              label="Live"
              count={viewData.stats.nbLive}
              tone="ok"
              active={sourceFilter === 'live'}
              onClick={() => setSourceFilter(sourceFilter === 'live' ? 'all' : 'live')}
            />
            <ToolbarFilterChip
              label="Ouverts"
              count={viewData.stats.nbOuverts}
              tone="warning"
              active={sourceFilter === 'ouvert'}
              onClick={() => setSourceFilter(sourceFilter === 'ouvert' ? 'all' : 'ouvert')}
            />
          </ToolbarSegmented>
        </ToolbarFilterMenu>
      )}

      <ToolbarSpacer />

      <ToolbarSearch value={query} onChange={setQuery} placeholder="OF, article, planner…" />
      <ToolbarRefresh onClick={refresh} />
    </>
  )

  return (
    <AppLayout
      title="Contrôle prod"
      active="controle-prod"
      subtitle={
        tab === 'ecarts'
          ? 'Déclaration PF vs pointage atelier'
          : 'Gamme pointée à 100 %, rien de déclaré'
      }
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
      meta={
        <>
          <div className="text-2xs font-semibold uppercase tracking-wide text-brand">
            Contrôle prod
          </div>
          {tab === 'ecarts' ? (
            <div className="font-mono text-xs tabular-nums text-muted-foreground">
              <b className="font-semibold text-foreground">{viewData.stats.nbEcarts}</b> écarts · Σ{' '}
              <b className="font-semibold text-foreground">{fmt(viewData.stats.totalEcart)}</b> pcs
            </div>
          ) : (
            <div className="font-mono text-xs tabular-nums text-muted-foreground">
              <b className="font-semibold text-foreground">{solderData.stats.nbOfs}</b> OF · dont{' '}
              <b className="font-semibold text-destructive">{solderData.stats.nbBloquants}</b> avec
              commande sans couverture
            </div>
          )}
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {(tab === 'ecarts' ? viewData.x3Error : solderData.x3Error) && (
          <div className="flex flex-none items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
            <span className="font-semibold">Erreur chargement :</span>
            <span className="truncate font-mono">
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
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-5">
              {filteredSolder.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-10 text-center text-sm italic text-muted-foreground">
                  Aucun OF à solder sur ce filtre.
                </div>
              ) : (
                <>
                  <div className="flex-none text-1.5xs text-muted-foreground">
                    {filteredSolder.length} OF · gamme pointée à 100 %, aucune déclaration en stock
                    — écartés de la couverture. Σ reste fictif{' '}
                    <span className="font-mono font-semibold tabular-nums text-destructive">
                      {fmt(solderData.stats.totalQte)}
                    </span>
                  </div>
                  <div className="min-h-0 flex-1">
                    <DataTable
                      columns={solderColumns}
                      rows={sortedSolder}
                      sorting={sorting}
                      onSortingChange={setSorting}
                      tableClass="min-w-[1100px] table-fixed"
                      scrollContainerClass="h-full border border-rule rounded-lg shadow-float bg-card"
                      theadRowClass="sticky top-0 z-10 bg-card"
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
          <div className="flex min-h-0 flex-1 flex-col gap-2 p-5">
            {filtered.length === 0 ? (
              <div className="flex flex-1 items-center justify-center p-10 text-center text-sm italic text-muted-foreground">
                Aucun écart sur ce filtre.
              </div>
            ) : (
              <>
                <div className="flex-none text-1.5xs text-muted-foreground">
                  {filtered.length} ligne{filtered.length > 1 ? 's' : ''} · Σ écart visible{' '}
                  <span className="font-mono font-semibold tabular-nums text-destructive">
                    +{fmt(sumVisible)}
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <DataTable
                    columns={columns}
                    rows={sorted}
                    sorting={sorting}
                    onSortingChange={setSorting}
                    tableClass="min-w-[1100px] table-fixed"
                    scrollContainerClass="h-full border border-rule rounded-lg shadow-float bg-card"
                    theadRowClass="sticky top-0 z-10 bg-card"
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
