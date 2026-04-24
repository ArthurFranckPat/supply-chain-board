import { memo } from 'react'
import { CalendarDays, ChevronDown, ChevronRight, AlertOctagon } from 'lucide-react'
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
        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 border-none cursor-pointer font-[inherit] text-left border-b border-border ${
          isOpen ? 'bg-primary/5' : 'bg-accent/30'
        }`}
      >
        {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <CalendarDays className={`h-[13px] w-[13px] ${isOpen ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className="text-[12.5px] font-semibold">{formatDateLabel(day)}</span>
        <Pill mono>{rows.length} OF</Pill>
        <Pill mono>{totalCharge.toFixed(1)}h engagées</Pill>
        {pctRealizable < 100 && (
          <Pill tone={pctRealizable < 90 ? 'warn' : 'good'} mono>{pctRealizable}% réalisable</Pill>
        )}
        {nbBlocked > 0 && (
          <Pill tone="danger" icon={<AlertOctagon className="h-2.5 w-2.5" />} mono>{nbBlocked} bloqués</Pill>
        )}
      </button>
      {isOpen && rows.slice(0, 80).map((of, idx) => (
        <OfRow key={of.num_of} of={of} density={density} index={idx} />
      ))}
      {isOpen && rows.length > 80 && (
        <div className="px-3.5 py-2.5 text-[11px] text-muted-foreground text-center border-b border-border/50 bg-accent/30">
          +{rows.length - 80} OF supplémentaires
        </div>
      )}
    </div>
  )
})
