import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Printer, RotateCcw } from 'lucide-react'
import { router } from '@inertiajs/react'

import AppLayout from '@r/layouts/app'
import { Button } from '@r/components/ui/button'
import { Badge } from '@r/components/ui/badge'
import { Pill } from '@r/components/ui/pill'
import { LoadingState } from '@r/components/ui/loading-state'
import { CellDate, CellStack, rowToneClass } from '@r/components/ui/table-row'
import {
  ToolbarFilterChip,
  ToolbarFilterMenu,
  ToolbarFilterSection,
  ToolbarGroup,
  ToolbarRefresh,
  ToolbarSearch,
  ToolbarSegment,
  ToolbarSegmented,
  ToolbarSpacer,
} from '@r/components/ui/toolbar'
import { cn } from '@r/lib/utils'
import { route } from '@r/lib/routes'
import DataTable, { type ColumnDef, type SortingState } from '@r/components/ui/data-table'

/**
 * Impressions du jour (issue #85, lot 4).
 *
 * Le journal existe depuis le lot 2, mais logé en bas de l'écran de
 * configuration, sans filtre. La question du matin — « qu'est-ce qui a raté
 * cette nuit ? » — méritait sa page.
 *
 * Deux verdicts restent séparés partout : ce que X3 a accepté, et ce que le
 * serveur d'édition en a fait. Les confondre masquerait l'état dangereux de
 * l'issue : un OF lancé dont l'atelier n'a pas le papier.
 *
 * Écran en lecture, deux actions explicites : relancer un tirage échoué,
 * réconcilier les verdicts en attente.
 *
 * Migrée sur le design system cursor (vitrine `/design-system`) :
 * • `theme="cursor"` ; la barre passe par la prop `toolbar` d'AppLayout ;
 * • sous-nav Calendrier / Impressions en `ToolbarSegmented` (zone 01),
 *   période + filtres + recherche, journal en Pill zone 04 ;
 * • table `DataTable` + `CellStack` / `CellDate` / `Badge` ;
 * • plus de `font-fraunces` ni de filet Airbnb (`border-rule`, `px-7`).
 */

interface Job {
  id: number
  ofNum: string
  docType: string
  docLabel: string
  attempt: number
  stoloc: string
  atelierLabel: string
  destCode: string
  sandbox: boolean
  status: string
  serverVerdict: string
  jobRank: number
  jobPhase: string
  jobDetail: string
  verdictInferred: boolean
  message: string
  error: string
  /** Trace X3 du tirage, vide hors échec. */
  x3Trace: string
  origin: string
  requestedBy: string
  createdAt: number
}

interface PageProps {
  jobs: Job[]
  ateliers: { code: string; label: string }[]
  autoPrintMode: string
  since: number
}

const DAY = 86_400
const PERIODS = [
  { v: DAY, label: 'Aujourd’hui' },
  { v: 7 * DAY, label: '7 jours' },
  { v: 0, label: 'Tout' },
]

const ORIGINS: Record<string, string> = {
  firm: 'affermissement',
  manual: 'manuel',
  test: 'test',
}

/** Un tirage a échoué si X3 l'a refusé OU si le serveur d'édition l'a mis en erreur. */
const failed = (j: Job) => j.status === 'failed' || j.serverVerdict === 'error'
/**
 * Verdict encore inconnu : soumis mais issue non lue, ou tirage réservé dont
 * l'appel X3 n'a jamais rendu la main.
 */
const pending = (j: Job) =>
  j.status === 'pending' ||
  (j.status === 'submitted' && (j.serverVerdict === 'pending' || j.serverVerdict === 'unknown'))

const pad2 = (n: number) => String(n).padStart(2, '0')

