import { createSignal, createResource, Show, For, type Component } from 'solid-js'
import { Masthead } from '@/components/masthead'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { route } from '@/lib/routes'

/**
 * Page de TEST provisoire (issue #25) pour valider le diagnostic récursif sur un
 * vrai OF avant intégration au design final. Pas de rattachement nav durable —
 * on y accède par /diagnostic-test.
 */

type NodeStatus =
  'ok' | 'qc_a_controler' | 'rupture_matiere' | 'sous_ensemble_a_lancer' | 'indetermine'
type NodeSource = 'MFGMAT' | 'NOMENCLATURE'

interface DiagnosticNode {
  numOf: string
  article: string
  description: string
  statut: number
  quantityNeeded: number
  source: NodeSource
  feasible: boolean
  status: NodeStatus
  shorts: ShortComponentNode[]
  alerts: string[]
}
interface CoveringOf {
  numOf: string
  statut: number
  quantity: number
  node: DiagnosticNode
}
interface ShortComponentNode {
  article: string
  description: string
  quantityNeeded: number
  available: number | null
  stockQc?: number
  quantityMissing: number
  earliestReception: string | null
  fabricated: boolean
  covering: CoveringOf[]
  status: NodeStatus
}
interface DiagnosticResult {
  numOf: string
  article: string
  feasible: boolean
  rootCause: NodeStatus
  tree: DiagnosticNode
  componentsChecked: number
  maxDepthReached: number
  alerts: string[]
  _debug?: unknown
}

const STATUS_LABEL: Record<NodeStatus, string> = {
  ok: 'OK',
  qc_a_controler: 'Contrôle qualité',
  rupture_matiere: 'Rupture matière',
  sous_ensemble_a_lancer: 'Sous-ensemble à lancer',
  indetermine: 'Indéterminé',
}
const STATUS_VARIANT: Record<NodeStatus, 'success' | 'destructive' | 'warning' | 'secondary'> = {
  ok: 'success',
  qc_a_controler: 'warning',
  rupture_matiere: 'destructive',
  sous_ensemble_a_lancer: 'warning',
  indetermine: 'secondary',
}
const STATUT_OF: Record<number, string> = { 1: 'ferme/lancé', 2: 'planifié', 3: 'suggéré' }

function StatusBadge(props: { status: NodeStatus }) {
  return <Badge variant={STATUS_VARIANT[props.status]}>{STATUS_LABEL[props.status]}</Badge>
}

/** Affiche un composant en manque + (récursivement) les OF couvrants et leurs composants. */
const ShortRow: Component<{ short: ShortComponentNode; depth: number }> = (props) => {
  return (
    <div class="border-l-2 border-border/60 pl-3" style={{ 'margin-left': `${props.depth * 4}px` }}>
      <div class="flex flex-wrap items-center gap-2 py-1">
        <StatusBadge status={props.short.status} />
        <span class="font-mono text-[12px] font-bold text-foreground">{props.short.article}</span>
        <Show when={props.short.description}>
          <span class="text-[11px] text-muted-foreground">{props.short.description}</span>
        </Show>
        <span class="font-mono text-[11px] text-muted-foreground">
          besoin {props.short.quantityNeeded} · dispo {props.short.available ?? '?'}
          <Show when={props.short.stockQc}>
            {' '}
            · <span class="text-warning font-semibold">CQ {props.short.stockQc}</span>
          </Show>{' '}
          · manque <span class="font-bold text-destructive">{props.short.quantityMissing}</span>
        </span>
        <Show when={props.short.earliestReception}>
          <span class="font-mono text-[11px] text-brand">
            récep. {props.short.earliestReception}
          </span>
        </Show>
        <Show when={props.short.fabricated}>
          <Badge variant="secondary" class="text-[9px]">
            fabriqué
          </Badge>
        </Show>
      </div>
      <Show when={props.short.status === 'qc_a_controler'}>
        <div class="ml-1 flex items-center gap-1.5 py-0.5 font-mono text-[11px] text-warning">
          <span class="material-symbols-outlined text-[13px]">verified</span>
          Action : lever le contrôle qualité ({props.short.stockQc} en CQ — couvre le besoin)
        </div>
      </Show>

      {/* OF/suggestions couvrants */}
      <For each={props.short.covering}>
        {(cov) => (
          <div class="mt-1 rounded-md bg-secondary/50 px-3 py-2">
            <div class="flex flex-wrap items-center gap-2">
              <span class="material-symbols-outlined text-[14px] text-muted-foreground">
                subdirectory_arrow_right
              </span>
              <span class="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                COUVERT PAR
              </span>
              <span class="font-mono text-[12px] font-bold text-foreground">{cov.numOf}</span>
              <Badge
                variant={cov.statut === 1 ? 'success' : cov.statut === 2 ? 'secondary' : 'warning'}
                class="text-[9px]"
              >
                {STATUT_OF[cov.statut] ?? `statut ${cov.statut}`}
              </Badge>
              <span class="font-mono text-[11px] text-muted-foreground">qté {cov.quantity}</span>
              <StatusBadge status={cov.node.status} />
              <Badge
                variant={cov.node.source === 'MFGMAT' ? 'success' : 'secondary'}
                class="text-[9px]"
              >
                {cov.node.source === 'MFGMAT' ? 'réel' : 'théorique'}
              </Badge>
            </div>
            {/* Composants du sous-ensemble couvrant */}
            <Show
              when={cov.node.shorts.length > 0}
              fallback={
                <div class="mt-1 pl-6 text-[11px] text-ferme">✓ tous composants disponibles</div>
              }
            >
              <div class="mt-1.5 flex flex-col gap-1">
                <For each={cov.node.shorts}>
                  {(s) => <ShortRow short={s} depth={props.depth + 1} />}
                </For>
              </div>
            </Show>
          </div>
        )}
      </For>
    </div>
  )
}

