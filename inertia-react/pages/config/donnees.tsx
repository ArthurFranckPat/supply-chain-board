import { useCallback, useMemo, useState } from 'react'
import { router } from '@inertiajs/react'
import AppLayout from '@r/layouts/app'
import { Button } from '@r/components/ui/button'
import { Badge } from '@r/components/ui/badge'
import { Pill } from '@r/components/ui/pill'
import {
  ToolbarGroup,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'
import { CellDate, CellNumber, CellStack } from '@r/components/ui/table-row'
import { RefreshCw, Layers, FileText, TriangleAlert, Trash2, Settings2, X } from 'lucide-react'
import { route } from '@r/lib/routes'
import { toast } from 'sonner'
import { cn } from '@r/lib/utils'

export type DataModeSetting = 'replica' | 'direct' | 'env'

export interface ReplicaTableInfo {
  table: string
  label: string
  description: string
  source: 'replica' | 'direct'
  reason:
    'disabled' | 'never-ingested' | 'last-run-failed' | 'env-mismatch' | 'dirty' | 'stale' | null
  dirtySince: string | null
  lastFullRunAt: string | null
  lastFinishedAt: string | null
  lastDurationMs: number | null
  rowCount: number
  isDirty: boolean
  maxAgeMs: number
  status: 'ok' | 'stale' | 'dirty' | 'error' | 'disabled' | 'never-ingested' | 'env-mismatch'
}

export interface IngestionLogRow {
  id: number
  tableName: string
  status: 'ok' | 'failed'
  scope: 'full' | 'partial'
  startedAt: string
  finishedAt: string | null
  rows: number | null
  durationMs: number | null
  source: string
  error: string | null
  note: string | null
  x3Env: string
}

export interface DonneesPageProps {
  dataMode: {
    configuredMode: DataModeSetting
    effectiveMode: boolean
    envDefault: boolean
  }
  tables: ReplicaTableInfo[]
  logs: {
    rows: IngestionLogRow[]
    total: number
  }
  isSyncRunning: boolean
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** Date ISO → jj/mm/aaaa */
const fmtDay = (iso: string | null): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Date ISO → HH:mm:ss */
const fmtTime = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

/** Formate une durée en ms ou s */
const fmtDuration = (ms: number | null): string => {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

/** Libellé lisible de la raison de repli */
function reasonLabel(reason: ReplicaTableInfo['reason']): string {
  switch (reason) {
    case 'disabled':
      return 'désactivé'
    case 'never-ingested':
      return 'non ingéré'
    case 'last-run-failed':
      return 'échec run'
    case 'env-mismatch':
      return 'env différent'
    case 'dirty':
      return 'modifié (dirty)'
    case 'stale':
      return 'périmé (> seuil)'
    default:
      return 'opérationnel'
  }
}

const DATA_MODES: Array<{
  v: DataModeSetting
  label: string
  hint: string
  badge?: string
  badgeVariant?: 'success' | 'warning' | 'secondary'
}> = [
  {
    v: 'replica',
    label: 'Réplique SQLite locale',
    hint: 'Lectures indexées ultra-rapides (~4 ms). ReplicaGate replie automatiquement sur X3 direct si la donnée est sale ou périmée.',
    badge: 'haute performance',
    badgeVariant: 'success',
  },
  {
    v: 'direct',
    label: 'Sage X3 direct (SOAP)',
    hint: 'Toutes les requêtes interrogent directement le pool SOAP Syracuse ZSOAPSQL avec cache mémoire bentocache.',
    badge: 'direct erp',
    badgeVariant: 'warning',
  },
  {
    v: 'env',
    label: 'Hérité du serveur (.env)',
    hint: 'Suit la variable d’environnement REPLICA_READS définie sur l’hôte (défaut déploiement).',
  },
]

export default function ConfigDonnees(props: DonneesPageProps) {
  const [dataMode, setDataMode] = useState(props.dataMode)
  const [tables, setTables] = useState<ReplicaTableInfo[]>(props.tables)
  const [logs, setLogs] = useState(props.logs)
  const [isSyncing, setIsSyncing] = useState(props.isSyncRunning)
  const [syncingTable, setSyncingTable] = useState<string | null>(null)
  const [logFilter, setLogFilter] = useState<'all' | 'ok' | 'failed'>('all')
  const [selectedError, setSelectedError] = useState<string | null>(null)
  const [isUpdatingMode, setIsUpdatingMode] = useState(false)
  const [tableSorting, setTableSorting] = useState<SortingState[]>([])
  const [logSorting, setLogSorting] = useState<SortingState[]>([])

  const handleModeChange = useCallback(async (newMode: DataModeSetting) => {
    setIsUpdatingMode(true)
    try {
      const res = await fetch(route('data_config.update_mode'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      })
      const data = await res.json()
      if (data.ok) {
        setDataMode(data.dataMode)
        toast.success(
          `Mode de données mis à jour : ${
            newMode === 'replica'
              ? 'Réplique SQLite'
              : newMode === 'direct'
                ? 'Sage X3 Direct'
                : 'Hérité du .env'
          }`
        )
        const statusRes = await fetch(route('data_config.status'))
        const statusData = await statusRes.json()
        if (statusData.tables) {
          setTables(statusData.tables)
        }
      } else {
        toast.error(data.error || 'Erreur lors de la mise à jour du mode')
      }
    } catch (e) {
      toast.error(String(e))
    } finally {
      setIsUpdatingMode(false)
    }
  }, [])

  const handleSync = useCallback(
    async (tableName: string = 'all') => {
      setIsSyncing(true)
      setSyncingTable(tableName)
      const label = tableName === 'all' ? 'toutes les tables' : tableName
      toast.info(`Synchronisation de ${label} en cours...`)

      try {
        const res = await fetch(route('data_config.sync'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ table: tableName }),
        })
        const data = await res.json()
        if (data.ok) {
          toast.success(`Synchronisation terminée avec succès`)
          if (data.tables) setTables(data.tables)
          const logsRes = await fetch(`${route('data_config.logs')}?status=${logFilter}`)
          const logsData = await logsRes.json()
          if (logsData.rows) setLogs(logsData)
        } else {
          toast.error(data.error || 'Erreur lors de la synchronisation')
        }
      } catch (e) {
        toast.error(String(e))
      } finally {
        setIsSyncing(false)
        setSyncingTable(null)
      }
    },
    [logFilter]
  )

  const handleResetDirty = useCallback(async (tableName: string = 'all') => {
    try {
      const res = await fetch(route('data_config.reset_dirty'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: tableName }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(
          `Salissure réinitialisée pour ${tableName === 'all' ? 'toutes les tables' : tableName}`
        )
        if (data.tables) setTables(data.tables)
      }
    } catch (e) {
      toast.error(String(e))
    }
  }, [])

  const handleFilterLogs = useCallback(async (status: 'all' | 'ok' | 'failed') => {
    setLogFilter(status)
    try {
      const res = await fetch(`${route('data_config.logs')}?status=${status}`)
      const data = await res.json()
      if (data.rows) setLogs(data)
    } catch (e) {
      toast.error(String(e))
    }
  }, [])

  // Colonnes pour la table des répliques
  const tableColumns = useMemo<ColumnDef<ReplicaTableInfo>[]>(
    () => [
      {
        accessorKey: 'table',
        header: () => 'Table répliquée',
        cell: ({ row: { original: t } }) => (
          <CellStack code={t.table} label={t.label} labelTitle={t.description} />
        ),
      },
      {
        id: 'source',
        header: () => 'Source',
        cell: ({ row: { original: t } }) =>
          t.source === 'replica' ? (
            <Badge variant="success">réplique</Badge>
          ) : (
            <Badge variant="warning">direct X3</Badge>
          ),
      },
      {
        id: 'statut',
        header: () => 'Statut',
        cell: ({ row: { original: t } }) => {
          const label = reasonLabel(t.reason)
          if (t.status === 'ok') return <Badge variant="success">frais</Badge>
          if (t.status === 'dirty') return <Badge variant="warning">dirty</Badge>
          if (t.status === 'stale') return <Badge variant="warning">périmé</Badge>
          if (t.status === 'disabled') return <Badge variant="secondary">désactivé</Badge>
          return <Badge variant="destructive">{label}</Badge>
        },
      },
      {
        accessorKey: 'lastFinishedAt',
        header: () => 'Dernier run',
        cell: ({ row: { original: t } }) => {
          const timestamp = t.lastFinishedAt || t.lastFullRunAt
          return <CellDate date={fmtDay(timestamp)} relative={fmtTime(timestamp)} />
        },
      },
      {
        accessorKey: 'lastDurationMs',
        header: () => 'Durée',
        cell: ({ row: { original: t } }) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {fmtDuration(t.lastDurationMs)}
          </span>
        ),
      },
      {
        accessorKey: 'rowCount',
        header: () => 'Lignes',
        cell: ({ row: { original: t } }) => (
          <CellNumber value={t.rowCount.toLocaleString('fr-FR')} />
        ),
        meta: { tdClass: 'text-right', thClass: 'text-right' },
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => '',
        cell: ({ row: { original: t } }) => {
          const isCurrentSyncing = isSyncing && (syncingTable === 'all' || syncingTable === t.table)
          return (
            <div className="flex items-center justify-end gap-1.5">
              {t.isDirty && (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={isSyncing}
                  onClick={() => void handleResetDirty(t.table)}
                  title="Réinitialiser le drapeau dirty"
                  className="text-suggere hover:text-suggere"
                >
                  <Trash2 size={13} />
                </Button>
              )}
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={isSyncing}
                onClick={() => void handleSync(t.table)}
                title="Synchroniser cette table"
              >
                <RefreshCw size={12} className={cn(isCurrentSyncing && 'animate-spin')} />
                Synchro
              </Button>
            </div>
          )
        },
        meta: { tdClass: 'text-right' },
      },
    ],
    [isSyncing, syncingTable, handleResetDirty, handleSync]
  )

  // Colonnes pour le journal d'ingestion
  const logColumns = useMemo<ColumnDef<IngestionLogRow>[]>(
    () => [
      {
        accessorKey: 'startedAt',
        header: () => 'Quand',
        cell: ({ row: { original: l } }) => (
          <CellDate date={fmtDay(l.startedAt)} relative={fmtTime(l.startedAt)} />
        ),
      },
      {
        accessorKey: 'tableName',
        header: () => 'Table',
        cell: ({ row: { original: l } }) => <CellStack code={l.tableName} />,
      },
      {
        accessorKey: 'status',
        header: () => 'Statut',
        cell: ({ row: { original: l } }) =>
          l.status === 'ok' ? (
            <Badge variant="success">succès</Badge>
          ) : (
            <Badge variant="destructive">échec</Badge>
          ),
      },
      {
        accessorKey: 'scope',
        header: () => 'Portée',
        cell: ({ row: { original: l } }) => (
          <span className="font-mono text-xs text-muted-foreground">{l.scope}</span>
        ),
      },
      {
        accessorKey: 'durationMs',
        header: () => 'Durée',
        cell: ({ row: { original: l } }) => (
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {fmtDuration(l.durationMs)}
          </span>
        ),
      },
      {
        accessorKey: 'rows',
        header: () => 'Lignes',
        cell: ({ row: { original: l } }) => (
          <CellNumber value={l.rows != null ? l.rows.toLocaleString('fr-FR') : '—'} />
        ),
        meta: { tdClass: 'text-right', thClass: 'text-right' },
      },
      {
        accessorKey: 'source',
        header: () => 'Origine',
        cell: ({ row: { original: l } }) => (
          <span className="text-xs text-muted-foreground">
            {l.source} · <span className="uppercase">{l.x3Env}</span>
          </span>
        ),
      },
      {
        id: 'detail',
        enableSorting: false,
        header: () => 'Détail',
        cell: ({ row: { original: l } }) => {
          if (l.error) {
            return (
              <button
                type="button"
                onClick={() => setSelectedError(l.error)}
                className="max-w-[260px] truncate font-mono text-xs text-destructive hover:underline text-left"
                title="Cliquer pour voir l'erreur"
              >
                {l.error}
              </button>
            )
          }
          if (l.note) {
            return (
              <span className="max-w-[260px] truncate text-xs text-muted-foreground" title={l.note}>
                {l.note}
              </span>
            )
          }
          return <span className="text-xs text-muted-foreground">—</span>
        },
      },
    ],
    []
  )

  const dirtyCount = tables.filter((t) => t.isDirty).length
  const failedCount = tables.filter(
    (t) => t.status === 'error' || t.status === 'env-mismatch'
  ).length

  const toolbar = (
    <>
      <ToolbarGroup>
        <ToolbarSegmented semantics="tabs" aria-label="Configuration">
          <ToolbarSegment onClick={() => router.visit(route('calendar_config.index'))}>
            Calendrier
          </ToolbarSegment>
          <ToolbarSegment onClick={() => router.visit(route('print_config.index'))}>
            Impressions
          </ToolbarSegment>
          <ToolbarSegment active>Données</ToolbarSegment>
        </ToolbarSegmented>
      </ToolbarGroup>

      <ToolbarSpacer />

      <Pill
        variant="outline"
        onClick={() => {
          fetch(route('data_config.status'))
            .then((r) => r.json())
            .then((d) => {
              if (d.tables) setTables(d.tables)
              if (d.dataMode) setDataMode(d.dataMode)
              toast.success('Statut actualisé')
            })
        }}
      >
        <RefreshCw size={12} className={cn('mr-1.5', isSyncing && 'animate-spin')} />
        Actualiser
      </Pill>
    </>
  )

  return (
    <AppLayout
      title="Source de données"
      active="config"
      subtitle="Mode de données et répliques X3"
      theme="cursor"
      toolbar={toolbar}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          Pilotez l’architecture de lecture entre la réplique SQLite locale (~4 ms) et les requêtes
          directes SOAP Sage X3. Le portail{' '}
          <span className="font-mono font-medium text-foreground">ReplicaGate</span> arbitre chaque
          lecture pour garantir qu’aucune donnée corrompue ou périmée n’est servie.
        </p>

        {failedCount > 0 && (
          <div className="flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
            <span>
              <span className="font-medium tabular-nums">
                {failedCount} table{failedCount > 1 ? 's' : ''}
              </span>{' '}
              présente{failedCount > 1 ? 'nt' : ''} une anomalie d’ingestion ou de provenance. Les
              lectures associées sont basculées sur la voie directe Sage X3.
            </span>
          </div>
        )}

        {dirtyCount > 0 && (
          <div className="flex items-center gap-2 border border-suggere/30 bg-suggere/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-suggere" />
            <span>
              <span className="font-medium tabular-nums">
                {dirtyCount} table{dirtyCount > 1 ? 's' : ''}
              </span>{' '}
              marquée{dirtyCount > 1 ? 's' : ''} comme modifiée{dirtyCount > 1 ? 's' : ''} après
              écriture. La voie directe répond jusqu’au prochain run complet.
            </span>
          </div>
        )}

        {/* Section 1 : Architecture de lecture */}
        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Settings2 size={16} strokeWidth={1.75} className="text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Architecture de lecture</h2>
            <span className="text-xs text-muted-foreground">
              arbitre entre réplique SQLite (~4 ms) et Sage X3 SOAP
            </span>
            <span className="ml-auto flex items-center gap-2">
              {dataMode.effectiveMode ? (
                <Badge variant="success">réplique active</Badge>
              ) : (
                <Badge variant="warning">voie directe X3</Badge>
              )}
            </span>
          </header>

          <div className="flex flex-col gap-1 px-4 py-3">
            {DATA_MODES.map((m) => (
              <label
                key={m.v}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 transition-colors',
                  dataMode.configuredMode === m.v ? 'bg-muted' : 'hover:bg-muted/50'
                )}
              >
                <input
                  type="radio"
                  name="dataMode"
                  className="mt-0.5"
                  checked={dataMode.configuredMode === m.v}
                  disabled={isUpdatingMode}
                  onChange={() => void handleModeChange(m.v)}
                />
                <span className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {m.label}
                    {m.badge && <Badge variant={m.badgeVariant}>{m.badge}</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">{m.hint}</span>
                </span>
              </label>
            ))}

            <p className="mt-1 text-xs text-muted-foreground">
              En cas de dégradation (table sale, délai de fraîcheur dépassé ou run en échec),
              ReplicaGate bascule automatiquement sur Sage X3 direct quel que soit ce réglage.
            </p>
          </div>
        </section>

        {/* Section 2 : Tables répliquées */}
        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Layers size={16} strokeWidth={1.75} className="text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Tables répliquées</h2>
            <span className="text-xs text-muted-foreground">
              8 tables de réplique SQLite et fraîcheur observée
            </span>
            <div className="ml-auto flex items-center gap-2">
              {dirtyCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSyncing}
                  onClick={() => void handleResetDirty('all')}
                  className="h-7 text-xs"
                >
                  <Trash2 size={13} className="mr-1 text-suggere" />
                  Effacer dirty
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSyncing}
                onClick={() => void handleSync('all')}
                className="h-7 text-xs"
              >
                <RefreshCw
                  size={12}
                  className={cn('mr-1', isSyncing && syncingTable === 'all' && 'animate-spin')}
                />
                Synchroniser tout
              </Button>
            </div>
          </header>

          <DataTable
            columns={tableColumns}
            rows={tables}
            sorting={tableSorting}
            onSortingChange={setTableSorting}
            virtualize={false}
            tableClass="w-full"
            scrollContainerClass="rounded-none border-0 shadow-none"
            getRowKey={(t) => t.table}
          />
        </section>

        {/* Section 3 : Journal d'ingestion */}
        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <FileText size={16} strokeWidth={1.75} className="text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Journal d’ingestion</h2>
            <span className="text-xs text-muted-foreground">
              historique des synchronisations ({logs.total} entrées)
            </span>

            <div className="ml-auto">
              <ToolbarSegmented semantics="tabs" aria-label="Filtrer les logs">
                <ToolbarSegment
                  active={logFilter === 'all'}
                  onClick={() => handleFilterLogs('all')}
                >
                  Tous
                </ToolbarSegment>
                <ToolbarSegment active={logFilter === 'ok'} onClick={() => handleFilterLogs('ok')}>
                  Succès
                </ToolbarSegment>
                <ToolbarSegment
                  active={logFilter === 'failed'}
                  onClick={() => handleFilterLogs('failed')}
                >
                  Échecs
                </ToolbarSegment>
              </ToolbarSegmented>
            </div>
          </header>

          {logs.rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Aucun événement d’ingestion journalisé.
            </p>
          ) : (
            <DataTable
              columns={logColumns}
              rows={logs.rows}
              sorting={logSorting}
              onSortingChange={setLogSorting}
              virtualize={false}
              tableClass="w-full"
              scrollContainerClass="rounded-none border-0 shadow-none"
              getRowKey={(l) => String(l.id)}
            />
          )}
        </section>

        {/* Modal d'affichage de l'erreur */}
        {selectedError && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-xl rounded-lg border border-border bg-card p-4 shadow-lg">
              <div className="flex items-center justify-between border-b border-border pb-2.5">
                <h3 className="flex items-center gap-2 text-sm font-medium text-destructive">
                  <TriangleAlert size={16} />
                  Détail de l’erreur d’ingestion
                </h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => setSelectedError(null)}
                >
                  <X size={14} />
                </Button>
              </div>
              <div className="mt-3 max-h-[300px] overflow-y-auto rounded bg-muted p-3 font-mono text-xs text-foreground whitespace-pre-wrap">
                {selectedError}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
