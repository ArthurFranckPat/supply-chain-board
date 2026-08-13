import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Clock, Printer, RefreshCw, TriangleAlert } from 'lucide-react'
import { Popover } from '@base-ui/react/popover'

import { Button } from '@r/components/ui/button'
import { route } from '@r/lib/routes'

/**
 * Verdict d'impression du dossier d'OF (issue #85, lot 3).
 *
 * Volontairement séparé du verdict d'affermissement : « OF affermi » et
 * « documents imprimés » sont deux faits distincts, et les confondre masquerait
 * l'état dangereux — un OF lancé dans l'ERP dont l'atelier n'a pas le papier.
 *
 * Trois états rendus tels quels, jamais arrondis :
 *  - chaque document parti sans erreur constatée ;
 *  - au moins un document en échec, avec sa cause ;
 *  - verdict différé (affermissement groupé) : les tirages sont partis, leur
 *    issue reste à lire dans le journal.
 */

export interface PrintDocument {
  docType: string
  label: string
  /** 'submitted' | 'failed' | 'locked' — verdict X3. */
  status: string
  destCode: string
  sandbox: boolean
  /** 'ok' | 'error' | 'unknown' | 'pending' — verdict du serveur d'édition. */
  serverVerdict: string
  jobRank: number
  attempt: number
  message: string
  error: string
}

export interface PrintReport {
  attempted?: boolean
  ok: boolean
  deferred?: boolean
  atelier?: { code: string; label: string }
  documents: PrintDocument[]
  error?: string
  /** Motif quand le réglage a écarté l'impression (chaîne vide sinon). */
  skipped?: string
}

const docFailed = (d: PrintDocument) => d.status === 'failed' || d.serverVerdict === 'error'

/** Une ligne par document : ce qui est parti, où, et ce qu'il en est advenu. */
function DocLine({ d, deferred }: { d: PrintDocument; deferred: boolean }) {
  const failed = docFailed(d)
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-mono text-1.5xs">
      <span className={failed ? 'font-bold text-destructive' : 'text-muted-foreground'}>
        {d.label}
      </span>
      <span className="text-muted-foreground">→</span>
      <span className="font-semibold text-foreground">{d.destCode || '—'}</span>
      {d.attempt > 1 && <span className="text-suggere">réimpression #{d.attempt}</span>}
      {d.status === 'locked' ? (
        <span className="text-muted-foreground">déjà imprimé</span>
      ) : failed ? (
        <span className="text-destructive">{d.error || 'échec'}</span>
      ) : deferred || d.serverVerdict === 'pending' ? (
        <span className="text-muted-foreground">
          soumis{d.jobRank ? ` · tâche ${d.jobRank}` : ''} · issue à confirmer
        </span>
      ) : d.serverVerdict === 'unknown' ? (
        <span className="text-suggere">sans verdict du serveur d’édition</span>
      ) : (
        <span className="text-ferme">remis à la file</span>
      )}
    </div>
  )
}

export function OfPrintVerdict({ report }: { report: PrintReport }) {
  // Réglage : rien n'a été imprimé, et c'était voulu. Le dire explicitement —
  // un silence laisserait croire à un dossier sorti.
  if (report.skipped) {
    return (
      <div className="font-mono text-1.5xs text-muted-foreground">
        Aucune impression · {report.skipped}
      </div>
    )
  }
  if (report.error) {
    return (
      <div className="flex items-center gap-1 font-mono text-1.5xs font-semibold text-destructive">
        <TriangleAlert size={12} strokeWidth={1.75} />
        Impression non tentée : {report.error}
      </div>
    )
  }
  const failed = report.documents.filter(docFailed)
  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={`flex items-center gap-1 font-mono text-1.5xs font-semibold ${
          failed.length > 0
            ? 'text-destructive'
            : report.deferred
              ? 'text-foreground'
              : 'text-ferme'
        }`}
      >
        {failed.length > 0 ? (
          <TriangleAlert size={12} strokeWidth={1.75} />
        ) : report.deferred ? (
          <Clock size={12} strokeWidth={1.75} />
        ) : (
          <Check size={12} strokeWidth={1.75} />
        )}
        {failed.length > 0
          ? `${failed.length} document${failed.length > 1 ? 's' : ''} non imprimé${failed.length > 1 ? 's' : ''}`
          : report.deferred
            ? 'Documents soumis — issue à confirmer'
            : 'Dossier imprimé'}
        {report.atelier?.label ? ` · ${report.atelier.label}` : ''}
      </div>
      {report.documents.map((d) => (
        <DocLine key={d.docType} d={d} deferred={!!report.deferred} />
      ))}
    </div>
  )
}

