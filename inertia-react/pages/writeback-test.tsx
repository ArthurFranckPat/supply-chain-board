import { useState, useCallback } from 'react'
import { Head } from '@inertiajs/react'
import { route } from '@/lib/routes'
import { cn } from '@r/lib/utils'

import { Masthead } from '@r/components/masthead'
import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import { DynamicIcon } from '../components/ui/dynamic-icon'
import { TriangleAlert, Download, LoaderCircle, CircleX } from 'lucide-react'

/**
 * Terrain de test du write-back X3 (issue #29).
 *
 * Page isolée (pas de nav durable) pour enchaîner, sur l'environnement de TEST,
 * les opérations CRUD objet du stub CAdxWebServiceXmlCC : read → save → modify.
 * Les credentials sont ceux de la session (#13) ; rien à saisir ici.
 *
 * Workflow recommandé (KB Sage 80551) :
 *   1. Read sur un enregistrement existant → récupère un XML-modèle.
 *   2. Copiez ce XML dans l'éditeur, ajustez-le, puis Save (créer) ou Modify.
 *
 * Port depuis inertia/pages/writeback-test.tsx (SolidJS).
 */

type Op =
  | 'describe'
  | 'read'
  | 'save'
  | 'modify'
  | 'delete'
  | 'list'
  | 'run'

interface ObjectMessage {
  type: number // 1=erreur, 2=warning, 3=info
  text: string
}
interface OpResult {
  ok: boolean
  status: number | null
  operation: string
  publicName: string
  env: string
  resultXml: string
  messages: ObjectMessage[]
  error: string | null
}

const DEFAULT_XML = `<PARAM>
  <GRP ID="BPC0_1">
    <FLD NAME="BCGCOD" TYPE="Char">CLI00</FLD>
    <FLD NAME="BPCSTA" TYPE="Integer">2</FLD>
    <FLD NAME="BPCNUM" TYPE="Char">TESTZ99</FLD>
  </GRP>
  <GRP ID="BPRC_1">
    <FLD NAME="BPRNAM" TYPE="Char">Client test write-back</FLD>
    <FLD NAME="CRY" TYPE="Char">FR</FLD>
    <FLD NAME="LAN" TYPE="Char">FRA</FLD>
    <FLD NAME="CUR" TYPE="Char">EUR</FLD>
  </GRP>
  <TAB DIM="30" ID="BPAC_1" SIZE="1">
    <LIN>
      <FLD NAME="CODADR" TYPE="Char">001</FLD>
      <FLD NAME="BPADES" TYPE="Char">Adresse principale</FLD>
      <FLD NAME="BPACRY" TYPE="Char">FR</FLD>
      <FLD NAME="POSCOD" TYPE="Char">69000</FLD>
      <FLD NAME="CTY" TYPE="Char">LYON</FLD>
      <FLD NAME="BPAADDFLG" TYPE="Integer">2</FLD>
    </LIN>
  </TAB>
  <GRP ID="BPC3_2">
    <FLD NAME="VACBPR" TYPE="Char">FRA</FLD>
  </GRP>
  <TAB DIM="30" ID="BPC4_1" SIZE="1">
    <LIN>
      <FLD NAME="BPAADD" TYPE="Char">001</FLD>
      <FLD NAME="BPDADDFLG" TYPE="Integer">2</FLD>
    </LIN>
  </TAB>
</PARAM>`

// Payload par défaut pour l'op `run` (affermissement FIRMSUGG / FUNMAUTR, #31).
const FIRMSUGG_XML = `<PARAM>
  <GRP ID="GRP1">
    <FLD NAME="WSUGNUM">SGAE10645869666</FLD>
    <FLD NAME="WSTOFCY">AE1</FLD>
    <FLD NAME="WITMREF">11035404</FLD>
  </GRP>
</PARAM>`

const MSG_STYLE: Record<number, string> = {
  1: 'bg-destructive/10 text-destructive',
  2: 'bg-warning/10 text-warning',
  3: 'bg-secondary text-muted-foreground',
}
const MSG_LABEL: Record<number, string> = {
  1: 'Erreur',
  2: 'Avertissement',
  3: 'Info',
}

