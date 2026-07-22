import { useState, useCallback } from 'react'
import { Head } from '@inertiajs/react'
import { Check, Copy, LoaderCircle, Printer, TriangleAlert } from 'lucide-react'

import { Masthead } from '@r/components/masthead'
import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import { Input } from '@r/components/ui/input'
import { Label } from '@r/components/ui/label'

/**
 * Terrain de test de l'impression X3 (issue #85, lot 1).
 *
 * Appelle `ZSOAPPRINT` sur UN OF vers une destination `APRINTER`, et affiche le
 * verdict brut : statut SOAP, `WRETCOD`, `WRETERMSG`, entrée de pool servie, et
 * la trace X3 si elle est demandée.
 *
 * Deux avertissements portés à l'écran, pas seulement en commentaire :
 *  - une destination imprimante sort du papier, et le papier ne se reprend pas ;
 *  - `WRETCOD=0` ne prouve pas que le document est sorti tant que le contrôle de
 *    statut côté L4G n'est pas rétabli.
 */

interface RunResponse {
  ok: boolean
  status: number | null
  env?: string
  durationMs?: number
  poolEntryIdx?: string | null
  sent?: Record<string, string>
  retCod?: string | null
  retErMsg?: string | null
  /** Numéro de tâche du serveur d'édition (`ETATJOB` / NOJOB). */
  jobNum?: string | null
  printMessage?: string | null
  fields?: Record<string, string>
  messages?: { type: number; text: string }[]
  error?: string | null
  trace?: string
}

/** Destinations sans effet physique — relevé APRINTER (PRT_0 = 3 mail / 4 fichier). */
const DEST_SURES = [
  { cod: 'PDFFILE', label: 'Fichier PDF (srv-x3tst-01)' },
  { cod: 'ZMAIL', label: 'Envoi PDF par mail' },
  { cod: 'ZRPT', label: 'Prévisualisation' },
  { cod: 'ZTXTBRUT2', label: 'Texte brut' },
]

const ETATS = [
  { cod: 'PING', label: 'PING — sonde, n’imprime rien' },
  { cod: 'BONTRV', label: 'BONTRV — bon de travail' },
  { cod: 'BSM', label: 'BSM — bon de sortie matière' },
]

/**
 * Bouton de copie. Repasse à l'icône neutre après 1,5 s — un état « copié »
 * permanent mentirait au coup d'après.
 */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [text])

  return (
    <Button variant="ghost" size="sm" onClick={copy} title={label} aria-label={label}>
      {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
    </Button>
  )
}