interface FolderDocument {
  code: string
  label: string
}

/**
 * Impression manuelle du dossier depuis le détail OF.
 *
 * Split button : clic principal = imprimer la sélection (défaut : tout) ;
 * chevron = popover cases à cocher. Un seul chrome. Toujours `force`.
 */
export function OfReprintButton({
  ofNum,
  seedReport,
}: {
  ofNum: string
  seedReport?: PrintReport | null
}) {
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<PrintReport | null>(seedReport ?? null)
  const [documents, setDocuments] = useState<FolderDocument[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loadErr, setLoadErr] = useState('')

  useEffect(() => {
    if (seedReport) setReport(seedReport)
  }, [seedReport])

  useEffect(() => {
    let cancelled = false
    fetch(route('print.documents'))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ documents?: FolderDocument[] }>
      })
      .then((data) => {
        if (cancelled) return
        const docs = data.documents ?? []
        setDocuments(docs)
        setSelected(new Set(docs.map((d) => d.code)))
      })
      .catch((e: Error) => {
        if (!cancelled) setLoadErr(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleDoc = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const run = useCallback(async () => {
    const docTypes = documents.filter((d) => selected.has(d.code)).map((d) => d.code)
    if (docTypes.length === 0) return
    setBusy(true)
    setReport(null)
    try {
      const res = await fetch(route('print.print', { orderNum: ofNum }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true, docTypes }),
      })
      const data = (await res.json()) as PrintReport & { error?: string }
      setReport({ ...data, documents: data.documents ?? [] })
    } catch (e) {
      setReport({ ok: false, documents: [], error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }, [ofNum, documents, selected])

  const canPrint = documents.length > 0 && selected.size > 0 && !busy
  const label = busy ? 'Impression…' : 'Imprimer'

  return (
    <div className="flex min-w-0 flex-col items-end gap-1">
      <div data-slot="button-group">
        <Button
          size="lg"
          variant="outline"
          className="gap-1.5"
          onClick={() => void run()}
          disabled={!canPrint}
          title={!canPrint && !busy ? 'Choisir au moins un document' : undefined}
        >
          {busy ? (
            <RefreshCw size={14} strokeWidth={1.75} className="animate-spin" />
          ) : (
            <Printer size={14} strokeWidth={1.75} />
          )}
          {label}
        </Button>
        <span
          aria-hidden="true"
          className="w-px shrink-0 self-stretch bg-[color-mix(in_oklab,#141414_12%,transparent)]"
        />
        <Popover.Root>
          <Popover.Trigger
            disabled={busy || documents.length === 0}
            render={
              <Button
                size="lg"
                variant="outline"
                disabled={busy || documents.length === 0}
                className="px-1.5"
                aria-label="Choisir les documents"
                title="Choisir les documents"
              >
                <ChevronDown size={14} strokeWidth={1.75} />
              </Button>
            }
          />
          <Popover.Portal>
            <Popover.Positioner
              side="top"
              align="end"
              sideOffset={6}
              collisionPadding={8}
              className="z-[80]"
            >
              <Popover.Popup
                data-slot="popover-content"
                role="menu"
                aria-label="Documents à imprimer"
                className="min-w-[220px] p-1"
              >
                {documents.map((d) => {
                  const on = selected.has(d.code)
                  return (
                    <button
                      key={d.code}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      onClick={() => toggleDoc(d.code)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-cell-lg hover:bg-muted"
                    >
                      <Check
                        size={14}
                        strokeWidth={1.75}
                        className={on ? 'opacity-100' : 'opacity-0'}
                        aria-hidden="true"
                      />
                      {d.label}
                    </button>
                  )
                })}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {loadErr && (
        <span className="text-xs text-destructive">Documents indisponibles : {loadErr}</span>
      )}
      {report && <OfPrintVerdict report={report} />}
    </div>
  )
}
