import type { StockEvolutionResponse } from '@/types/stock-evolution'
import { TrendingUp, TrendingDown, Minus, Package, Activity, ArrowLeftRight } from 'lucide-react'

interface Props {
  stats: Pick<StockEvolutionResponse, 'stock_actuel' | 'stock_min' | 'stock_max' | 'stock_moyen' | 'rotation' | 'tendance' | 'nombre_mouvements' | 'periode_debut' | 'periode_fin'>
}

function TendanceBadge({ valeur }: { valeur: string }) {
  if (valeur === 'croissante') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-green/10 text-green text-xs font-semibold">
        <TrendingUp className="h-3 w-3" /> Croissante
      </span>
    )
  }
  if (valeur === 'décroissante') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-destructive/10 text-destructive text-xs font-semibold">
        <TrendingDown className="h-3 w-3" /> Décroissante
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-muted-foreground text-xs font-semibold">
      <Minus className="h-3 w-3" /> Stable
    </span>
  )
}

export function StockStatsPanel({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <StatCard
        icon={<Package className="h-4 w-4 text-green" />}
        label="Stock actuel"
        value={stats.stock_actuel.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
        sub="Stock physique"
      />
      <StatCard
        icon={<Package className="h-4 w-4 text-blue" />}
        label="Stock min"
        value={stats.stock_min.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
        sub="Sur la période"
      />
      <StatCard
        icon={<Package className="h-4 w-4 text-orange" />}
        label="Stock max"
        value={stats.stock_max.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
        sub="Sur la période"
      />
      <StatCard
        icon={<Activity className="h-4 w-4 text-purple" />}
        label="Stock moyen"
        value={stats.stock_moyen.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
        sub={`${stats.nombre_mouvements} mouvements`}
      />
      <StatCard
        icon={<ArrowLeftRight className="h-4 w-4 text-foreground" />}
        label="Rotation"
        value={stats.rotation.toFixed(2)}
        sub={`Tendance: `}
        badge={<TendanceBadge valeur={stats.tendance} />}
      />
    </div>
  )
}

function StatCard({ icon, label, value, sub, badge }: { icon: React.ReactNode; label: string; value: string; sub: string; badge?: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[10px] text-muted-foreground">{sub}</span>
        {badge}
      </div>
    </div>
  )
}
