import { AlertTriangle, CheckCircle2, Minus, TrendingDown } from 'lucide-react'
import type { StatutLot } from '@/types/lot-eco'

const STATUT_MAP: Record<StatutLot, { icon: React.ReactNode; label: string; detailLabel: string; bg: string; text: string; dot: string }> = {
  OK: { icon: <CheckCircle2 className="h-3 w-3" />, label: 'OK', detailLabel: 'OK — Adéquation correcte', bg: 'bg-green-50', text: 'text-green-800', dot: 'bg-green-500' },
  SURDIMENSIONNE: { icon: <AlertTriangle className="h-3 w-3" />, label: 'Surdimensionné', detailLabel: 'Surdimensionné — Lot supérieur au besoin', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  SOUSDIMENSIONNE: { icon: <TrendingDown className="h-3 w-3" />, label: 'Sous-dim.', detailLabel: 'Sous-dimensionné — Lot inférieur au besoin', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  DEMANDE_NULLE: { icon: <Minus className="h-3 w-3" />, label: 'Demande nulle', detailLabel: 'Demande nulle — Pas de consommation', bg: 'bg-stone-100', text: 'text-stone-500', dot: 'bg-stone-400' },
}

interface StatutBadgeProps {
  statut: StatutLot
  size?: 'sm' | 'md'
  variant?: 'compact' | 'detail'
}

export function StatutBadge({ statut, size = 'sm', variant = 'compact' }: StatutBadgeProps) {
  const { icon, label, detailLabel, bg, text, dot } = STATUT_MAP[statut]
  const displayLabel = variant === 'detail' ? detailLabel : label
  const sizeClasses = size === 'sm'
    ? 'px-2.5 py-1 text-[10.5px] gap-1.5'
    : 'px-3 py-1.5 text-[11.5px] gap-2'
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${bg} ${text} ${sizeClasses}`}>
      <span className={`rounded-full ${dot} ${dotSize}`} />
      {icon}
      {displayLabel}
    </span>
  )
}
