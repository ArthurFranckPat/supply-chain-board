import type { OrderRow } from '@/types/suivi-commandes'

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} M€`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} K€`
  return `${value.toFixed(0)} €`
}

export function OrderKpiBar({ rows, statusCounts }: { rows: OrderRow[]; statusCounts: Record<string, number> }) {
  const commandes = new Set(rows.map((r) => r['No commande'])).size
  const retardProd = statusCounts['Retard Prod'] ?? 0
  const caRestant = rows.reduce(
    (s, r) => s + ((r['Prix brut'] ?? 0) * (r['Quantité restante'] ?? 0)),
    0,
  )

  const kpis = [
    { label: 'Commandes', value: commandes },
    { label: 'Lignes', value: rows.length },
    { label: 'Retard', value: retardProd, danger: retardProd > 0 },
    { label: 'CA restant', value: formatCurrency(caRestant) },
  ]

  return (
    <div className="flex items-stretch gap-1">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className="flex-1 bg-card border border-border px-3 py-2"
        >
          <p className={`text-[14px] font-bold leading-none ${kpi.danger ? 'text-destructive' : ''}`}>
            {kpi.value}
          </p>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide font-semibold mt-1">
            {kpi.label}
          </p>
        </div>
      ))}
    </div>
  )
}
