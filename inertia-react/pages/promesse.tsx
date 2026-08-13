/**
 * Page « Promesse » — simulateur Capable-to-Promise : date au plus tôt
 * (optimiste) et date engageante, arbre de chemin critique, pont sessionStorage
 * vers une commande virtuelle sur /programme.
 *
 * Migrée sur le design system cursor (vitrine `/design-system`) :
 * • `theme="cursor"` ; formulaire + résultat, le contenu scrolle — pas de
 *   `dense`, pas de `toolbar` (rien à filtrer), pas de `meta` / compteurs ;
 * • saisie via `Input` / `Label` / `Button` / `Card` ; plus d'`<input>` ni de
 *   `focus:border-primary` artisanaux ;
 * • l'arbre critique reste un arbre (pas une DataTable) ; `Badge` sur le
 *   chemin critique ; dates jj/mm/aaaa explicites ; chiffres `font-mono
 *   tabular-nums` ; plus de `border-rule` / `shadow-sm` / Fraunces.
 */
import { useState, useEffect, useMemo } from 'react'
import {
  Ban,
  Headset,
  Zap,
  TrendingUp,
  ChevronRight,
  TriangleAlert,
  ArrowRight,
} from 'lucide-react'
import { LoadingState } from '@r/components/ui/loading-state'
import { Badge } from '@r/components/ui/badge'
import { Button } from '@r/components/ui/button'
import { Card, CardHeader, CardTitle } from '@r/components/ui/card'
import { Input } from '@r/components/ui/input'
import { Label } from '@r/components/ui/label'
import { DynamicIcon } from '@r/components/ui/dynamic-icon'

import AppLayout from '@r/layouts/app'
import { route } from '@r/lib/routes'
import { cn } from '@r/lib/utils'
import type { PromiseResult, PromiseNode, PromiseReason } from '@r/lib/promesse/types'

