import { useState, Fragment } from 'react'
import type { BOMNode } from '@/types/feasibility'

function countShortages(nodes: BOMNode[]): number {
  let count = 0
  for (const n of nodes) { if (n.status === 'shortage') count++; count += countShortages(n.children) }
  return count
}

function hasShortage(node: BOMNode): boolean {
  if (node.status === 'shortage') return true
  return node.children.some(hasShortage)
}

function renderNode(node: BOMNode, depth: number, collapsed: Set<string>, toggle: (a: string) => void, filterShortages: boolean) {
  if (filterShortages && !hasShortage(node)) return null
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.article)

  return (
    <Fragment key={`${depth}-${node.article}`}>
      <div className="flex items-center gap-2 py-1 px-2 hover:bg-muted/30 cursor-pointer border-b border-border/30"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => hasChildren && toggle(node.article)}>
        <span className="text-[10px] text-muted-foreground w-3">{hasChildren ? (isCollapsed ? '+' : '-') : ''}</span>
        <span className="w-1.5 h-1.5 shrink-0" style={{ background: node.status === 'ok' ? 'var(--color-green)' : node.status === 'shortage' ? 'var(--color-destructive)' : 'var(--color-muted-foreground)' }} />
        <span className="font-mono font-semibold text-[11px] min-w-[80px]">{node.article}</span>
        <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">{node.description}</span>
        <span className={`px-1 py-0 text-[9px] font-semibold border ${node.is_purchase ? 'border-primary/30 text-primary' : 'border-muted-foreground/30 text-muted-foreground'}`}>{node.is_purchase ? 'ACH' : 'FAB'}</span>
        <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground shrink-0 tabular-nums">
          <span>x{node.quantity_per_unit}</span>
          <span className="text-foreground font-medium">{Math.round(node.quantity_needed)}</span>
          <span>{node.stock_available.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>
          <span className={`font-semibold min-w-[36px] text-right ${node.stock_gap > 0 ? 'text-destructive' : 'text-green'}`}>
            {node.stock_gap > 0 ? `-${node.stock_gap.toFixed(0)}` : 'OK'}
          </span>
        </span>
      </div>
      {hasChildren && !isCollapsed && node.children.map(c => renderNode(c, depth + 1, collapsed, toggle, filterShortages))}
    </Fragment>
  )
}

interface BOMTreeProps { nodes: BOMNode[]; depthMode?: string }

export function BOMTree({ nodes, depthMode: _depthMode }: BOMTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [filterShortages, setFilterShortages] = useState(false)
  function toggle(article: string) { setCollapsed(p => { const n = new Set(p); n.has(article) ? n.delete(article) : n.add(article); return n }) }
  const shortages = countShortages(nodes)

  return (
    <div className="bg-card border border-border">
      <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
        <p className="text-[11px] font-semibold">Nomenclature ({nodes.length}){shortages > 0 && <span className="text-destructive ml-1">({shortages} rupture{shortages > 1 ? 's' : ''})</span>}</p>
        <button onClick={() => setFilterShortages(!filterShortages)} className={`h-5 px-1.5 text-[10px] font-semibold border ${filterShortages ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-card text-muted-foreground border-border'}`}>
          {filterShortages ? 'Ruptures' : 'Tous'}
        </button>
      </div>
      <div>{nodes.map(n => renderNode(n, 0, collapsed, toggle, filterShortages))}</div>
    </div>
  )
}
