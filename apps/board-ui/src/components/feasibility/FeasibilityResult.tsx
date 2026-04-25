import type { FeasibilityResponse, CapacityImpact, AffectedOrder } from '@/types/feasibility'
import { BOMTree } from './BOMTree'
import { GridTable, type GridTableColumn } from '@/components/ui/GridTable'
import { cn } from '@/lib/utils'

export function FeasibilityResultDisplay({ result }: { result: FeasibilityResponse }) {
  return (
    <div className="space-y-2">
      <FeasibilityHeader result={result} />
      <AlertList alerts={result.alerts} />
      <RescheduleComparison result={result} />
      {result.bom_tree.length > 0 && <BOMTree nodes={result.bom_tree} depthMode={result.depth_mode} />}
      <CapacityImpacts impacts={result.capacity_impacts} />
      <AffectedOrdersTable orders={result.affected_orders} />
    </div>
  )
}

function FeasibilityHeader({ result }: { result: FeasibilityResponse }) {
  return (
    <div className="bg-card border border-border p-2 flex items-center justify-between">
      <div>
        <p className="text-[10px] text-muted-foreground font-mono uppercase">{result.article}</p>
        <p className="text-xs font-semibold">{result.description}</p>
        <p className="text-[10px] text-muted-foreground">{result.quantity} unités</p>
      </div>
      <div className="text-right">
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold border',
          result.feasible ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-red-300 text-red-700 bg-red-50'
        )}>
          {result.feasible ? 'Faisable' : 'Non faisable'}
        </span>
        {result.feasible_date && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Date: <strong>{new Date(result.feasible_date).toLocaleDateString('fr-FR')}</strong>
            {result.desired_date && result.feasible_date !== result.desired_date && (
              <span className="text-amber-600 ml-1">(au lieu du {new Date(result.desired_date).toLocaleDateString('fr-FR')})</span>
            )}
          </p>
        )}
        <p className="text-[9px] text-muted-foreground">{result.computation_ms}ms</p>
      </div>
    </div>
  )
}

function AlertList({ alerts }: { alerts: string[] }) {
  if (alerts.length === 0) return null
  return (
    <div className="bg-amber-50 border border-amber-200 px-3 py-2">
      <p className="text-[10px] font-semibold text-amber-700 mb-0.5">Alertes</p>
      {alerts.map((alert, i) => <p key={i} className="text-[11px] text-amber-700/80">{alert}</p>)}
    </div>
  )
}

function RescheduleComparison({ result }: { result: FeasibilityResponse }) {
  if (!result.original_date) return null
  const qtyDiff = result.original_quantity != null ? result.quantity - result.original_quantity : 0
  return (
    <div className="bg-card border border-border p-2 flex items-center gap-3 text-xs">
      <div>
        <p className="text-[9px] text-muted-foreground uppercase font-semibold">Original</p>
        <p className="font-semibold">{new Date(result.original_date).toLocaleDateString('fr-FR')}{result.original_quantity != null && <span className="text-muted-foreground font-normal ml-1">x{result.original_quantity}</span>}</p>
      </div>
      <span>→</span>
      <div>
        <p className="text-[9px] text-muted-foreground uppercase font-semibold">Simulation</p>
        <p className="font-semibold">{result.desired_date ? new Date(result.desired_date).toLocaleDateString('fr-FR') : '-'}<span className="text-muted-foreground font-normal ml-1">x{result.quantity}</span></p>
      </div>
      {qtyDiff !== 0 && (
        <span className={cn('px-1.5 py-0.5 text-[10px] font-semibold border',
          qtyDiff > 0 ? 'border-amber-300 text-amber-700 bg-amber-50' : 'border-emerald-300 text-emerald-700 bg-emerald-50'
        )}>
          {qtyDiff > 0 ? '+' : ''}{qtyDiff}
        </span>
      )}
    </div>
  )
}

function CapacityImpacts({ impacts }: { impacts: CapacityImpact[] }) {
  if (impacts.length === 0) return null
  return (
    <div className="bg-card border border-border overflow-hidden">
      <div className="px-3 py-1.5 border-b border-border"><p className="text-[11px] font-semibold">Capacité atelier</p></div>
      {impacts.map((impact) => (
        <div key={impact.poste_charge} className="px-3 py-1.5 flex items-center gap-2 border-b border-border/40 last:border-b-0">
          <div className="min-w-[140px]">
            <p className="text-[11px] font-medium">{impact.poste_label}</p>
            <p className="text-[9px] text-muted-foreground font-mono">{impact.poste_charge}</p>
          </div>
          <div className="flex-1">
            <div className="h-[3px] bg-border">
              <div className={cn('h-full transition-all', impact.utilization_pct > 100 ? 'bg-red-500' : 'bg-primary')} style={{ width: `${Math.min(impact.utilization_pct, 100)}%` }} />
            </div>
          </div>
          <div className="text-right min-w-[100px]">
            <p className="text-[11px]">{impact.hours_required}h / {impact.hours_available}h</p>
            <p className={cn('text-[10px] font-semibold', impact.utilization_pct > 100 ? 'text-red-600' : 'text-muted-foreground')}>{impact.utilization_pct}%</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function AffectedOrdersTable({ orders }: { orders: AffectedOrder[] }) {
  if (orders.length === 0) return null
  const columns: GridTableColumn<AffectedOrder>[] = [
    { key: 'num_commande', header: 'Commande', width: '110px', cell: (o) => <span className="font-mono font-semibold">{o.num_commande}</span> },
    { key: 'client', header: 'Client', width: '1fr', cell: (o) => o.client },
    { key: 'article', header: 'Article', width: '100px', cell: (o) => <span className="font-mono">{o.article}</span> },
    { key: 'quantity', header: 'Qté', align: 'right', width: '60px', cell: (o) => <span className="tabular-nums font-mono">{o.quantity}</span> },
    { key: 'original_date', header: 'Date', align: 'right', width: '90px', cell: (o) => <span className="text-muted-foreground">{o.original_date}</span> },
    { key: 'impact', header: 'Impact', align: 'center', width: '70px', cell: (o) => (
      <span className={cn('inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium border',
        o.impact === 'delayed' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-secondary text-secondary-foreground'
      )}>
        {o.impact}
      </span>
    ) },
  ]
  return <GridTable columns={columns} data={orders} keyExtractor={(o) => `${o.num_commande}-${o.article}`} maxHeight="300px" emptyMessage="Aucune commande impactée." />
}