/** ISO YYYY-MM-DD (ou Date) → jj/mm/aaaa. Jamais `toLocaleDateString` nu. */
function frDate(d: Date | string): string {
  if (typeof d === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`
    const date = new Date(d)
    if (Number.isNaN(date.getTime())) return '—'
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
  }
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
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
      return r.observed ? `Appro ${r.leadTime}j (+${r.observed}j retard)` : `Appro ${r.leadTime}j`
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
    <li className={depth > 0 ? 'ml-5 border-l border-border pl-3' : ''}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5',
          node.onCriticalPath && 'bg-suggere/10'
        )}
      >
        {node.children.length > 0 && <span className="text-xs text-muted-foreground">▸</span>}
        <DynamicIcon
          name={REASON_ICON[node.reason.kind] ?? 'circle'}
          size={16}
          className="text-muted-foreground"
        />
        <span
          className={cn(
            'font-mono text-[13px] tabular-nums',
            node.onCriticalPath ? 'font-bold text-suggere' : 'text-foreground'
          )}
        >
          {node.article}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          ×{node.quantity}
        </span>
        <span className="text-[11px] text-muted-foreground">{reasonText(node.reason)}</span>
        {node.leadTimeUsed > 0 && (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            +{node.leadTimeUsed}j
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] tabular-nums text-foreground">
          {frDate(node.availableDate)}
        </span>
        {node.onCriticalPath && <Badge variant="warning">Critique</Badge>}
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child: PromiseNode, index: number) => (
            <TreeNode
              key={`${child.article}-${child.availableDate}-${index}`}
              node={child}
              depth={depth + 1}
            />
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
  const tone = {
    green: { surface: 'bg-ferme/10', date: 'text-ferme' },
    amber: { surface: 'bg-suggere/10', date: 'text-suggere' },
  }[color]

  return (
    <Card padding="sm" className={cn('flex-1', tone.surface)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      {!result.infeasible ? (
        <>
          <div className={cn('mt-1 text-2xl font-mono tabular-nums tracking-tight', tone.date)}>
            {frDate(date)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {reasonText(result.limitingFactor.reason)}
          </div>
        </>
      ) : (
        <div className="mt-1 flex items-center gap-1.5 text-lg text-destructive">
          <Ban size={20} strokeWidth={1.75} />
          Infaisable
        </div>
      )}
    </Card>
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
  const [articleOptions, setArticleOptions] = useState<{ code: string; description: string }[]>([])

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
      theme="cursor"
    >
      <div className="mx-auto max-w-3xl">
        <Card padding="default">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Headset size={18} strokeWidth={1.75} className="text-primary" />
              Simulateur de promesse client
            </CardTitle>
          </CardHeader>
          <form onSubmit={submit} className="mt-3" aria-busy={loading}>
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_7.5rem_10.5rem_auto]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promesse-article">Article</Label>
                <Input
                  id="promesse-article"
                  type="text"
                  list="promesse-article-options"
                  value={article}
                  onChange={(e) => setArticle(e.currentTarget.value)}
                  placeholder="PP_830_X"
                  className="font-mono"
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promesse-quantity">Quantité</Label>
                <Input
                  id="promesse-quantity"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.currentTarget.value)}
                  min="1"
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="promesse-from">À partir du</Label>
                <Input
                  id="promesse-from"
                  type="date"
                  value={fromDate || today}
                  onChange={(e) => setFromDate(e.currentTarget.value)}
                  className="font-mono tabular-nums"
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  'Calcul…'
                ) : (
                  <>
                    <Zap />
                    Promettre
                  </>
                )}
              </Button>
            </div>
          </form>
        </Card>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-5 py-2 text-xs text-foreground">
            <TriangleAlert size={16} strokeWidth={1.75} className="shrink-0 text-destructive" />
            <span className="font-semibold">Erreur :</span>
            <span className="truncate font-mono">{error}</span>
          </div>
        )}

        {loading && (
          <LoadingState
            className="mt-4"
            variant="orb"
            orbState="solving"
            title="Calcul de la promesse…"
            description="Explosion de nomenclature · stock · réceptions · délais"
          />
        )}

        {result && !error && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row">
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

            {!result.optimiste.infeasible && !result.engageante.infeasible && (
              <div className="flex items-center gap-2 rounded-lg border border-planifie/30 bg-planifie/10 px-4 py-2.5">
                <TrendingUp size={18} strokeWidth={1.75} className="text-planifie" />
                <span className="text-[13px] text-planifie">
                  Écart de risque :{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {gap} jour{gap > 1 ? 's' : ''}
                  </span>{' '}
                  entre les deux dates — plus l'écart est grand, plus la promesse est risquée.
                </span>
              </div>
            )}

            {!result.engageante.infeasible && (
              <Card padding="sm">
                <div className="text-xs text-muted-foreground">Facteur limitant</div>
                <p className="mt-1 text-sm text-foreground">
                  <span className="font-mono font-bold tabular-nums">
                    {result.engageante.limitingFactor.article}
                  </span>{' '}
                  — {reasonText(result.engageante.limitingFactor.reason)} → dispo le{' '}
                  <span className="font-mono tabular-nums">
                    {frDate(result.engageante.limitingFactor.date)}
                  </span>
                </p>
              </Card>
            )}

            {!result.engageante.infeasible && (
              <Card padding="none">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowTree((v) => !v)}
                  className="h-auto w-full justify-start rounded-none px-4 py-3"
                >
                  <ChevronRight
                    size={18}
                    strokeWidth={1.75}
                    className={cn(
                      'text-muted-foreground transition-transform',
                      showTree && 'rotate-90'
                    )}
                  />
                  <span className="text-[13px] text-foreground">Chemin critique détaillé</span>
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                    {result.engageante.criticalPath.length} maillon
                    {result.engageante.criticalPath.length > 1 ? 's' : ''}
                  </span>
                </Button>
                {showTree && (
                  <div className="border-t border-border px-4 py-3">
                    <ul>
                      <TreeNode node={result.engageante.tree} depth={0} />
                    </ul>
                  </div>
                )}
              </Card>
            )}

            {result.engageante.truncated && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <TriangleAlert size={16} strokeWidth={1.75} />
                Arbre incomplet — profondeur maximale atteinte ou cycle de nomenclature détecté.
              </div>
            )}

            {!result.engageante.infeasible && (
              <Button type="button" variant="outline" className="w-full" onClick={toVirtualCommand}>
                <ArrowRight />
                Transformer en commande virtuelle sur /programme
              </Button>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
