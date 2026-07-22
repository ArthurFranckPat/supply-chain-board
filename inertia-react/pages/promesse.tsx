import { useState, useEffect, useMemo } from 'react'
import AppLayout from '@r/layouts/app'
import { route } from '@/lib/routes'
import { cn } from '@r/lib/utils'
import type { PromiseResult, PromiseNode, PromiseReason } from '@/lib/promesse/types'
import { DynamicIcon } from '../components/ui/dynamic-icon'
import { Ban, Headset, Zap, TrendingUp, ChevronRight, TriangleAlert, ArrowRight } from 'lucide-react'

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

interface TreeNodeProps {
  node: PromiseNode
  depth: number
}

function TreeNode({ node, depth }: TreeNodeProps) {
  return (
    <li className={depth > 0 ? 'ml-5 border-l border-rule-soft pl-3' : ''}>
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 rounded-md px-2',
          node.onCriticalPath && 'bg-suggere/10 ring-1 ring-suggere/20'
        )}
      >
        {node.children.length > 0 && (
          <span className="text-muted-foreground/70 text-xs">▸</span>
        )}
        <DynamicIcon name={REASON_ICON[node.reason.kind] ?? 'circle'} size={16} className="text-muted-foreground" />
        <span
          className={cn(
            'text-[13px] font-mono',
            node.onCriticalPath ? 'font-bold text-suggere' : 'text-foreground/80'
          )}
        >
          {node.article}
        </span>
        <span className="text-[11px] text-muted-foreground">×{node.quantity}</span>
        <span className="text-[11px] text-muted-foreground">{reasonText(node.reason)}</span>
        {node.leadTimeUsed > 0 && (
          <span className="text-[11px] text-muted-foreground">+{node.leadTimeUsed}j</span>
        )}
        <span className="ml-auto text-[11px] font-medium text-foreground/80">
          {frDate(node.availableDate)}
        </span>
        {node.onCriticalPath && (
          <span className="text-[10px] font-bold text-suggere uppercase tracking-wide">
            Critique
          </span>
        )}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child: PromiseNode, index: number) => (
            <TreeNode key={`${child.article}-${child.availableDate}-${index}`} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

interface DateCardProps {
  label: string
  date: string
  color: 'green' | 'amber'
  result: PromiseResult
}

function DateCard({ label, date, color, result }: DateCardProps) {
  const styles = {
    green: 'border-ferme/30 bg-ferme/10',
    amber: 'border-suggere/30 bg-suggere/10',
  }
  const dateColor = { green: 'text-ferme', amber: 'text-suggere' }
  return (
    <div className={cn('flex-1 rounded-lg border p-4', styles[color])}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {!result.infeasible ? (
        <>
          <div className={cn('mt-1 text-2xl font-bold', dateColor[color])}>{frDate(date)}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {reasonText(result.limitingFactor.reason)}
          </div>
        </>
      ) : (
        <div className="mt-1 text-lg font-bold text-destructive">
          <Ban size={20} className="align-middle inline" /> Infaisable
        </div>
      )}
    </div>
  )
}

interface ResultData {
  optimiste: PromiseResult
  engageante: PromiseResult
  article: string
  quantity: number
  from: string
}

export default function Promesse() {
  const today = new Date().toISOString().slice(0, 10)
  const [article, setArticle] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [fromDate, setFromDate] = useState('')
  const [result, setResult] = useState<ResultData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showTree, setShowTree] = useState(false)
  const [articleOptions, setArticleOptions] = useState<
    { code: string; description: string }[]
  >([])

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch(route('promesse.articles'))
        if (res.ok) setArticleOptions(await res.json())
      } catch {
        /* autocomplete best-effort — la saisie libre reste possible */
      }
    }
    fetchOptions()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!article.trim() || !quantity) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const params = new URLSearchParams({
        article: article.trim(),
        quantity,
      })
      if (fromDate) params.set('from', fromDate)
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

  const gap = useMemo(() => {
    if (!result) return 0
    return daysBetween(result.optimiste.promiseDate, result.engageante.promiseDate)
  }, [result])

  const toVirtualCommand = () => {
    if (!result) return
    sessionStorage.setItem(
      'promesse:bridge',
      JSON.stringify({
        article: result.article,
        quantity: result.quantity,
        date: result.engageante.promiseDate,
      })
    )
    window.location.href = route('scheduler.programme')
  }

  return (
    <AppLayout
      title="Promesse"
      active="promesse"
      subtitle="Capable-to-Promise — date au plus tôt"
      theme="airbnb"
    >
          <div className="mx-auto max-w-3xl py-5">
            {/* Formulaire */}
            <form onSubmit={submit} className="rounded-lg border border-rule-soft bg-card p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-bold text-foreground/80">
                <Headset size={18} className="align-middle text-primary" />{' '}
                Simulateur de promesse client
              </h2>
              <div className="grid grid-cols-[1fr_120px_160px_auto] gap-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Article</label>
                  <input
                    type="text"
                    list="promesse-article-options"
                    value={article}
                    onChange={(e) => setArticle(e.currentTarget.value)}
                    placeholder="PP_830_X"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                    autoFocus
                  />
                  <datalist id="promesse-article-options">
                    {articleOptions.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.description}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Quantité</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.currentTarget.value)}
                    min="1"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">À partir du</label>
                  <input
                    type="date"
                    value={fromDate || today}
                    onChange={(e) => setFromDate(e.currentTarget.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {!loading ? (
                      <>
                        <Zap size={18} className="align-middle" />{' '}
                        Promettre
                      </>
                    ) : (
                      'Calcul…'
                    )}
                  </button>
                </div>
              </div>
            </form>

            {/* Erreur */}
            {error && (
              <div className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Résultats */}
            {result && !error && (
              <div className="mt-5 space-y-4">
                {/* Deux dates */}
                <div className="flex gap-4">
                  <DateCard
                    label="Optimiste"
                    date={result.optimiste.promiseDate}
                    color="green"
                    result={result.optimiste}
                  />
                  <DateCard
                    label="Engageante"
                    date={result.engageante.promiseDate}
                    color="amber"
                    result={result.engageante}
                  />
                </div>

                {/* Écart de risque */}
                {!result.optimiste.infeasible && !result.engageante.infeasible && (
                  <div className="flex items-center gap-2 rounded-lg border border-planifie/20 bg-planifie/10 px-4 py-2.5">
                    <TrendingUp size={18} className="text-planifie" />
                    <span className="text-[13px] text-planifie">
                      Écart de risque :{' '}
                      <strong>
                        {gap} jour{gap > 1 ? 's' : ''}
                      </strong>{' '}
                      entre les deux dates — plus l'écart est grand, plus la promesse est risquée.
                    </span>
                  </div>
                )}

                {/* Facteur limitant */}
                {!result.engageante.infeasible && (
                  <div className="rounded-lg border border-rule-soft bg-card px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Facteur limitant
                    </div>
                    <p className="mt-1 text-sm text-foreground/80">
                      <span className="font-mono font-bold">
                        {result.engageante.limitingFactor.article}
                      </span>{' '}
                      — {reasonText(result.engageante.limitingFactor.reason)} → dispo le{' '}
                      <strong>{frDate(result.engageante.limitingFactor.date)}</strong>
                    </p>
                  </div>
                )}

                {/* Chemin critique dépliable */}
                {!result.engageante.infeasible && (
                  <div className="rounded-lg border border-rule-soft bg-card">
                    <button
                      type="button"
                      onClick={() => setShowTree((v) => !v)}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left"
                    >
                      <ChevronRight
                        size={18}
                        className={cn(
                          'text-muted-foreground transition-transform',
                          showTree && 'rotate-90'
                        )}
                      />
                      <span className="text-[13px] font-semibold text-foreground/80">
                        Chemin critique détaillé
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        {result.engageante.criticalPath.length} maillon
                        {result.engageante.criticalPath.length > 1 ? 's' : ''}
                      </span>
                    </button>
                    {showTree && (
                      <div className="border-t border-rule-soft px-4 py-3">
                        <ul>
                          <TreeNode node={result.engageante.tree} depth={0} />
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Tronqué ? */}
                {result.engageante.truncated && (
                  <div className="flex items-center gap-2 text-[12px] text-destructive">
                    <TriangleAlert size={16} />
                    Arbre incomplet — profondeur maximale atteinte ou cycle de nomenclature détecté.
                  </div>
                )}

                {/* Pont vers commande virtuelle (PRD §6.2 / lot 5) */}
                {!result.engageante.infeasible && (
                  <button
                    type="button"
                    onClick={toVirtualCommand}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
                  >
                    <ArrowRight size={18} />
                    Transformer en commande virtuelle sur /programme
                  </button>
                )}
              </div>
            )}
          </div>
    </AppLayout>
  )
}