async function execOp(
  op: Op,
  object: string,
  keys: string,
  objectXml: string,
  queryXml: string = '<PARAM/>',
  listSize: number = 50
): Promise<OpResult> {
  if (op === 'describe') {
    const url = `${route('x3_writeback.describe')}?object=${encodeURIComponent(object)}`
    const res = await fetch(url)
    return (await res.json()) as OpResult
  }
  if (op === 'read') {
    const url = `${route('x3_writeback.read')}?object=${encodeURIComponent(object)}&keys=${encodeURIComponent(keys)}`
    const res = await fetch(url)
    return (await res.json()) as OpResult
  }
  if (op === 'delete') {
    const url = `${route('x3_writeback.delete')}?object=${encodeURIComponent(object)}&keys=${encodeURIComponent(keys)}`
    const res = await fetch(url)
    return (await res.json()) as OpResult
  }
  if (op === 'list') {
    const url = `${route('x3_writeback.list')}?object=${encodeURIComponent(object)}&queryXml=${encodeURIComponent(queryXml)}&listSize=${encodeURIComponent(listSize)}`
    const res = await fetch(url)
    return (await res.json()) as OpResult
  }
  if (op === 'run') {
    const res = await fetch(route('x3_writeback.run'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ object, objectXml }),
    })
    return (await res.json()) as OpResult
  }
  const rname = op === 'save' ? 'x3_writeback.save' : 'x3_writeback.modify'
  const body = op === 'save' ? { object, objectXml } : { object, keys, objectXml }
  const res = await fetch(route(rname), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return (await res.json()) as OpResult
}

