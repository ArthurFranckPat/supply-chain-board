import { createSignal, Show, type Component } from 'solid-js'
import { Masthead } from '@/components/masthead'
import { route } from '@/lib/routes'
import type { PromiseResult, PromiseNode, PromiseReason } from '@/lib/promesse/types'

function frDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('fr-FR')
}

function daysBetween(a: Date | string, b: Date | string): number {
  const da = typeof a === 'string' ? new Date(a) : a
  const db = typeof b === 'string' ? new Date(b) : b
  return Math.round((db.getTime() - da.getTime()) / 86_400_000)
}

const REASON_ICON: Record<string, string> = {
  stock: 'inventory_2',
  reception: 'local_shipping',
  of: 'precision_manufacturing',
  appro: 'shopping_cart',
  fabrication: 'build_circle',
  infeasible: 'error',
}

function reasonText(r: PromiseReason): string {
  switch (r.kind) {
    case 'stock':
      return 'Stock disponible'
    case 'reception':
      return `Réception ${r.poId}`
    case 'of':
      return `OF ${r.ofId}`
    case 'appro':
      return r.observed
        ? `Appro ${r.leadTime}j (+${r.observed}j retard)`
        : `Appro ${r.leadTime}j`
    case 'fabrication':
      return r.leadTime > 0 ? `Fabrication ${r.leadTime}j` : 'Fantôme (assemblage logique)'
    case 'infeasible':
      return r.detail
  }
  return '—'
}

const TreeNode = (props: { node: PromiseNode; depth: number }) => {
  return (
    <li class={props.depth > 0 ? 'ml-5 border-l border-gray-200 pl-3' : ''}>
      <div
        class={`flex items-center gap-2 py-1.5 rounded-md px-2 ${
          props.node.onCriticalPath ? 'bg-amber-50 ring-1 ring-amber-200' : ''
        }`}
      >
        <Show when={props.node.children.length > 0}>
          <span class="text-gray-300 text-xs">▸</span>
        </Show>
        <span class="material-symbols-outlined text-[16px] text-gray-400">
          {REASON_ICON[props.node.reason.kind] ?? 'circle'}
        </span>
        <span class={`text-[13px] font-mono ${props.node.onCriticalPath ? 'font-bold text-amber-900' : 'text-gray-700'}`}>
          {props.node.article}
        </span>
        <span class="text-[11px] text-gray-400">×{props.node.quantity}</span>
        <span class="text-[11px] text-gray-500">{reasonText(props.node.reason)}</span>
        <Show when={props.node.leadTimeUsed > 0}>
          <span class="text-[11px] text-gray-400">+{props.node.leadTimeUsed}j</span>
        </Show>
        <span class="ml-auto text-[11px] font-medium text-gray-600">{frDate(props.node.availableDate)}</span>
        <Show when={props.node.onCriticalPath}>
          <span class="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Critique</span>
        </Show>
      </div>
      <Show when={props.node.children.length > 0}>
        <ul>
          {props.node.children.map((child: PromiseNode) => (
            <TreeNode node={child} depth={props.depth + 1} />
          ))}
        </ul>
      </Show>
    </li>
  )
}

const DateCard = (props: {
  label: string
  date: string
  color: 'green' | 'amber'
  result: PromiseResult
}) => {
  const styles = {
    green: 'border-green-300 bg-green-50',
    amber: 'border-amber-300 bg-amber-50',
  }
  const dateColor = { green: 'text-green-700', amber: 'text-amber-700' }
  return (
    <div class={`flex-1 rounded-xl border p-4 ${styles[props.color]}`}>
      <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{props.label}</div>
      <Show
        when={!props.result.infeasible}
        fallback={
          <div class="mt-1 text-lg font-bold text-red-600">
            <span class="material-symbols-outlined align-middle text-[20px]">block</span> Infaisable
          </div>
        }
      >
        <div class={`mt-1 text-2xl font-bold ${dateColor[props.color]}`}>{frDate(props.date)}</div>
        <div class="mt-1 text-[12px] text-gray-500">
          {reasonText(props.result.limitingFactor.reason)}
        </div>
      </Show>
    </div>
  )
}