const DiagnosticTest: Component = () => {
  const [input, setInput] = createSignal('F426-34030')
  const [req, setReq] = createSignal<{ of: string; n: number } | null>(null)
  const [showRaw, setShowRaw] = createSignal(false)

  const [diag] = createResource(req, async (r) => {
    const res = await fetch(route('planning_board.of_materials_diagnostic', { of: r.of }))
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}${txt ? ` — ${txt}` : ''}`)
    }
    return (await res.json()) as DiagnosticResult
  })

  const run = (e: Event) => {
    e.preventDefault()
    const v = input().trim()
    if (v) setReq({ of: v, n: Date.now() })
  }

  return (
    <div class="theme-navy flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <Masthead subtitle="Diagnostic récursif · page de test (#25)" active="ordonnancement" />
      <div class="flex-1 overflow-auto px-7 py-6">
        <div class="mx-auto flex max-w-4xl flex-col gap-5">
          <form class="flex items-end gap-3" onSubmit={run}>
            <label class="flex flex-col gap-1">
              <span class="font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                OF
              </span>
              <input
                class="w-72 rounded-md border border-border bg-background px-3 py-2 font-mono text-[13px] outline-none focus:border-brand"
                placeholder="ex. F426-34030"
                value={input()}
                onInput={(e) => setInput(e.currentTarget.value)}
              />
            </label>
            <Button type="submit" class="gap-1.5">
              <span class="material-symbols-outlined text-[16px]">search</span>
              Examiner
            </Button>
          </form>

          <Show when={diag.loading}>
            <div class="flex items-center gap-2 rounded-md bg-secondary px-4 py-3 text-[13px] text-muted-foreground">
              <span class="material-symbols-outlined animate-spin text-[18px]">
                progress_activity
              </span>
              Diagnostic en cours…
            </div>
          </Show>
          <Show when={diag.error}>
            <div class="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              <span class="material-symbols-outlined text-[18px]">error</span>
              {(diag.error as Error).message}
            </div>
          </Show>

          <Show when={diag()}>
            {(d) => (
              <div class="flex flex-col gap-4">
                {/* En-tête verdict */}
                <div class="flex flex-wrap items-center gap-3 rounded-md border border-border bg-secondary px-4 py-3">
                  <span class="font-mono text-[14px] font-bold text-foreground">{d().numOf}</span>
                  <Show when={d().tree.description}>
                    <span class="text-[12px] text-muted-foreground">{d().tree.description}</span>
                  </Show>
                  <StatusBadge status={d().rootCause} />
                  <Badge
                    variant={
                      d().feasible
                        ? 'success'
                        : d().rootCause === 'qc_a_controler'
                          ? 'warning'
                          : 'destructive'
                    }
                  >
                    {d().feasible
                      ? 'Faisable'
                      : d().rootCause === 'qc_a_controler'
                        ? 'Faisable sous réserve CQ'
                        : 'Bloqué'}
                  </Badge>
                  <span class="ml-auto flex items-center gap-4 font-mono text-[11px] text-muted-foreground">
                    <span>composants : {d().componentsChecked}</span>
                    <span>profondeur : {d().maxDepthReached}</span>
                  </span>
                </div>

                {/* Arbre : composants en manque de l'OF de tête */}
                <Show
                  when={d().tree.shorts.length > 0}
                  fallback={
                    <div class="flex items-center gap-2 rounded-md bg-ferme/10 px-4 py-3 text-[13px] font-medium text-ferme">
                      <span class="material-symbols-outlined text-[18px]">check_circle</span>
                      Aucun manque — tous les composants sont disponibles.
                    </div>
                  }
                >
                  <div class="flex flex-col gap-2 rounded-md border border-border bg-background px-4 py-3">
                    <For each={d().tree.shorts}>{(s) => <ShortRow short={s} depth={0} />}</For>
                  </div>
                </Show>

                {/* Alertes */}
                <Show when={d().alerts.length > 0}>
                  <div class="rounded-md bg-secondary px-4 py-3">
                    <div class="mb-1.5 font-mono text-[10px] font-semibold tracking-wider text-muted-foreground">
                      ALERTES
                    </div>
                    <ul class="flex flex-col gap-1 font-mono text-[11px] text-muted-foreground">
                      <For each={d().alerts}>{(a) => <li>• {a}</li>}</For>
                    </ul>
                  </div>
                </Show>

                {/* JSON brut */}
                <div>
                  <button
                    class="font-mono text-[11px] font-semibold text-brand hover:underline"
                    onClick={() => setShowRaw(!showRaw())}
                  >
                    {showRaw() ? '▾ masquer le JSON brut' : '▸ afficher le JSON brut'}
                  </button>
                  <Show when={showRaw()}>
                    <pre class="mt-2 max-h-96 overflow-auto rounded-md bg-secondary p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                      {JSON.stringify(d(), null, 2)}
                    </pre>
                  </Show>
                </div>
              </div>
            )}
          </Show>
        </div>
      </div>
    </div>
  )
}

export default DiagnosticTest