export default function PrintTest() {
  const [rptCod, setRptCod] = useState('PING')
  const [stofcy, setStofcy] = useState('AE1')
  const [mfgNum, setMfgNum] = useState('F126-47558')
  const [dest, setDest] = useState('PDFFILE')
  const [trace, setTrace] = useState(true)
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<RunResponse | null>(null)

  const destPhysique = !DEST_SURES.some((d) => d.cod === dest)

  const run = useCallback(async () => {
    setLoading(true)
    setRes(null)
    try {
      const r = await fetch('/api/v1/x3/print/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rptCod, stofcy, mfgNum, dest, trace }),
      })
      setRes(await r.json())
    } catch (e) {
      setRes({ ok: false, status: null, error: String(e) })
    } finally {
      setLoading(false)
    }
  }, [rptCod, stofcy, mfgNum, dest, trace])

  const verdict = res
    ? res.retCod === '0'
      ? res.printMessage
        ? { txt: 'Édition soumise à X3', tone: 'ok' as const }
        : { txt: 'Appel passé, aucune confirmation X3', tone: 'warn' as const }
      : res.retCod
        ? { txt: `Refusé par le subprogram (WRETCOD=${res.retCod})`, tone: 'ko' as const }
        : { txt: 'Corps du subprogram jamais atteint', tone: 'ko' as const }
    : null

  return (
    <>
      <Head title="Test impression X3" />
      <Masthead
        subtitle="Impression X3 · page de test (#85)"
        active="programme"
        variant="airbnb"
      />

      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Test impression X3 — ZSOAPPRINT</h1>
          <p className="text-muted-foreground text-sm">
            Issue #85, lot 1. Un OF, un état, une destination. Le verdict affiché est celui du
            sous-programme, pas une interprétation.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-lg border p-4">
          <div className="flex flex-col gap-2">
            <Label>État</Label>
            <div className="flex flex-wrap gap-2">
              {ETATS.map((e) => (
                <Button
                  key={e.cod}
                  variant={rptCod === e.cod ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRptCod(e.cod)}
                >
                  {e.label}
                </Button>
              ))}
            </div>
            <Input value={rptCod} onChange={(e) => setRptCod(e.target.value)} className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="fcy">Site</Label>
              <Input id="fcy" value={stofcy} onChange={(e) => setStofcy(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="of">N° OF</Label>
              <Input id="of" value={mfgNum} onChange={(e) => setMfgNum(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Destination</Label>
            <div className="flex flex-wrap gap-2">
              {DEST_SURES.map((d) => (
                <Button
                  key={d.cod}
                  variant={dest === d.cod ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDest(d.cod)}
                >
                  {d.label}
                </Button>
              ))}
            </div>
            <Input value={dest} onChange={(e) => setDest(e.target.value)} className="mt-1" />
            {destPhysique && (
              <p className="flex items-center gap-2 text-sm text-amber-600">
                <TriangleAlert className="size-4 shrink-0" />
                <span>
                  <strong>{dest}</strong> n’est pas une destination fichier connue. Si c’est une
                  imprimante, du papier sortira — et ne se reprendra pas.
                </span>
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={trace} onChange={(e) => setTrace(e.target.checked)} />
            Trace X3 (<code>adxwss.trace.on</code>) — seule source d’info quand l’appel échoue sans
            message
          </label>

          <Button onClick={run} disabled={loading} className="self-start">
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Printer className="size-4" />
            )}
            Lancer
          </Button>
        </section>

        {res && (
          <section className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  verdict?.tone === 'ok'
                    ? 'default'
                    : verdict?.tone === 'warn'
                      ? 'outline'
                      : 'destructive'
                }
              >
                {verdict?.txt}
              </Badge>
              <Badge variant="outline">status SOAP {String(res.status)}</Badge>
              {res.poolEntryIdx && <Badge variant="outline">pool #{res.poolEntryIdx}</Badge>}
              {res.jobNum && res.jobNum !== '0' && (
                <Badge variant="outline">tâche #{res.jobNum}</Badge>
              )}
              {res.durationMs != null && <Badge variant="outline">{res.durationMs} ms</Badge>}
              {res.env && <Badge variant="outline">{res.env}</Badge>}
              <span className="ml-auto">
                <CopyButton
                  text={JSON.stringify(res, null, 2)}
                  label="Copier la réponse complète (JSON)"
                />
              </span>
            </div>

            {res.printMessage && (
              <p className="rounded bg-emerald-50 p-3 text-sm text-emerald-900">
                {res.printMessage}
              </p>
            )}

            {res.retCod === '0' && (
              <p className="text-muted-foreground text-sm">
                {res.printMessage ? (
                  <>
                    X3 a <strong>soumis</strong> l’édition à la destination. Ça ne prouve pas que le
                    document est sorti : ni la file d’impression, ni le serveur d’édition ne
                    remontent ici.
                  </>
                ) : (
                  <>
                    <strong>Aucun message de confirmation X3.</strong> L’appel est passé, mais rien
                    n’atteste qu’une édition a été soumise.
                  </>
                )}
              </p>
            )}

            {res.retErMsg && (
              <pre className="bg-muted overflow-x-auto rounded p-3 text-sm">{res.retErMsg}</pre>
            )}
            {res.error && (
              <pre className="overflow-x-auto rounded bg-red-50 p-3 text-sm text-red-900">
                {res.error}
              </pre>
            )}
            {!!res.messages?.length && (
              <ul className="flex flex-col gap-1 text-sm">
                {res.messages.map((m, i) => (
                  <li key={i}>
                    <Badge variant="outline">type {m.type}</Badge> {m.text}
                  </li>
                ))}
              </ul>
            )}

            {res.fields && Object.keys(res.fields).length > 0 && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">
                  Paramètres de sortie
                </summary>
                <pre className="bg-muted mt-2 overflow-x-auto rounded p-3 text-xs">
                  {JSON.stringify(res.fields, null, 2)}
                </pre>
              </details>
            )}

            {res.trace && (
              <details>
                <summary className="cursor-pointer text-sm font-medium">Trace X3</summary>
                <div className="flex items-start gap-2">
                  <pre className="bg-muted mt-2 max-h-96 flex-1 overflow-auto rounded p-3 text-xs">
                    {res.trace}
                  </pre>
                  <span className="mt-2">
                    <CopyButton text={res.trace} label="Copier la trace X3" />
                  </span>
                </div>
              </details>
            )}
          </section>
        )}
      </div>
    </>
  )
}
