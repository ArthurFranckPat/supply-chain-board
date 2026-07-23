import { useState, useCallback, useMemo } from 'react'
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

interface Destination {
  code: string
  label: string
  kind: number
  kindLabel: string
  server: string
  queue: string
  active: boolean
  /** true = fichier / mail / aperçu : ne sort pas de papier. */
  sandbox: boolean
}

interface PageProps {
  /** 'test' | 'prod' — dossier de la session, celui qui sera réellement appelé. */
  env: string
  pool: string
  host: string
  destinations: Destination[]
  destinationsError: string
}

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

export default function PrintTest(props: PageProps) {
  const [rptCod, setRptCod] = useState('PING')
  const [stofcy, setStofcy] = useState('AE1')
  const [mfgNum, setMfgNum] = useState('F126-47558')
  /**
   * Aucune destination pré-choisie. `PDFFILE` l'était, et c'est trompeur : l'état
   * `BSM` ne produit AUCUNE tâche vers une destination fichier (type 4) alors
   * qu'il sort normalement vers un aperçu (type 1) — vérifié sur prod, et
   * reproduit en interactif dans X3. Un défaut qui échoue silencieusement sur la
   * moitié des états ne peut pas être le défaut.
   */
  const [dest, setDest] = useState('')
  const [trace, setTrace] = useState(true)
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<RunResponse | null>(null)

  // Groupées par nature (imprimante / fichier / mail / aperçu) : on choisit
  // d'abord un EFFET, puis une destination dans cet effet.
  const groupes = useMemo(() => {
    const par = new Map<string, Destination[]>()
    for (const d of props.destinations.filter((x) => x.active)) {
      par.set(d.kindLabel, [...(par.get(d.kindLabel) ?? []), d])
    }
    // Les destinations sans papier d'abord : c'est par là qu'on commence un test.
    return [...par.entries()].sort((a, b) => {
      const pa = a[1][0].sandbox ? 0 : 1
      const pb = b[1][0].sandbox ? 0 : 1
      return pa - pb || a[0].localeCompare(b[0])
    })
  }, [props.destinations])

  const destChoisie = props.destinations.find((d) => d.code === dest)
  /** Inconnue du dossier = on ne sait pas ce qu'elle fera. Traitée comme à risque. */
  const destPhysique = !destChoisie || !destChoisie.sandbox

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

        {/* Dossier ciblé, annoncé AVANT le tir : cet écran peut sortir du papier,
            et il suit l'environnement de la session — pas un dossier de test. */}
        <p
          className={
            props.env === 'prod'
              ? 'flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900'
              : 'flex items-center gap-2 rounded-md border bg-muted px-3 py-2 text-sm'
          }
        >
          {props.env === 'prod' && <TriangleAlert className="size-4 shrink-0" />}
          <span>
            Dossier ciblé : <strong>{props.pool || '—'}</strong>
            {props.env ? ` · ${props.env}` : ''}
            {props.host ? ` · ${props.host}` : ''}
            {props.env === 'prod' && ' — les tirages partent en production.'}
          </span>
        </p>

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
            <Label htmlFor="dest">Destination</Label>
            {props.destinationsError ? (
              <p className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <TriangleAlert className="size-4 shrink-0" />
                Destinations X3 indisponibles : {props.destinationsError} — saisir le code à la
                main.
              </p>
            ) : (
              <select
                id="dest"
                value={props.destinations.some((d) => d.code === dest) ? dest : ''}
                onChange={(e) => setDest(e.target.value)}
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              >
                <option value="">— choisir une destination —</option>
                {groupes.map(([nature, list]) => (
                  <optgroup
                    key={nature}
                    label={`${nature}${list[0].sandbox ? '' : ' — sort du papier'}`}
                  >
                    {list.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} — {d.label || '(sans libellé)'}
                        {d.queue ? ` · file ${d.queue}` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}

            <Input
              value={dest}
              onChange={(e) => setDest(e.target.value)}
              placeholder="ou saisir un code destination"
              className="mt-1"
            />

            {destChoisie && (
              <p className="text-muted-foreground text-sm">
                {destChoisie.kindLabel}
                {destChoisie.server ? ` · serveur ${destChoisie.server}` : ' · aucun serveur d’impression déclaré'}
                {destChoisie.queue ? ` · file ${destChoisie.queue}` : ''}
              </p>
            )}

            {/* Constat de terrain, pas une théorie : BSM vers PDFFILE rend
                WRETCOD=0 et AUCUNE tâche, alors que BSM vers PREVISU sort. */}
            {destChoisie?.kind === 4 && rptCod === 'BSM' && (
              <p className="flex items-center gap-2 text-sm text-amber-600">
                <TriangleAlert className="size-4 shrink-0" />
                <span>
                  <strong>BSM ne produit rien vers une destination fichier.</strong> L’appel rendra{' '}
                  <code>WRETCOD=0</code> sans numéro de tâche. Pour un essai sans papier, prendre un
                  aperçu (ex. <code>PREVISU</code>).
                </span>
              </p>
            )}

            {destPhysique && (
              <p className="flex items-center gap-2 text-sm text-amber-600">
                <TriangleAlert className="size-4 shrink-0" />
                <span>
                  {destChoisie ? (
                    <>
                      <strong>{dest}</strong> est une imprimante : du papier sortira, et il ne se
                      reprend pas.
                    </>
                  ) : (
                    <>
                      <strong>{dest || '(vide)'}</strong> est inconnue de ce dossier. On ne sait pas
                      ce qu’elle fera — si c’est une imprimante, du papier sortira.
                    </>
                  )}
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
