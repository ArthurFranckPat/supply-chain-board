import type { FeasibilityResponse, CapacityImpact, AffectedOrder } from '@/types/feasibility'
import { BOMTree } from './BOMTree'

export function FeasibilityResultDisplay({ result }: { result: FeasibilityResponse }) {
  return (
    <div className="space-y-4">
      <FeasibilityHeader result={result} />
      <AlertList alerts={result.alerts} />
      <RescheduleComparison result={result} />
      {result.bom_tree.length > 0 && (
        <BOMTree nodes={result.bom_tree} depthMode={result.depth_mode} />
      )}
      <CapacityImpacts impacts={result.capacity_impacts} />
      <AffectedOrdersTable orders={result.affected_orders} />
    </div>
  )
}

function FeasibilityHeader({ result }: { result: FeasibilityResponse }) {
  return (
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
  )
}

function AlertList({ alerts }: { alerts: string[] }) {
  if (alerts.length === 0) return null
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
      <p className="text-[11px] font-semibold text-amber-800 mb-1">Alertes</p>
      {alerts.map((alert, i) => (
        <p key={i} className="text-xs text-amber-700">{alert}</p>
      ))}
    </div>
  )
}

function RescheduleComparison({ result }: { result: FeasibilityResponse }) {
  if (!result.original_date) return null
  const qtyDiff = result.original_quantity != null
    ? result.quantity - result.original_quantity
    : 0

  return (
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
        {qtyDiff !== 0 && (
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
            qtyDiff > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green/10 text-green'
          }`}>
            {qtyDiff > 0 ? '+' : ''}{qtyDiff} unites
          </span>
        )}
      </div>
    </div>
  )
}

function CapacityImpacts({ impacts }: { impacts: CapacityImpact[] }) {
  if (impacts.length === 0) return null
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <p className="text-xs font-semibold">Capacite atelier</p>
      </div>
      <div className="divide-y divide-border">
        {impacts.map((impact) => (
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
  )
}

function AffectedOrdersTable({ orders }: { orders: AffectedOrder[] }) {
  if (orders.length === 0) return null
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <p className="text-xs font-semibold">Commandes impactees ({orders.length})</p>
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
          {orders.map((order, i) => (
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
  )
}
