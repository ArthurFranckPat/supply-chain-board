import { memo, useState, Fragment } from 'react'
import type { PoolContrib } from '@/types/analyse-rupture'

interface PoolTreeProps { repartition: PoolContrib[] }

export const PoolTree = memo(function PoolTree({ repartition }: PoolTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const byParent = new Map<string, PoolContrib[]>()
  const roots: PoolContrib[] = []
  for (const p of repartition) {
    if (!p.parent_article) roots.push(p)
    else { const s = byParent.get(p.parent_article) ?? []; s.push(p); byParent.set(p.parent_article, s) }
  }
  function toggle(article: string) { setCollapsed(p => { const n = new Set(p); n.has(article) ? n.delete(article) : n.add(article); return n }) }
  const totalPool = repartition.reduce((s, p) => s + p.contribution, 0)

  const catBorder: Record<string, string> = { COMPOSANT: 'border-border text-muted-foreground', SF: 'border-primary/30 text-primary', PF: 'border-green/30 text-green' }

  function renderNode(node: PoolContrib, depth: number) {
    const children = byParent.get(node.article) ?? []
    const hasChildren = children.length > 0
    const isCollapsed = collapsed.has(node.article)
    const contribPct = totalPool > 0 ? (node.contribution / totalPool) * 100 : 0

    return (
      <Fragment key={node.article}>
        <div className="flex items-center gap-2 py-1 px-2 hover:bg-muted/30 cursor-pointer border-b border-border/30"
          style={{ paddingLeft: `${8 + depth * 16}px` }}
          onClick={() => hasChildren && toggle(node.article)}>
          <span className="text-[10px] text-muted-foreground w-3">{hasChildren ? (isCollapsed ? '+' : '-') : ''}</span>
          <span className="font-mono font-semibold text-[11px]">{node.article}</span>
          <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{node.description}</span>
          <span className={`text-[9px] font-semibold px-1 py-0 border ${catBorder[node.categorie] ?? 'border-border text-muted-foreground'}`}>{node.categorie}</span>
          <span className="ml-auto flex items-center gap-2 shrink-0">
            <div className="w-16 h-[2px] bg-border"><div className="h-full bg-muted-foreground" style={{ width: `${Math.min(100, contribPct)}%` }} /></div>
            <span className="text-[10px] font-mono font-bold tabular-nums w-8 text-right">{Math.round(node.contribution)}</span>
          </span>
        </div>
        {hasChildren && !isCollapsed && children.map(c => renderNode(c, depth + 1))}
      </Fragment>
    )
  }

  return (
    <div className="bg-card border border-border px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold">Pool ({repartition.length})</span>
        <span className="text-[11px] font-mono font-bold tabular-nums">Total {Math.round(totalPool)}</span>
      </div>
      <div>{roots.map(r => renderNode(r, 0))}</div>
    </div>
  )
})