const Promesse: Component = () => {
  const today = new Date().toISOString().slice(0, 10)
  const [article, setArticle] = createSignal('')
  const [quantity, setQuantity] = createSignal('1')
  const [fromDate, setFromDate] = createSignal('')
  const [result, setResult] = createSignal<null | {
    optimiste: PromiseResult
    engageante: PromiseResult
    article: string
    quantity: number
    from: string
  }>(null)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal('')
  const [showTree, setShowTree] = createSignal(false)

  const submit = async (e: Event) => {
    e.preventDefault()
    if (!article().trim() || !quantity()) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const params = new URLSearchParams({
        article: article().trim(),
        quantity: quantity(),
      })
      if (fromDate()) params.set('from', fromDate())
      const res = await fetch(`${route('promesse.index')}?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Erreur serveur')
      setResult(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const gap = () =>
    result() ? daysBetween(result()!.optimiste.promiseDate, result()!.engageante.promiseDate) : 0

  return (
    <>
      <Masthead active="promesse" subtitle="Capable-to-Promise — date au plus tôt" />
      <main class="ml-12 pt-12 min-h-screen bg-gray-50">
        <div class="mx-auto max-w-3xl px-6 py-8">
          {/* Formulaire */}
          <form onSubmit={submit} class="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 class="mb-4 text-sm font-bold text-gray-700">
              <span class="material-symbols-outlined align-middle text-[18px] text-primary">
                support_agent
              </span>{' '}
              Simulateur de promesse client
            </h2>
            <div class="grid grid-cols-[1fr_120px_160px_auto] gap-3">
              <div>
                <label class="mb-1 block text-[11px] font-medium text-gray-500">Article</label>
                <input
                  type="text"
                  value={article()}
                  onInput={(e) => setArticle(e.currentTarget.value)}
                  placeholder="PP_830_X"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  autofocus
                />
              </div>
              <div>
                <label class="mb-1 block text-[11px] font-medium text-gray-500">Quantité</label>
                <input
                  type="number"
                  value={quantity()}
                  onInput={(e) => setQuantity(e.currentTarget.value)}
                  min="1"
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div>
                <label class="mb-1 block text-[11px] font-medium text-gray-500">À partir du</label>
                <input
                  type="date"
                  value={fromDate() || today}
                  onInput={(e) => setFromDate(e.currentTarget.value)}
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                />
              </div>
              <div class="flex items-end">
                <button
                  type="submit"
                  disabled={loading()}
                  class="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Show when={!loading()} fallback="Calcul…">
                    <span class="material-symbols-outlined align-middle text-[18px]">bolt</span>{' '}
                    Promettre
                  </Show>
                </button>
              </div>
            </div>
          </form>

          {/* Erreur */}
          <Show when={error()}>
            <div class="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error()}
            </div>
          </Show>

          {/* Résultats */}
          <Show when={result() && !error()}>
            <div class="mt-5 space-y-4">
              {/* Deux dates */}
              <div class="flex gap-4">
                <DateCard
                  label="Optimiste"
                  date={result()!.optimiste.promiseDate}
                  color="green"
                  result={result()!.optimiste}
                />
                <DateCard
                  label="Engageante"
                  date={result()!.engageante.promiseDate}
                  color="amber"
                  result={result()!.engageante}
                />
              </div>

              {/* Écart de risque */}
              <Show when={!result()!.optimiste.infeasible && !result()!.engageante.infeasible}>
                <div class="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
                  <span class="material-symbols-outlined text-[18px] text-blue-500">trending_up</span>
                  <span class="text-[13px] text-blue-800">
                    Écart de risque :{' '}
                    <strong>
                      {gap()} jour{gap() > 1 ? 's' : ''}
                    </strong>{' '}
                    entre les deux dates — plus l'écart est grand, plus la promesse est risquée.
                  </span>
                </div>
              </Show>

              {/* Facteur limitant */}
              <Show when={!result()!.engageante.infeasible}>
                <div class="rounded-lg border border-gray-200 bg-white px-4 py-3">
                  <div class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Facteur limitant
                  </div>
                  <p class="mt-1 text-sm text-gray-700">
                    <span class="font-mono font-bold">
                      {result()!.engageante.limitingFactor.article}
                    </span>{' '}
                    — {reasonText(result()!.engageante.limitingFactor.reason)} → dispo le{' '}
                    <strong>{frDate(result()!.engageante.limitingFactor.date)}</strong>
                  </p>
                </div>
              </Show>

              {/* Chemin critique dépliable */}
              <Show when={!result()!.engageante.infeasible}>
                <div class="rounded-lg border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowTree(!showTree())}
                    class="flex w-full items-center gap-2 px-4 py-3 text-left"
                  >
                    <span
                      class="material-symbols-outlined text-[18px] text-gray-400 transition-transform"
                      classList={{ 'rotate-90': showTree() }}
                    >
                      chevron_right
                    </span>
                    <span class="text-[13px] font-semibold text-gray-700">
                      Chemin critique détaillé
                    </span>
                    <span class="ml-auto text-[11px] text-gray-400">
                      {result()!.engageante.criticalPath.length} maillon
                      {result()!.engageante.criticalPath.length > 1 ? 's' : ''}
                    </span>
                  </button>
                  <Show when={showTree()}>
                    <div class="border-t border-gray-100 px-4 py-3">
                      <ul>
                        <TreeNode node={result()!.engageante.tree} depth={0} />
                      </ul>
                    </div>
                  </Show>
                </div>
              </Show>

              {/* Tronqué ? */}
              <Show when={result()!.engageante.truncated}>
                <div class="flex items-center gap-2 text-[12px] text-orange-600">
                  <span class="material-symbols-outlined text-[16px]">warning</span>
                  Arbre incomplet — profondeur maximale atteinte ou cycle de nomenclature détecté.
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </main>
    </>
  )
}

export default Promesse
