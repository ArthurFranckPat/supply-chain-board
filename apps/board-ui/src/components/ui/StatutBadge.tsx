import type { StatutLot } from '@/types/lot-eco'

const STATUT_MAP: Record<StatutLot, { label: string; detailLabel: string; bg: string; text: string; dot: string }> = {
  OK: { label: 'OK', detailLabel: 'OK — Adéquation correcte', bg: 'bg-green/10', text: 'text-green-700', dot: 'bg-green-500' },
  SURDIMENSIONNE: { label: 'Surdim.', detailLabel: 'Surdimensionné — Lot supérieur au besoin', bg: 'bg-destructive/10', text: 'text-destructive', dot: 'bg-destructive' },
  SOUSDIMENSIONNE: { label: 'Sous-dim.', detailLabel: 'Sous-dimensionné — Lot inférieur au besoin', bg: 'bg-orange/10', text: 'text-orange-700', dot: 'bg-orange-500' },
  DEMANDE_NULLE: { label: 'Nulle', detailLabel: 'Demande nulle — Pas de consommation', bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground' },
}

interface StatutBadgeProps {
  statut: StatutLot
  size?: 'sm' | 'md'
  variant?: 'compact' | 'detail'
}

export function StatutBadge({ statut, size = 'sm', variant = 'compact' }: StatutBadgeProps) {
  const { label, detailLabel, bg, text, dot } = STATUT_MAP[statut]
  const displayLabel = variant === 'detail' ? detailLabel : label
  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-[10px] gap-1' : 'px-2 py-1 text-[11px] gap-1.5'
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2'
  return (
    <span className={`inline-flex items-center font-semibold border ${bg} ${text} ${sizeClasses}`}>
      <span className={`${dot} ${dotSize}`} />
      {displayLabel}
    </span>
  )
}
