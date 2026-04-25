import { memo } from 'react'
import { Pill } from '@/components/ui/pill'
import { OfRow } from '@/components/scheduling/OfRow'
import type { CandidateOF } from '@/types/scheduler'
import { formatDateLabel } from '@/lib/format'

interface DayCardProps {
  day: string
  rows: CandidateOF[]
  isOpen: boolean
  density: 'compact' | 'comfort'
  onToggle: (day: string) => void
}

export const DayCard = memo(function DayCard({ day, rows, isOpen, density, onToggle }: DayCardProps) {
  if (rows.length === 0) return null

  const totalCharge = rows.reduce((s, o) => s + o.charge_hours, 0)
  const nbBlocked = rows.filter(o => o.blocking_components).length
  const nbRealizable = rows.length - nbBlocked
  const pctRealizable = rows.length > 0 ? Math.round((nbRealizable / rows.length) * 100) : 100

  return (
    <div>
      <button
        onClick={() => onToggle(day)}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left border-b border-border cursor-pointer font-[inherit] border-none ${
          isOpen ? 'bg-muted/60' : 'bg-muted/30'
        }`}
      >
        <span className="text-[11px] font-semibold">{isOpen ? '▼' : '▶'}</span>
        <span className="text-[11px] font-semibold">{formatDateLabel(day)}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{rows.length} OF</span>
        <span className="text-[10px] text-muted-foreground font-mono">{totalCharge.toFixed(1)}h</span>
        {pctRealizable < 100 && (
          <Pill tone={pctRealizable < 90 ? 'warn' : 'good'}>{pctRealizable}%</Pill>
        )}
        {nbBlocked > 0 && (
          <Pill tone="danger">{nbBlocked} bloqués</Pill>
        )}
      </button>
      {isOpen && rows.slice(0, 80).map((of, idx) => (
        <OfRow key={of.num_of} of={of} density={density} index={idx} />
      ))}
      {isOpen && rows.length > 80 && (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground text-center border-b border-border/40 bg-muted/20">
          +{rows.length - 80} OF
        </div>
      )}
    </div>
  )
})