export default function WritebackTest() {
  const [object, setObject] = useState('ZSOAPFIRM')
  const [op, setOp] = useState<Op>('run')
  const [keys, setKeys] = useState('')
  const [objectXml, setObjectXml] = useState(FIRMSUGG_XML)
  const [queryXml, setQueryXml] = useState('<PARAM/>')
  const [listSize, setListSize] = useState(50)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<OpResult | null>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [showFullXml, setShowFullXml] = useState(false)
  const [fetchErr, setFetchErr] = useState('')

  const needKeys = op === 'read' || op === 'modify' || op === 'delete'
  const needXml = op === 'save' || op === 'modify' || op === 'run'
  const needQueryXml = op === 'list'

  const run = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (needKeys && !keys.trim()) {
        setFetchErr('Renseigne au moins une clé (ex. BPCNUM:C001).')
        return
      }
      setLoading(true)
      setFetchErr('')
      try {
        const r = await execOp(
          op,
          object.trim(),
          keys.trim(),
          objectXml,
          queryXml,
          listSize
        )
        setResult(r)
      } catch (err) {
        setFetchErr((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [op, object, keys, objectXml, queryXml, listSize, needKeys]
  )

  /** Charge le XML du dernier read dans l'éditeur et bascule en mode SAVE :
   *  le `<textarea>` objectXml n'est visible qu'en save/modify, donc on switch
   *  pour que le chargement soit immédiatement visible (pas de copier-coller). */
  const copyToEditor = useCallback(() => {
    const xml = result?.resultXml
    if (xml) {
      setObjectXml(xml)
      setOp('save')
    }
  }, [result])

  /** Lit la clé courante et reporte le XML renvoyé dans l'éditeur (workflow KB 80551). */
  const prefill = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!keys.trim()) {
        setFetchErr(
          "Renseigne d'abord une clé pour le read (ex. BPCNUM:C001)."
        )
        return
      }
      setLoading(true)
      setFetchErr('')
      try {
        const r = await execOp('read', object.trim(), keys.trim(), '')
        setResult(r)
        if (r.ok && r.resultXml) setObjectXml(r.resultXml)
      } catch (err) {
        setFetchErr((err as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [keys, object]
  )

  const OP_OPTIONS: Op[] = [
    'describe',
    'read',
    'list',
    'save',
    'modify',
    'delete',
    'run',
  ]

  const getOpIcon = (opType: Op): string => {
    switch (opType) {
      case 'describe':
        return 'description'
      case 'read':
        return 'search'
      case 'list':
        return 'format_list_bulleted'
      case 'save':
        return 'add_circle'
      case 'modify':
        return 'edit'
      case 'run':
        return 'play_arrow'
      case 'delete':
        return 'delete'
      default:
        return ''
    }
  }

  const getOpLabel = (opType: Op): string => {
    switch (opType) {
      case 'describe':
        return 'Décrire'
      case 'read':
        return 'Lire'
      case 'list':
        return 'Lister (queryList)'
      case 'save':
        return 'Créer (save)'
      case 'modify':
        return 'Modifier (modify)'
      case 'run':
        return 'Exécuter (run)'
      case 'delete':
        return 'Supprimer (delete)'
      default:
        return ''
    }
  }

  return (
    <>
      <Head title="Writeback test" />
      <div className="theme-airbnb flex h-screen flex-col overflow-hidden bg-background text-foreground">
        <Masthead
          subtitle="Write-back X3 · terrain de test (#29)"
          active="programme"
          variant="airbnb"
        />

        <div className="flex-1 overflow-auto px-4 py-3">
          <div className="mx-auto flex max-w-5xl flex-col gap-5">
            {/* Avertissement ciblage TEST */}
            <div className="flex items-center gap-2 rounded-md bg-warning/10 px-4 py-2.5 text-[12px] text-warning">
              <TriangleAlert size={16} />
              <span>
                Save / Modify <strong>écrivent dans X3</strong> via la couche objet
                (validations + transactions applicatives). Cible
                l'environnement <strong>TEST</strong> : connecte-toi avec{' '}
                <code>env=test</code> avant de tester.
              </span>
            </div>

            {/* Sélecteur d'opération */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                OPÉRATION
              </span>
              {OP_OPTIONS.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={cn(
                    'rounded-md border px-3 py-1.5 font-mono text-[12px] font-semibold',
                    op === o
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setOp(o)}
                >
                  {o.toUpperCase()}
                </button>
              ))}
              {result && (
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  env cible :{' '}
                  <span className="font-bold text-foreground">{result.env}</span>
                </span>
              )}
            </div>

            <form
              className="flex flex-col gap-4 rounded-md border border-border bg-background px-4 py-4"
              onSubmit={run}
            >
              {/* Objet */}
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                  OBJET PUBLÉ (publicName)
                </span>
                <input
                  className="w-72 rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-brand"
                  placeholder="ex. BPC"
                  value={object}
                  onChange={(e) => setObject(e.currentTarget.value)}
                />
              </label>

              {/* Clés (read / modify) */}
              {needKeys && (
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                    CLÉS — format <code>CHAMP:VALEUR</code> séparées par virgules
                  </span>
                  <input
                    className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-brand"
                    placeholder="ex. BPCNUM:C001"
                    value={keys}
                    onChange={(e) => setKeys(e.currentTarget.value)}
                  />
                </label>
              )}

              {/* queryXml + listSize (list) */}
              {needQueryXml && (
                <>
                  <div className="flex items-center gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                        TAILLE LISTE (max 500)
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="500"
                        className="w-28 rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-brand"
                        value={listSize}
                        onChange={(e) =>
                          setListSize(
                            Math.min(
                              500,
                              Math.max(1, parseInt(e.currentTarget.value) || 50)
                            )
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                      queryXml — filtre (vide = tous)
                    </span>
                    <textarea
                      className="h-24 w-full rounded-md border border-border bg-secondary/40 px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-brand"
                      spellCheck={false}
                      value={queryXml}
                      onChange={(e) => setQueryXml(e.currentTarget.value)}
                    />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      Ex. CBD :{' '}
                      <code>{'<PARAM><FLD NAME="ITMREF">PP830</FLD></PARAM>'}</code>
                    </span>
                  </div>
                </>
              )}

              {/* objectXml (save / modify) */}
              {needXml && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                      objectXml — payload XML de l'objet
                    </span>
                    {op === 'modify' && (
                      <button
                        type="button"
                        className="flex items-center gap-1 font-mono text-[11px] text-brand hover:underline"
                        onClick={prefill}
                        disabled={loading}
                      >
                        <Download size={14} />
                        Pré-remplir depuis un read
                      </button>
                    )}
                  </div>
                  <textarea
                    className="h-56 w-full rounded-md border border-border bg-secondary/40 px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-brand"
                    spellCheck={false}
                    value={objectXml}
                    onChange={(e) => setObjectXml(e.currentTarget.value)}
                  />
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Astuce : Read sur un enregistrement existant → copier le XML
                    renvoyé ici → modifier les valeurs.
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button type="submit" className="gap-1.5" disabled={loading}>
                  <DynamicIcon name={getOpIcon(op)} size={16} />
                  {getOpLabel(op)}
                </Button>
                {loading && (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                    <LoaderCircle size={16} className="animate-spin" />
                    En cours…
                  </span>
                )}
              </div>
            </form>

            {/* Erreur réseau */}
            {fetchErr && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
                <CircleX size={18} />
                {fetchErr}
              </div>
            )}

            {/* Résultat */}
            {result && (
              <div className="flex flex-col gap-3">
                {/* En-tête verdict */}
                <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary px-4 py-3">
                  <span className="font-mono text-[14px] font-bold text-foreground">
                    {result.publicName}
                  </span>
                  <Badge variant={result.ok ? 'success' : 'destructive'}>
                    {result.ok ? 'OK' : 'ÉCHEC'}
                  </Badge>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    statut X3 : {result.status ?? '—'} · op {result.operation}
                  </span>
                  {result.error && (
                    <span className="font-mono text-[11px] font-medium text-destructive">
                      {result.error}
                    </span>
                  )}
                </div>

                {/* Messages Syracuse */}
                {result.messages.length > 0 && (
                  <div className="flex flex-col gap-1.5 rounded-md border border-border bg-background px-4 py-3">
                    <div className="mb-0.5 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                      MESSAGES X3
                    </div>
                    {result.messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          'rounded px-3 py-1.5 font-mono text-[11px]',
                          MSG_STYLE[msg.type] ?? MSG_STYLE[3]
                        )}
                      >
                        <span className="font-bold">
                          [{MSG_LABEL[msg.type] ?? msg.type}]
                        </span>{' '}
                        {msg.text}
                      </div>
                    ))}
                  </div>
                )}

                {/* XML objet renvoyé */}
                {result.resultXml && (
                  <div className="flex flex-col gap-1.5 rounded-md border border-border bg-background px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                        resultXml — XML objet renvoyé par X3
                      </span>
                      <button
                        type="button"
                        className="flex items-center gap-1 font-mono text-[11px] text-brand hover:underline"
                        onClick={copyToEditor}
                      >
                        <Download size={14} />
                        Charger dans l'éditeur (→ save)
                      </button>
                    </div>
                    <pre className="max-h-80 overflow-auto rounded-md bg-secondary/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                      {showFullXml || result.resultXml.length < 8000
                        ? result.resultXml
                        : result.resultXml.slice(0, 8000) + '\n… [truncated]'}
                    </pre>
                    {result.resultXml.length >= 8000 && (
                      <button
                        type="button"
                        className="mt-1 font-mono text-[11px] text-brand hover:underline"
                        onClick={() => setShowFullXml(!showFullXml)}
                      >
                        {showFullXml
                          ? '▾ Réduire'
                          : `▸ Afficher le XML complet (${(result.resultXml.length / 1000).toFixed(0)} KB)`}
                      </button>
                    )}
                  </div>
                )}

                {!result.resultXml && result.ok && (
                  <div className="rounded-md bg-ferme/10 px-4 py-3 text-[12px] text-ferme">
                    X3 a confirmé l'opération sans renvoyer de XML.
                  </div>
                )}
              </div>
            )}

            {/* Debug JSON */}
            {result && (
              <div>
                <button
                  className="font-mono text-[11px] font-semibold text-brand hover:underline"
                  type="button"
                  onClick={() => setShowRaw(!showRaw)}
                >
                  {showRaw ? '▾ masquer le JSON brut' : '▸ afficher le JSON brut'}
                </button>
                {showRaw && (
                  <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-secondary p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
