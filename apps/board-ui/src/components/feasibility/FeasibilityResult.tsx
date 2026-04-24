import { useState, Fragment } from 'react'
import type { FeasibilityResponse, CapacityImpact, AffectedOrder, BOMNode } from '@/types/feasibility'
import { ChevronDown, ChevronRight } from 'lucide-react'

export function FeasibilityResultDisplay({ result }: { result: FeasibilityResponse }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground font-mono uppercase">{result.article}</p>
            <p className="text-sm font-semibold">{result.description}</p>
            <p className="text-xs text-muted-foreground mt-1">{result.quantity} unites</p>
          </div>
          <div className="text-right">
            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${
              result.feasible ? 'bg-green/10 text-green' : 'bg-destructive/10 text-destructive'
            }`}>
              <span className={`w-2 h-2 rounded-full ${result.feasible ? 'bg-green' : 'bg-destructive'}`} />
              {result.feasible ? 'Faisable' : 'Non faisable'}
            </span>
            {result.feasible_date && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Date feasible: <strong>{new Date(result.feasible_date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                {result.desired_date && result.feasible_date !== result.desired_date && (
                  <span className="text-orange ml-1"> (au lieu du {new Date(result.desired_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })})</span>
                )}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">{result.computation_ms}ms</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {result.alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-[11px] font-semibold text-amber-800 mb-1">Alertes</p>
          {result.alerts.map((alert, i) => (
            <p key={i} className="text-xs text-amber-700">{alert}</p>
          ))}
        </div>
      )}

      {/* Reschedule context: original vs new */}
      {result.original_date && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-6 text-xs">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-0.5">Original</p>
              <p className="font-semibold">
                {new Date(result.original_date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                {result.original_quantity != null && <span className="text-muted-foreground font-normal ml-2">x{result.original_quantity}</span>}
              </p>
            </div>
            <span className="text-muted-foreground text-lg">&rarr;</span>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-0.5">Simulation</p>
              <p className="font-semibold">
                {result.desired_date
                  ? new Date(result.desired_date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
                  : '-'}
                <span className="text-muted-foreground font-normal ml-2">x{result.quantity}</span>
              </p>
            </div>
            {result.original_quantity != null && result.quantity !== result.original_quantity && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                result.quantity > result.original_quantity ? 'bg-amber-100 text-amber-800' : 'bg-green/10 text-green'
              }`}>
                {result.quantity > result.original_quantity ? '+' : ''}{result.quantity - result.original_quantity} unites
              </span>
            )}
          </div>
        </div>
      )}

      {/* BOM Tree - complete nomenclature view */}
      {result.bom_tree.length > 0 && (
        <BOMTree nodes={result.bom_tree} depthMode={result.depth_mode} />
      )}

      {/* Capacity impacts */}
      {result.capacity_impacts.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-xs font-semibold">Capacite atelier</p>
          </div>
          <div className="divide-y divide-border">
            {result.capacity_impacts.map((impact: CapacityImpact) => (
              <div key={impact.poste_charge} className="px-5 py-3 flex items-center gap-4">
                <div className="min-w-[160px]">
                  <p className="text-xs font-medium">{impact.poste_label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{impact.poste_charge}</p>
                </div>
                <div className="flex-1">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${impact.utilization_pct > 100 ? 'bg-destructive' : impact.utilization_pct > 80 ? 'bg-amber-500' : 'bg-green'}`}
                      style={{ width: `${Math.min(impact.utilization_pct, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right min-w-[120px]">
                  <p className="text-xs">{impact.hours_required}h / {impact.hours_available}h</p>
                  <p className={`text-[10px] font-semibold ${impact.utilization_pct > 100 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {impact.utilization_pct}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Affected orders (reschedule only) */}
      {result.affected_orders.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-xs font-semibold">Commandes impactees ({result.affected_orders.length})</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-5 py-2 font-medium text-muted-foreground">Commande</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Article</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qte</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Date originale</th>
                <th className="text-right px-5 py-2 font-medium text-muted-foreground">Impact</th>
              </tr>
            </thead>
            <tbody>
              {result.affected_orders.map((order: AffectedOrder, i: number) => (
                <tr key={`${order.num_commande}-${i}`} className="border-t border-border">
                  <td className="px-5 py-2 font-mono">{order.num_commande}</td>
                  <td className="px-3 py-2">{order.client}</td>
                  <td className="px-3 py-2 font-mono">{order.article}</td>
                  <td className="px-3 py-2 text-right">{order.quantity}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{order.original_date}</td>
                  <td className="px-5 py-2 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      order.impact === 'delayed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                    }`}>
                      {order.impact}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Collapsible BOM tree with stock status per component. */
function BOMTree({ nodes, depthMode }: { nodes: BOMNode[]; depthMode: string; useReceptions?: boolean }) {
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

  function renderNode(node: BOMNode, depth: number) {
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

        {hasChildren && !isCollapsed && node.children.map((child) => renderNode(child, depth + 1))}
      </Fragment>
    )
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
        {nodes.map((n) => renderNode(n, 0))}
      </div>
    </div>
  )
}
