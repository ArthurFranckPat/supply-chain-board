import { useCallback, useState } from 'react'
import { Printer, RefreshCw } from 'lucide-react'

import { Button } from '@r/components/ui/button'
import { route } from '@/lib/routes'

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
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 font-mono text-[10.5px]">
      <span className={failed ? 'font-bold text-destructive' : 'text-muted-foreground'}>
        {d.label}
      </span>
      <span className="text-muted-foreground">→</span>
      <span className="font-semibold text-foreground">{d.destCode || '—'}</span>
      {d.attempt > 1 && <span className="text-amber-700">réimpression #{d.attempt}</span>}
      {d.status === 'locked' ? (
        <span className="text-muted-foreground">déjà imprimé</span>
      ) : failed ? (
        <span className="text-destructive">{d.error || 'échec'}</span>
      ) : deferred || d.serverVerdict === 'pending' ? (
        <span className="text-muted-foreground">
          soumis{d.jobRank ? ` · tâche ${d.jobRank}` : ''} · issue à confirmer
        </span>
      ) : d.serverVerdict === 'unknown' ? (
        <span className="text-amber-700">sans verdict du serveur d’édition</span>
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
      <div className="font-mono text-[10.5px] text-muted-foreground">
        Aucune impression · {report.skipped}
      </div>
    )
  }
  if (report.error) {
    return (
      <div className="font-mono text-[11px] font-semibold text-destructive">
        ⚠ Impression non tentée : {report.error}
      </div>
    )
  }
  const failed = report.documents.filter(docFailed)
  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={`font-mono text-[11px] font-semibold ${
          failed.length > 0 ? 'text-destructive' : report.deferred ? 'text-foreground' : 'text-ferme'
        }`}
      >
        {failed.length > 0
          ? `⚠ ${failed.length} document${failed.length > 1 ? 's' : ''} non imprimé${failed.length > 1 ? 's' : ''}`
          : report.deferred
            ? '⏱ Documents soumis — issue à confirmer'
            : '✓ Dossier imprimé'}
        {report.atelier?.label ? ` · ${report.atelier.label}` : ''}
      </div>
      {report.documents.map((d) => (
        <DocLine key={d.docType} d={d} deferred={!!report.deferred} />
      ))}
    </div>
  )
}

/**
 * Bouton de réimpression explicite. Toujours `force` : l'utilisateur qui clique
 * ici demande sciemment un nouveau tirage, et le journal l'enregistre comme tel.
 */
export function OfReprintButton({ ofNum }: { ofNum: string }) {
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<PrintReport | null>(null)

  const run = useCallback(async () => {
    setBusy(true)
    setReport(null)
    try {
      const res = await fetch(route('print.print', { orderNum: ofNum }), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const data = (await res.json()) as PrintReport & { error?: string }
      setReport({ ...data, documents: data.documents ?? [] })
    } catch (e) {
      setReport({ ok: false, documents: [], error: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }, [ofNum])

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={run} disabled={busy}>
        {busy ? (
          <RefreshCw size={14} strokeWidth={1.75} className="animate-spin" />
        ) : (
          <Printer size={14} strokeWidth={1.75} />
        )}
        {busy ? 'Impression…' : 'Réimprimer le dossier'}
      </Button>
      {report && <OfPrintVerdict report={report} />}
    </div>
  )
}