const fmtDay = (s: number): string => {
  if (!s) return '—'
  const d = new Date(s * 1000)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`
}

const fmtTime = (s: number): string => {
  if (!s) return ''
  const d = new Date(s * 1000)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** Verdict du serveur d'édition, rendu sans arrondi. */
function Verdict({ j }: { j: Job }) {
  if (j.status === 'pending') {
    return (
      <Badge
        variant="warning"
        title="Tirage réservé au journal, issue de l’appel X3 inconnue. Réimprimer reste possible, explicitement."
      >
        tirage en cours
      </Badge>
    )
  }
  if (j.status === 'failed') {
    return (
      <Badge variant="destructive" title={j.error}>
        refusé par X3
      </Badge>
    )
  }
  if (j.serverVerdict === 'error') {
    return (
      <Badge variant="destructive" title={j.jobDetail || j.error}>
        rien n’est sorti
      </Badge>
    )
  }
  if (j.serverVerdict === 'ok') {
    return (
      <Badge
        variant="success"
        title={
          j.verdictInferred
            ? 'Succès déduit de la disparition de la tâche, pas lu sur un statut terminal.'
            : undefined
        }
      >
        remis à la file{j.verdictInferred ? ' *' : ''}
      </Badge>
    )
  }
  if (!j.jobRank) {
    return (
      <Badge
        variant="warning"
        title="Aucun n° de tâche renvoyé par X3 : ce tirage ne pourra jamais être tranché. Vérifier que ZSOAPPRINT est publié avec son 7ᵉ paramètre (WJOBNUM)."
      >
        non réconciliable
      </Badge>
    )
  }
  return (
    <Badge variant="warning" title={j.jobDetail}>
      sans verdict
    </Badge>
  )
}

/**
 * Détail d'un tirage : ce que X3 a répondu, puis la trace.
 *
 * La trace n'existe que sur les échecs, et elle peut manquer même là (trace non
 * activée côté serveur, refus avant l'entrée dans le sous-programme). Son
 * absence est dite, pas masquée : « pas de trace » et « trace vide » ne se
 * diagnostiquent pas pareil.
 */
function JobDetail({ j }: { j: Job }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 px-3 py-2.5 text-xs">
      {j.error && (
        <p>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Refus X3
          </span>
          <br />
          <span className="text-destructive">{j.error}</span>
        </p>
      )}
      {j.jobDetail && (
        <p>
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Serveur d’édition
          </span>
          <br />
          {j.jobDetail}
          {j.jobPhase ? ` · étape « ${j.jobPhase} »` : ''}
        </p>
      )}
      {j.message && !j.error && <p className="text-muted-foreground">{j.message}</p>}

      <div>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Trace X3
        </span>
        {j.x3Trace ? (
          <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-border bg-card p-2 font-mono text-xs leading-relaxed">
            {j.x3Trace}
          </pre>
        ) : (
          <p className="mt-1 text-muted-foreground">
            Aucune trace enregistrée pour ce tirage. Les tirages antérieurs à la mise en place de la
            trace n’en ont pas : relancer le tirage en produit une.
          </p>
        )}
      </div>
    </div>
  )
}

function createJobColumns(deps: {
  opened: Set<number>
  toggle: (id: number) => void
  relaunch: (j: Job) => void
  relaunching: number | null
}): ColumnDef<Job>[] {
  const { opened, toggle, relaunch, relaunching } = deps
  return [
    {
      accessorKey: 'createdAt',
      header: () => 'Quand',
      cell: ({ row: { original: j } }) => (
        <CellDate date={fmtDay(j.createdAt)} relative={fmtTime(j.createdAt)} />
      ),
    },
    {
      accessorKey: 'ofNum',
      header: () => 'OF',
      cell: ({ row: { original: j } }) => <CellStack code={j.ofNum} />,
    },
    {
      accessorKey: 'docLabel',
      header: () => 'Document',
      cell: ({ row: { original: j } }) => (
        <CellStack
          code={j.docType}
          label={j.docLabel}
          action={
            j.attempt > 1 ? <Badge variant="warning">réimpression #{j.attempt}</Badge> : undefined
          }
        />
      ),
    },
    {
      accessorKey: 'atelierLabel',
      header: () => 'Atelier',
      cell: ({ row: { original: j } }) => (
        <CellStack code={j.stoloc || '—'} label={j.atelierLabel || '—'} />
      ),
    },
    {
      accessorKey: 'destCode',
      header: () => 'Destination',
      cell: ({ row: { original: j } }) => (
        <CellStack code={j.destCode || '—'} label={j.sandbox ? 'sans papier' : undefined} />
      ),
    },
    {
      id: 'verdict',
      enableSorting: false,
      header: () => 'Serveur d’édition',
      cell: ({ row: { original: j } }) => (
        <span className="inline-flex items-center gap-1.5">
          <Verdict j={j} />
          {j.jobRank > 0 && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              #{j.jobRank}
            </span>
          )}
        </span>
      ),
    },
    {
      accessorKey: 'origin',
      header: () => 'Origine',
      cell: ({ row: { original: j } }) => (
        <span className="text-xs text-muted-foreground">
          {ORIGINS[j.origin] ?? j.origin}
          {j.requestedBy ? ` · ${j.requestedBy}` : ''}
        </span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      header: () => '',
      cell: ({ row: { original: j } }) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          {(j.error || j.x3Trace || j.jobDetail) && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => toggle(j.id)}
              title="Cause et trace X3"
            >
              {opened.has(j.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              Détail
            </Button>
          )}
          {failed(j) && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => void relaunch(j)}
              disabled={relaunching === j.id}
              title="Relancer ce tirage"
            >
              <Printer size={13} />
              Relancer
            </Button>
          )}
        </span>
      ),
      meta: { tdClass: 'text-right' },
    },
  ]
}

export default function Impressions(props: PageProps) {
  const [jobs, setJobs] = useState<Job[]>(props.jobs)
  const [period, setPeriod] = useState<number>(DAY)
  const [failedOnly, setFailedOnly] = useState(false)
  const [stoloc, setStoloc] = useState('')
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [relaunching, setRelaunching] = useState<number | null>(null)
  /** Tirages dont le détail est déplié. Plusieurs à la fois : on compare. */
  const [opened, setOpened] = useState<Set<number>>(new Set())
  const [sorting, setSorting] = useState<SortingState[]>([{ id: 'createdAt', desc: true }])

  const toggle = (id: number) =>
    setOpened((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const p = new URLSearchParams()
      if (period > 0) p.set('since', String(Math.floor(Date.now() / 1000) - period))
      if (failedOnly) p.set('failed', '1')
      if (stoloc) p.set('stoloc', stoloc)
      if (search.trim()) p.set('of', search.trim())
      const r = await fetch(`${route('print_journal.rows')}?${p.toString()}`)
      const j = await r.json()
      setJobs(j.jobs ?? [])
    } catch (e) {
      setNote(String(e))
    } finally {
      setBusy(false)
    }
  }, [period, failedOnly, stoloc, search])

  // Rechargement à chaque changement de filtre. Le filtrage vit côté serveur :
  // le journal dépasse vite ce qu'on veut transporter.
  // `load` dépend aussi de `search`, volontairement absent ici : la recherche
  // filtre côté client, la relister referait un aller-retour réseau à chaque
  // frappe. Omission assumée, pas un oubli.
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, failedOnly, stoloc])

  const counts = useMemo(() => {
    const ko = jobs.filter(failed).length
    const wait = jobs.filter(pending).length
    return { total: jobs.length, ko, wait }
  }, [jobs])

  /** Relance d'un tirage échoué — toujours explicite, toujours tracée. */
  const relaunch = async (j: Job) => {
    setRelaunching(j.id)
    setNote('')
    try {
      const r = await fetch(route('print.print', { orderNum: j.ofNum }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, docTypes: [j.docType] }),
      })
      const data = await r.json()
      const d = data.documents?.[0]
      setNote(
        d
          ? `${j.ofNum} · ${d.label} → ${d.destCode || '—'} : ${d.serverVerdict === 'ok' ? 'remis à la file' : d.error || d.serverVerdict}`
          : (data.error ?? 'Relance sans verdict.')
      )
      await load()
    } catch (e) {
      setNote(String(e))
    } finally {
      setRelaunching(null)
    }
  }

  const columns = useMemo(
    () => createJobColumns({ opened, toggle, relaunch, relaunching }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opened, relaunching]
  )

  const reconcile = async () => {
    setBusy(true)
    setNote('')
    try {
      const r = await fetch(route('print_config.reconcile'), { method: 'POST' })
      const j = await r.json()
      setNote(j.note ?? j.error ?? 'Réconciliation terminée.')
      await load()
    } catch (e) {
      setNote(String(e))
    } finally {
      setBusy(false)
    }
  }

  const filterCount = (failedOnly ? 1 : 0) + (stoloc ? 1 : 0)

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
        </ToolbarSegmented>

        <ToolbarSegmented semantics="tabs" aria-label="Période">
          {PERIODS.map((p) => (
            <ToolbarSegment key={p.label} active={period === p.v} onClick={() => setPeriod(p.v)}>
              {p.label}
            </ToolbarSegment>
          ))}
        </ToolbarSegmented>

        <ToolbarFilterMenu activeCount={filterCount} width={300}>
          <ToolbarFilterSection>Statut</ToolbarFilterSection>
          <ToolbarSegmented semantics="toggles" flat className="w-full flex-wrap">
            <ToolbarFilterChip
              label="Échecs seulement"
              count={counts.ko}
              tone="critical"
              active={failedOnly}
              onClick={() => setFailedOnly((v) => !v)}
            />
          </ToolbarSegmented>
          {props.ateliers.length > 0 && (
            <>
              <ToolbarFilterSection>Atelier</ToolbarFilterSection>
              <ToolbarSegmented semantics="tabs" flat className="w-full flex-wrap">
                <ToolbarFilterChip
                  label="Tous"
                  tone="neutral"
                  active={stoloc === ''}
                  onClick={() => setStoloc('')}
                />
                {props.ateliers.map((a) => (
                  <ToolbarFilterChip
                    key={a.code}
                    label={a.label}
                    tone="neutral"
                    active={stoloc === a.code}
                    onClick={() => setStoloc(a.code)}
                  />
                ))}
              </ToolbarSegmented>
            </>
          )}
        </ToolbarFilterMenu>
      </ToolbarGroup>

      <ToolbarSpacer />

      <ToolbarSearch
        value={search}
        onChange={setSearch}
        placeholder="N° d’OF"
        onKeyDown={(e) => e.key === 'Enter' && void load()}
      />

      <Pill>Journal des tirages</Pill>

      {counts.wait > 0 && (
        <Pill
          variant="outline"
          className="gap-1.5"
          onClick={() => void reconcile()}
          disabled={busy}
        >
          <RotateCcw size={14} strokeWidth={1.75} />
          Réconcilier
        </Pill>
      )}
      <ToolbarRefresh loading={busy} onClick={() => void load()} />
    </>
  )

  return (
    <AppLayout
      title="Impressions"
      active="config"
      subtitle="Journal des tirages"
      theme="cursor"
      dense
      scrollable={false}
      toolbar={toolbar}
    >
      <div className="flex h-full min-h-0 flex-col">
        {props.autoPrintMode === 'off' && (
          <div className="flex flex-none items-center gap-2 border-b border-border px-5 py-2 text-xs text-muted-foreground">
            L’impression automatique à l’affermissement est{' '}
            <span className="font-medium text-foreground">désactivée</span> —{' '}
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => router.visit(route('print_config.index'))}
            >
              réglages
            </button>
            .
          </div>
        )}

        {note && (
          <div className="flex flex-none items-center gap-2 border-b border-border bg-muted/40 px-5 py-2 text-xs text-foreground">
            {note}
          </div>
        )}

        {busy && jobs.length === 0 ? (
          <LoadingState
            className="flex-1"
            variant="orb"
            orbState="searching"
            title="Lecture du journal…"
            description="Tirages X3 · verdicts du serveur d’édition"
          />
        ) : jobs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
            <p className="text-sm font-medium text-foreground">
              {failedOnly ? 'Aucun échec sur la période' : 'Aucun tirage sur la période'}
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              {failedOnly
                ? 'Aucun tirage en échec sur la fenêtre choisie — élargis la période ou retire le filtre.'
                : 'Aucun tirage journalisé sur cette fenêtre. Change la période ou actualise.'}
            </p>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-5">
            <div className="min-h-0 flex-1">
              <DataTable
                columns={columns}
                rows={jobs}
                sorting={sorting}
                onSortingChange={setSorting}
                virtualize={false}
                tableClass="w-full"
                scrollContainerClass="h-full rounded-lg border border-border bg-card"
                getRowClass={(j) => rowToneClass(failed(j) ? 'critical' : null)}
                getRowKey={(j) => String(j.id)}
                renderDetailRow={(j) =>
                  opened.has(j.id) ? (
                    <div className={cn('w-full px-4 pb-3 pt-0', failed(j) && 'bg-destructive/5')}>
                      <JobDetail j={j} />
                    </div>
                  ) : null
                }
              />
            </div>
            <p className="flex-none pt-2 text-xs text-muted-foreground">
              L’astérisque marque un succès déduit de la disparition de la tâche plutôt que lu sur
              un statut terminal. Activer la rétention côté console du serveur d’édition supprime
              cette ambiguïté et rend « Réconcilier » opérant.
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
