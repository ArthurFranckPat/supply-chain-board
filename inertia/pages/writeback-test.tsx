import { createSignal, Show, For, type Component } from 'solid-js'
import { Masthead } from '@/components/masthead'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { route } from '@/lib/routes'

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
 */

type Op = 'describe' | 'read' | 'save' | 'modify' | 'delete' | 'list' | 'run'

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
const MSG_LABEL: Record<number, string> = { 1: 'Erreur', 2: 'Avertissement', 3: 'Info' }

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

const WritebackTest: Component = () => {
  const [object, setObject] = createSignal('ZSOAPFIRM')
  const [op, setOp] = createSignal<Op>('run')
  const [keys, setKeys] = createSignal('')
  const [objectXml, setObjectXml] = createSignal(FIRMSUGG_XML)
  const [queryXml, setQueryXml] = createSignal('<PARAM/>')
  const [listSize, setListSize] = createSignal(50)
  const [loading, setLoading] = createSignal(false)
  const [result, setResult] = createSignal<OpResult | null>(null)
  const [showRaw, setShowRaw] = createSignal(false)
  const [showFullXml, setShowFullXml] = createSignal(false)
  const [fetchErr, setFetchErr] = createSignal('')

  const needKeys = () => op() === 'read' || op() === 'modify' || op() === 'delete'
  const needXml = () => op() === 'save' || op() === 'modify' || op() === 'run'
  const needQueryXml = () => op() === 'list'

  const run = async (e: Event) => {
    e.preventDefault()
    if (needKeys() && !keys().trim()) {
      setFetchErr('Renseigne au moins une clé (ex. BPCNUM:C001).')
      return
    }
    setLoading(true)
    setFetchErr('')
    try {
      const r = await execOp(
        op(),
        object().trim(),
        keys().trim(),
        objectXml(),
        queryXml(),
        listSize()
      )
      setResult(r)
    } catch (err) {
      setFetchErr((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  /** Charge le XML du dernier read dans l'éditeur et bascule en mode SAVE :
   *  le `<textarea>` objectXml n'est visible qu'en save/modify, donc on switch
   *  pour que le chargement soit immédiatement visible (pas de copier-coller). */
  const copyToEditor = () => {
    const xml = result()?.resultXml
    if (xml) {
      setObjectXml(xml)
      setOp('save')
    }
  }

  /** Lit la clé courante et reporte le XML renvoyé dans l'éditeur (workflow KB 80551). */
  const prefill = async (e: Event) => {
    e.preventDefault()
    if (!keys().trim()) {
      setFetchErr("Renseigne d'abord une clé pour le read (ex. BPCNUM:C001).")
      return
    }
    setLoading(true)
    setFetchErr('')
    try {
      const r = await execOp('read', object().trim(), keys().trim(), '')
      setResult(r)
      if (r.ok && r.resultXml) setObjectXml(r.resultXml)
    } catch (err) {
      setFetchErr((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead subtitle="Write-back X3 · terrain de test (#29)" active="ordonnancement" />

      <div class="flex-1 overflow-auto px-7 py-6">
        <div class="mx-auto flex max-w-5xl flex-col gap-5">
          {/* Avertissement ciblage TEST */}
          <div class="flex items-center gap-2 rounded-md bg-warning/10 px-4 py-2.5 text-[12px] text-warning">
            <span class="material-symbols-outlined text-[16px]">warning</span>
            <span>
              Save / Modify <strong>écrivent dans X3</strong> via la couche objet (validations +
              transactions applicables). Cible l'environnement <strong>TEST</strong> : connecte-toi
              avec <code>env=test</code> avant de tester.
            </span>
          </div>

          {/* Sélecteur d'opération */}
          <div class="flex items-center gap-2">
            <span class="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
              OPÉRATION
            </span>
            <For each={['describe', 'read', 'list', 'save', 'modify', 'delete', 'run'] as Op[]}>
              {(o) => (
                <button
                  class={`rounded-md border px-3 py-1.5 font-mono text-[12px] font-semibold ${
                    op() === o
                      ? 'border-brand bg-brand/10 text-brand'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setOp(o)}
                >
                  {o.toUpperCase()}
                </button>
              )}
            </For>
            <Show when={result()}>
              {(r) => (
                <span class="ml-auto font-mono text-[11px] text-muted-foreground">
                  env cible : <span class="font-bold text-foreground">{r().env}</span>
                </span>
              )}
            </Show>
          </div>

          <form
            class="flex flex-col gap-4 rounded-md border border-border bg-background px-4 py-4"
            onSubmit={run}
          >
            {/* Objet */}
            <label class="flex flex-col gap-1">
              <span class="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                OBJET PUBLÉ (publicName)
              </span>
              <input
                class="w-72 rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-brand"
                placeholder="ex. BPC"
                value={object()}
                onInput={(e) => setObject(e.currentTarget.value)}
              />
            </label>

            {/* Clés (read / modify) */}
            <Show when={needKeys()}>
              <label class="flex flex-col gap-1">
                <span class="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                  CLÉS — format <code>CHAMP:VALEUR</code> séparées par virgules
                </span>
                <input
                  class="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-brand"
                  placeholder="ex. BPCNUM:C001"
                  value={keys()}
                  onInput={(e) => setKeys(e.currentTarget.value)}
                />
              </label>
            </Show>

            {/* queryXml + listSize (list) */}
            <Show when={needQueryXml()}>
              <div class="flex items-center gap-3">
                <label class="flex flex-col gap-1">
                  <span class="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                    TAILLE LISTE (max 500)
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    class="w-28 rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-brand"
                    value={listSize()}
                    onInput={(e) =>
                      setListSize(Math.min(500, Math.max(1, parseInt(e.currentTarget.value) || 50)))
                    }
                  />
                </label>
              </div>
              <div class="flex flex-col gap-1">
                <span class="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                  queryXml — filtre (vide = tous)
                </span>
                <textarea
                  class="h-24 w-full rounded-md border border-border bg-secondary/40 px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-brand"
                  spellcheck={false}
                  value={queryXml()}
                  onInput={(e) => setQueryXml(e.currentTarget.value)}
                />
                <span class="font-mono text-[10px] text-muted-foreground">
                  Ex. CBD : <code>{'<PARAM><FLD NAME="ITMREF">PP830</FLD></PARAM>'}</code>
                </span>
              </div>
            </Show>

            {/* objectXml (save / modify) */}
            <Show when={needXml()}>
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between">
                  <span class="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                    objectXml — payload XML de l'objet
                  </span>
                  <Show when={op() === 'modify'}>
                    <button
                      type="button"
                      class="flex items-center gap-1 font-mono text-[11px] text-brand hover:underline"
                      onClick={prefill}
                      disabled={loading()}
                    >
                      <span class="material-symbols-outlined text-[14px]">download</span>
                      Pré-remplir depuis un read
                    </button>
                  </Show>
                </div>
                <textarea
                  class="h-56 w-full rounded-md border border-border bg-secondary/40 px-3 py-2 font-mono text-[11px] leading-relaxed outline-none focus:border-brand"
                  spellcheck={false}
                  value={objectXml()}
                  onInput={(e) => setObjectXml(e.currentTarget.value)}
                />
                <span class="font-mono text-[10px] text-muted-foreground">
                  Astuce : Read sur un enregistrement existant → copier le XML renvoyé ici →
                  modifier les valeurs.
                </span>
              </div>
            </Show>

            <div class="flex items-center gap-3">
              <Button type="submit" class="gap-1.5" disabled={loading()}>
                <span class="material-symbols-outlined text-[16px]">
                  {op() === 'describe'
                    ? 'description'
                    : op() === 'read'
                      ? 'search'
                      : op() === 'list'
                        ? 'format_list_bulleted'
                        : op() === 'save'
                          ? 'add_circle'
                          : op() === 'modify'
                            ? 'edit'
                            : op() === 'run'
                              ? 'play_arrow'
                              : 'delete'}
                </span>
                {op() === 'describe'
                  ? 'Décrire'
                  : op() === 'read'
                    ? 'Lire'
                    : op() === 'list'
                      ? 'Lister (queryList)'
                      : op() === 'save'
                        ? 'Créer (save)'
                        : op() === 'modify'
                          ? 'Modifier (modify)'
                          : op() === 'run'
                            ? 'Exécuter (run)'
                            : 'Supprimer (delete)'}
              </Button>
              <Show when={loading()}>
                <span class="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                  <span class="material-symbols-outlined animate-spin text-[16px]">
                    progress_activity
                  </span>
                  En cours…
                </span>
              </Show>
            </div>
          </form>

          {/* Erreur réseau */}
          <Show when={fetchErr()}>
            <div class="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              <span class="material-symbols-outlined text-[18px]">error</span>
              {fetchErr()}
            </div>
          </Show>

          {/* Résultat */}
          <Show when={result()}>
            {(r) => (
              <div class="flex flex-col gap-3">
                {/* En-tête verdict */}
                <div class="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary px-4 py-3">
                  <span class="font-mono text-[14px] font-bold text-foreground">
                    {r().publicName}
                  </span>
                  <Badge variant={r().ok ? 'success' : 'destructive'}>
                    {r().ok ? 'OK' : 'ÉCHEC'}
                  </Badge>
                  <span class="font-mono text-[11px] text-muted-foreground">
                    statut X3 : {r().status ?? '—'} · op {r().operation}
                  </span>
                  <Show when={r().error}>
                    <span class="font-mono text-[11px] font-medium text-destructive">
                      {r().error}
                    </span>
                  </Show>
                </div>

                {/* Messages Syracuse */}
                <Show when={r().messages.length > 0}>
                  <div class="flex flex-col gap-1.5 rounded-md border border-border bg-background px-4 py-3">
                    <div class="mb-0.5 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                      MESSAGES X3
                    </div>
                    <For each={r().messages}>
                      {(msg) => (
                        <div
                          class={`rounded px-3 py-1.5 font-mono text-[11px] ${MSG_STYLE[msg.type] ?? MSG_STYLE[3]}`}
                        >
                          <span class="font-bold">[{MSG_LABEL[msg.type] ?? msg.type}]</span>{' '}
                          {msg.text}
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                {/* XML objet renvoyé */}
                <Show when={r().resultXml}>
                  <div class="flex flex-col gap-1.5 rounded-md border border-border bg-background px-4 py-3">
                    <div class="flex items-center justify-between">
                      <span class="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                        resultXml — XML objet renvoyé par X3
                      </span>
                      <button
                        type="button"
                        class="flex items-center gap-1 font-mono text-[11px] text-brand hover:underline"
                        onClick={copyToEditor}
                      >
                        <span class="material-symbols-outlined text-[14px]">download</span>
                        Charger dans l'éditeur (→ save)
                      </button>
                    </div>
                    <pre class="max-h-80 overflow-auto rounded-md bg-secondary/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                      {showFullXml() || r().resultXml.length < 8000
                        ? r().resultXml
                        : r().resultXml.slice(0, 8000) + '\n… [truncated]'}
                    </pre>
                    <Show when={r().resultXml.length >= 8000}>
                      <button
                        type="button"
                        class="mt-1 font-mono text-[11px] text-brand hover:underline"
                        onClick={() => setShowFullXml(!showFullXml())}
                      >
                        {showFullXml()
                          ? '▾ Réduire'
                          : '▸ Afficher le XML complet (' +
                            (r().resultXml.length / 1000).toFixed(0) +
                            ' KB)'}
                      </button>
                    </Show>
                  </div>
                </Show>

                <Show when={!r().resultXml && r().ok}>
                  <div class="rounded-md bg-ferme/10 px-4 py-3 text-[12px] text-ferme">
                    X3 a confirmé l'opération sans renvoyer de XML.
                  </div>
                </Show>
              </div>
            )}
          </Show>

          {/* Debug JSON */}
          <Show when={result()}>
            <div>
              <button
                class="font-mono text-[11px] font-semibold text-brand hover:underline"
                onClick={() => setShowRaw(!showRaw())}
              >
                {showRaw() ? '▾ masquer le JSON brut' : '▸ afficher le JSON brut'}
              </button>
              <Show when={showRaw()}>
                <pre class="mt-2 max-h-72 overflow-auto rounded-md bg-secondary p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {JSON.stringify(result(), null, 2)}
                </pre>
              </Show>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}

export default WritebackTest
