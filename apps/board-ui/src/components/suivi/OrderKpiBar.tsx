import type { OrderRow } from '@/types/suivi-commandes'
import { Package, ShoppingCart, TrendingDown, CheckCircle2, AlertTriangle, Euro } from 'lucide-react'

interface OrderKpiBarProps {
  rows: OrderRow[]
  statusCounts: Record<string, number>
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} M\u20ac`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} K\u20ac`
  return `${value.toFixed(0)} \u20ac`
}

export function OrderKpiBar({ rows, statusCounts }: OrderKpiBarProps) {
  const commandes = new Set(rows.map((r) => r['No commande'])).size
  const qteRestante = rows.reduce((s, r) => s + (r['Quantit\u00e9 restante'] ?? 0), 0)
  const qteLivre = rows.reduce((s, r) => s + (r['Quantit\u00e9 livr\u00e9e'] ?? 0), 0)
  const retardProd = statusCounts['Retard Prod'] ?? 0
  const caRestant = rows.reduce(
    (s, r) => s + ((r['Prix brut'] ?? 0) * (r['Quantit\u00e9 restante'] ?? 0)),
    0,
  )

  const kpis = [
    { icon: <ShoppingCart className="h-3.5 w-3.5" />, label: 'Commandes', value: commandes },
    { icon: <Package className="h-3.5 w-3.5" />, label: 'Lignes', value: rows.length },
    { icon: <TrendingDown className="h-3.5 w-3.5" />, label: 'Restant', value: qteRestante.toLocaleString('fr-FR') },
    { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: 'Livré', value: qteLivre.toLocaleString('fr-FR') },
    { icon: <AlertTriangle className="h-3.5 w-3.5 text-destructive" />, label: 'Retard', value: retardProd, tone: retardProd > 0 ? 'danger' : 'good' },
    { icon: <Euro className="h-3.5 w-3.5" />, label: 'CA restant', value: formatCurrency(caRestant) },
  ]

  return (
    <div className="flex items-stretch gap-2">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="flex-1 bg-card border border-border rounded-2xl px-3 py-2.5 flex items-center gap-2.5"
        >
          <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
            kpi.tone === 'danger' ? 'bg-destructive/10 text-destructive'
              : kpi.tone === 'good' ? 'bg-green/10 text-green'
              : 'bg-primary/10 text-primary'
          }`}>
            {kpi.icon}
          </div>
          <div>
            <p className="text-[15px] font-bold leading-tight tracking-tight">{kpi.value}</p>
            <p className="text-[9.5px] text-muted-foreground uppercase tracking-wider font-semibold mt-0.5">{kpi.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
