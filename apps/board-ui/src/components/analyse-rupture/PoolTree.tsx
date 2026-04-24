import { useState, Fragment } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { PoolContrib } from '@/types/analyse-rupture'

interface PoolTreeProps {
  repartition: PoolContrib[]
}

/** Pool breakdown as a collapsible tree: Composant → SF → PF */
export function PoolTree({ repartition }: PoolTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Build adjacency: parent_article → children
  const byParent = new Map<string, PoolContrib[]>()
  const roots: PoolContrib[] = []
  for (const p of repartition) {
    if (!p.parent_article) {
      roots.push(p)
    } else {
      const siblings = byParent.get(p.parent_article) ?? []
      siblings.push(p)
      byParent.set(p.parent_article, siblings)
    }
  }

  function toggle(article: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(article)) next.delete(article)
      else next.add(article)
      return next
    })
  }

  const totalPool = repartition.reduce((s, p) => s + p.contribution, 0)

  const catColor: Record<string, string> = {
    COMPOSANT: 'bg-muted text-muted-foreground',
    SF: 'bg-primary/10 text-primary',
    PF: 'bg-green-500/10 text-green-700',
  }

  function renderNode(node: PoolContrib, depth: number) {
    const children = byParent.get(node.article) ?? []
    const hasChildren = children.length > 0
    const isCollapsed = collapsed.has(node.article)
    const contribPct = totalPool > 0 ? (node.contribution / totalPool) * 100 : 0

    return (
      <Fragment key={node.article}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/40 cursor-pointer group"
          style={{ paddingLeft: `${12 + depth * 20}px` }}
          onClick={() => hasChildren && toggle(node.article)}
        >
          {/* Expand/collapse icon */}
          {hasChildren ? (
            isCollapsed
              ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          <span className="font-mono font-semibold text-[12px]">{node.article}</span>
          <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">{node.description}</span>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${catColor[node.categorie] ?? 'bg-muted text-muted-foreground'}`}>
            {node.categorie}
          </span>

          {/* Contribution bar + number */}
          <span className="ml-auto flex items-center gap-2 shrink-0">
            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-foreground/30 group-hover:bg-foreground/50 transition-colors"
                style={{ width: `${Math.min(100, contribPct)}%` }}
              />
            </div>
            <span className="text-[11px] font-mono font-bold tabular-nums w-10 text-right">{Math.round(node.contribution)}</span>
          </span>
        </div>

        {/* Children */}
        {hasChildren && !isCollapsed && children.map((child) => renderNode(child, depth + 1))}
      </Fragment>
    )
  }

  return (
    <div className="bg-card border border-border rounded-2xl px-[18px] py-[14px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
          Pool ({repartition.length} articles)
        </span>
        <span className="text-[11px] font-mono font-bold tabular-nums">
          Total {Math.round(totalPool)}
        </span>
      </div>
      <div className="space-y-0.5">
        {roots.map((r) => renderNode(r, 0))}
      </div>
    </div>
  )
}
