import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  TriangleAlert,
} from 'lucide-react'

import AppLayout from '@r/layouts/app'
import { Button } from '@r/components/ui/button'
import { Input } from '@r/components/ui/input'
import { cn } from '@r/lib/utils'
import { route } from '@/lib/routes'

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

const fmtStamp = (s: number): string => {
  if (!s) return '—'
  const d = new Date(s * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Verdict du serveur d'édition, rendu sans arrondi. */
function Verdict({ j }: { j: Job }) {
  // Rang réservé, appel X3 sans retour. Ni succès ni échec : on ne sait pas si
  // du papier est sorti, et c'est ce qu'il faut afficher.
  if (j.status === 'pending') {
    return (
      <span
        className="font-semibold text-amber-700"
        title="Tirage réservé au journal, issue de l’appel X3 inconnue. Réimprimer reste possible, explicitement."
      >
        tirage en cours
      </span>
    )
  }
  if (j.status === 'failed') {
    return (
      <span className="font-semibold text-red-700" title={j.error}>
        refusé par X3
      </span>
    )
  }
  if (j.serverVerdict === 'error') {
    return (
      <span className="font-semibold text-red-700" title={j.jobDetail || j.error}>
        rien n’est sorti
      </span>
    )
  }
  if (j.serverVerdict === 'ok') {
    return (
      <span
        className="text-emerald-700"
        title={
          j.verdictInferred
            ? 'Succès déduit de la disparition de la tâche, pas lu sur un statut terminal.'
            : undefined
        }
      >
        remis à la file{j.verdictInferred ? ' *' : ''}
      </span>
    )
  }
  return (
    <span className="text-amber-700" title={j.jobDetail}>
      sans verdict
    </span>
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
    <div className="flex flex-col gap-2 rounded-md border border-rule bg-muted/40 px-3 py-2.5 text-[12.5px]">
      {j.error && (
        <p>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Refus X3
          </span>
          <br />
          <span className="text-red-800">{j.error}</span>
        </p>
      )}
      {j.jobDetail && (
        <p>
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Serveur d’édition
          </span>
          <br />
          {j.jobDetail}
          {j.jobPhase ? ` · étape « ${j.jobPhase} »` : ''}
        </p>
      )}
      {j.message && !j.error && <p className="text-muted-foreground">{j.message}</p>}

      <div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Trace X3
        </span>
        {j.x3Trace ? (
          <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded border border-rule bg-card p-2 font-mono text-[11px] leading-relaxed">
            {j.x3Trace}
          </pre>
        ) : (
          <p className="mt-1 italic text-muted-foreground">
            Aucune trace enregistrée pour ce tirage. Les tirages antérieurs à la mise en place de
            la trace n’en ont pas : relancer le tirage en produit une.
          </p>
        )}
      </div>
    </div>
  )
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
  useEffect(() => {
    void load()
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

  return (
    <AppLayout
      title="Impressions"
      active="config"
      subtitle="Impressions"
      theme="airbnb"
      meta={
        <>
          <div className="font-fraunces text-[12px] font-bold not-italic text-brand">
            {counts.total} tirage{counts.total > 1 ? 's' : ''}
          </div>
          <div>
            {counts.ko > 0 ? (
              <b className="font-bold text-red-700">{counts.ko} en échec</b>
            ) : (
              'aucun échec'
            )}
            {counts.wait > 0 ? ` · ${counts.wait} sans verdict` : ''}
          </div>
        </>
      }
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 py-6">
        <div>
          <h1 className="mb-1 font-fraunces text-[24px] font-extrabold tracking-tight">
            Impressions
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Ce qui est parti, où, et ce qu’il en est advenu. « Remis à la file » est la limite
            haute : un bac vide ou un bourrage ne remonte nulle part.
            {props.autoPrintMode === 'off' && (
              <>
                {' '}
                L’impression automatique à l’affermissement est{' '}
                <b className="text-foreground">désactivée</b> —{' '}
                <a href={route('print_config.index')} className="underline">
                  réglages
                </a>
                .
              </>
            )}
          </p>
        </div>

        {/* --- Filtres ------------------------------------------------------ */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-card px-3 py-2.5">
          <div className="inline-flex items-center gap-0.5 rounded-md border border-rule p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setPeriod(p.v)}
                className={cn(
                  'rounded-[5px] px-2.5 py-1 text-[12px] font-semibold transition-colors',
                  period === p.v
                    ? 'bg-brand-soft text-brand'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setFailedOnly((v) => !v)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] font-semibold transition-colors',
              failedOnly
                ? 'border-red-300 bg-red-50 text-red-800'
                : 'border-rule text-muted-foreground hover:text-foreground'
            )}
          >
            <TriangleAlert size={14} />
            Échecs seulement
          </button>

          {props.ateliers.length > 0 && (
            <select
              value={stoloc}
              onChange={(e) => setStoloc(e.target.value)}
              className="h-8 rounded-md border border-rule bg-card px-2 text-[12.5px]"
            >
              <option value="">Tous les ateliers</option>
              {props.ateliers.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.label}
                </option>
              ))}
            </select>
          )}

          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void load()}
              placeholder="N° d’OF"
              className="h-8 w-40 pl-7 text-[12.5px]"
            />
          </div>

          <span className="ml-auto flex items-center gap-2">
            {counts.wait > 0 && (
              <Button size="sm" variant="outline" onClick={reconcile} disabled={busy}>
                <RotateCcw size={14} />
                Réconcilier
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
              <RefreshCw size={14} className={busy ? 'animate-spin' : undefined} />
              Rafraîchir
            </Button>
            <a
              href={route('print_config.index')}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground"
            >
              <Settings2 size={14} />
              Configuration
            </a>
          </span>
        </div>

        {note && (
          <p className="rounded-md bg-muted px-3 py-2 text-[12.5px]">{note}</p>
        )}

        {/* --- Journal ------------------------------------------------------ */}
        <section className="rounded-lg border border-rule bg-card">
          {jobs.length === 0 ? (
            <p className="px-4 py-12 text-center text-[13px] text-muted-foreground">
              {failedOnly ? 'Aucun échec sur la période.' : 'Aucun tirage sur la période.'}
            </p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-rule text-left font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-bold">Quand</th>
                  <th className="px-4 py-2 font-bold">OF</th>
                  <th className="px-4 py-2 font-bold">Document</th>
                  <th className="px-4 py-2 font-bold">Atelier</th>
                  <th className="px-4 py-2 font-bold">Destination</th>
                  <th className="px-4 py-2 font-bold">Serveur d’édition</th>
                  <th className="px-4 py-2 font-bold">Origine</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {jobs.map((j) => (
                  <Fragment key={j.id}>
                  <tr
                    className={cn(
                      'border-b border-rule/60',
                      opened.has(j.id) && 'border-b-0',
                      failed(j) && 'bg-red-50/40'
                    )}
                  >
                    <td className="px-4 py-2 text-muted-foreground">{fmtStamp(j.createdAt)}</td>
                    <td className="px-4 py-2 font-mono text-[12px] font-semibold">{j.ofNum}</td>
                    <td className="px-4 py-2">
                      {j.docLabel}
                      {j.attempt > 1 && (
                        <span className="ml-1.5 text-[11px] text-amber-700">
                          réimpression #{j.attempt}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{j.atelierLabel || '—'}</td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-[12px]">{j.destCode || '—'}</span>
                      {j.sandbox && (
                        <span className="ml-1.5 font-mono text-[10px] uppercase text-muted-foreground">
                          sans papier
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Verdict j={j} />
                      {j.jobRank > 0 && (
                        <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                          #{j.jobRank}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {ORIGINS[j.origin] ?? j.origin}
                      {j.requestedBy ? ` · ${j.requestedBy}` : ''}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        {(j.error || j.x3Trace || j.jobDetail) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggle(j.id)}
                            title="Cause et trace X3"
                          >
                            {opened.has(j.id) ? (
                              <ChevronDown size={13} />
                            ) : (
                              <ChevronRight size={13} />
                            )}
                            Détail
                          </Button>
                        )}
                        {failed(j) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void relaunch(j)}
                            disabled={relaunching === j.id}
                            title="Relancer ce tirage"
                          >
                            {relaunching === j.id ? (
                              <RefreshCw size={13} className="animate-spin" />
                            ) : (
                              <Printer size={13} />
                            )}
                            Relancer
                          </Button>
                        )}
                      </span>
                    </td>
                  </tr>
                  {opened.has(j.id) && (
                    <tr className={cn('border-b border-rule/60', failed(j) && 'bg-red-50/40')}>
                      <td colSpan={8} className="px-4 pb-3 pt-0">
                        <JobDetail j={j} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}

          <p className="border-t border-rule px-4 py-2 text-[11.5px] italic text-muted-foreground">
            L’astérisque marque un succès déduit de la disparition de la tâche plutôt que lu sur un
            statut terminal. Activer la rétention côté console du serveur d’édition supprime cette
            ambiguïté et rend « Réconcilier » opérant.
          </p>
        </section>
      </div>
    </AppLayout>
  )
}
