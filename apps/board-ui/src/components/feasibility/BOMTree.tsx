import { useState, Fragment } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { BOMNode } from '@/types/feasibility'

function countShortages(nodes: BOMNode[]): number {
  let count = 0
  for (const n of nodes) {
    if (n.status === 'shortage') count++
    if (n.children.length > 0) count += countShortages(n.children)
  }
  return count
}

function hasShortage(node: BOMNode): boolean {
  if (node.status === 'shortage') return true
  return node.children.some(hasShortage)
}

function renderNode(
  node: BOMNode,
  depth: number,
  collapsed: Set<string>,
  toggle: (article: string) => void,
  filterShortages: boolean
) {
  if (filterShortages && !hasShortage(node)) return null

  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.article)

  return (
    <Fragment key={`${depth}-${node.article}`}>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/40 cursor-pointer"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onClick={() => hasChildren && toggle(node.article)}
      >
        {hasChildren ? (
          isCollapsed
            ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}

        <span className={`w-2 h-2 rounded-full shrink-0 ${
          node.status === 'ok' ? 'bg-green' :
          node.status === 'shortage' ? 'bg-destructive' :
          'bg-muted-foreground/40'
        }`} />

        <span className="font-mono font-semibold text-[12px] min-w-[90px]">{node.article}</span>
        <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">{node.description}</span>

        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
          node.is_purchase ? 'bg-blue/10 text-blue' : 'bg-purple/10 text-purple'
        }`}>
          {node.is_purchase ? 'ACH' : 'FAB'}
        </span>

        <span className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground shrink-0 tabular-nums">
          <span title="Quantite par unite">x{node.quantity_per_unit}</span>
          <span className="text-foreground font-medium" title="Besoin total">{Math.round(node.quantity_needed)}</span>
          <span title="Stock disponible">{node.stock_available.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>
          <span className={`font-semibold min-w-[40px] text-right ${
            node.stock_gap > 0 ? 'text-destructive' : 'text-green'
          }`}>
            {node.stock_gap > 0 ? `-${node.stock_gap.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}` : 'OK'}
          </span>
        </span>
      </div>

      {hasChildren && !isCollapsed && node.children.map((child) =>
        renderNode(child, depth + 1, collapsed, toggle, filterShortages)
      )}
    </Fragment>
  )
}

interface BOMTreeProps {
  nodes: BOMNode[]
  depthMode: string
}

export function BOMTree({ nodes, depthMode }: BOMTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [filterShortages, setFilterShortages] = useState(false)

  function toggle(article: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(article)) next.delete(article)
      else next.add(article)
      return next
    })
  }

  const shortages = countShortages(nodes)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <p className="text-xs font-semibold">
          Nomenclature ({nodes.length} composants{depthMode === 'full' ? ', recursive' : ', niveau 1'})
          {shortages > 0 && <span className="text-destructive ml-2">({shortages} rupture{shortages > 1 ? 's' : ''})</span>}
        </p>
        <button
          onClick={() => setFilterShortages(!filterShortages)}
          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-colors ${
            filterShortages ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          {filterShortages ? 'Ruptures uniquement' : 'Tous les composants'}
        </button>
      </div>
      <div className="px-3 py-2 space-y-0.5">
        {nodes.map((n) => renderNode(n, 0, collapsed, toggle, filterShortages))}
      </div>
    </div>
  )
}
