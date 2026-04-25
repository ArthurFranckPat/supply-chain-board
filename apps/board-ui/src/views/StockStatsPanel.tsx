import type { StockEvolutionResponse } from '@/types/stock-evolution'

interface Props {
  stats: Pick<StockEvolutionResponse, 'stock_physique' | 'stock_sous_cq' | 'valeur_stock' | 'pmp' | 'stock_min' | 'stock_max' | 'stock_moyen' | 'rotation' | 'tendance' | 'nombre_mouvements'>
}

function TendanceBadge({ valeur }: { valeur: string }) {
  const tone = valeur === 'croissante' ? 'text-green' : valeur === 'décroissante' ? 'text-destructive' : 'text-muted-foreground'
  return <span className={`text-[10px] font-semibold ${tone}`}>{valeur}</span>
}

export function StockStatsPanel({ stats }: Props) {
  const items = [
    { label: 'Stock', value: stats.stock_physique.toLocaleString('fr-FR', { maximumFractionDigits: 1 }), sub: `Q: ${stats.stock_sous_cq.toFixed(1)}` },
    { label: 'Valeur', value: stats.valeur_stock.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }), sub: `PMP: ${stats.pmp.toFixed(2)}€` },
    { label: 'Min', value: stats.stock_min.toLocaleString('fr-FR', { maximumFractionDigits: 1 }), sub: 'Période' },
    { label: 'Max', value: stats.stock_max.toLocaleString('fr-FR', { maximumFractionDigits: 1 }), sub: 'Période' },
    { label: 'Moy.', value: stats.stock_moyen.toLocaleString('fr-FR', { maximumFractionDigits: 1 }), sub: `${stats.nombre_mouvements} mvts` },
    { label: 'Rotation', value: stats.rotation.toFixed(2), sub: <TendanceBadge valeur={stats.tendance} /> },
  ]

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-1">
      {items.map((item) => (
        <div key={item.label} className="bg-card border border-border p-2">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{item.label}</p>
          <p className="text-[14px] font-bold tabular-nums">{item.value}</p>
          <p className="text-[10px] text-muted-foreground">{item.sub}</p>
        </div>
      ))}
    </div>
  )
}
