import { Zap } from 'lucide-react'
import { NAV_ITEMS } from './nav'
import type { SchedulerResult } from '@/types/scheduler'

interface TopbarProps {
  activePath: string
  onRunSchedule: () => void
  scheduleResult?: SchedulerResult | null
}

export function Topbar({ activePath, onRunSchedule, scheduleResult }: TopbarProps) {
  const activeItem = NAV_ITEMS.find((n) => n.path === activePath)
  const isScheduler = activePath === '/scheduler'

  // Derive topbar subtitle
  const topbarSubtitle = isScheduler && scheduleResult
    ? (() => {
        const allOfs = Object.values(scheduleResult.line_candidates).flat()
        const days = [...new Set(allOfs.map(o => o.scheduled_day).filter(Boolean))].sort()
        if (days.length < 2) return ''
        const start = new Date(days[0]!).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
        const end = new Date(days[days.length - 1]!).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
        return `${start} → ${end}`
      })()
    : ''

  return (
    <header className="h-[54px] shrink-0 border-b border-border bg-card flex items-center justify-between px-[22px]">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[15.5px] font-semibold tracking-tight">
          {activeItem?.label ?? (activePath === '/settings' ? 'Paramètres' : '')}
        </h2>
        {topbarSubtitle && (
          <span className="text-[11.5px] text-muted-foreground">{topbarSubtitle}</span>
        )}
      </div>
      <div className="flex items-center gap-2.5 text-[11.5px] text-muted-foreground">
        {isScheduler && (
          <button
            onClick={onRunSchedule}
            className="bg-primary text-white border-none px-3 py-[7px] rounded-[7px] text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
          >
            <Zap className="h-3 w-3" />
            Relancer
          </button>
        )}
      </div>
    </header>
  )
}
