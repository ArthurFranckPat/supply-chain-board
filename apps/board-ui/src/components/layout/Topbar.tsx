import { useMemo } from 'react'
import { Zap, Save, RotateCcw, Printer, HelpCircle } from 'lucide-react'
import { getNavLabel } from './nav'
import type { SchedulerResult } from '@/types/scheduler'

interface TopbarProps {
  activePath: string
  onRunSchedule: () => void
  scheduleResult?: SchedulerResult | null
}

export function Topbar({ activePath, onRunSchedule, scheduleResult }: TopbarProps) {
  const isScheduler = activePath === '/scheduler'
  const label = getNavLabel(activePath) || (activePath === '/settings' ? 'Paramètres' : '')

  const subtitle = useMemo(() => {
    if (!isScheduler || !scheduleResult) return ''
    const allOfs = Object.values(scheduleResult.line_candidates).flat()
    const days = [...new Set(allOfs.map(o => o.scheduled_day).filter(Boolean))].sort()
    if (days.length < 2) return ''
    const start = new Date(days[0]!).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
    const end = new Date(days[days.length - 1]!).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
    return `${start} → ${end}`
  }, [isScheduler, scheduleResult])

  return (
    <header className="h-[38px] shrink-0 border-b border-border bg-card flex items-center justify-between px-3 select-none">
      <div className="flex items-baseline gap-2 min-w-0">
        <h1 className="text-[13px] font-bold text-foreground truncate leading-none">
          {label}
        </h1>
        {subtitle && (
          <span className="text-[10px] text-muted-foreground leading-none">{subtitle}</span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {/* Standard ERP toolbar buttons */}
        <button
          onClick={onRunSchedule}
          disabled={!isScheduler}
          className="inline-flex items-center gap-1 h-[24px] px-2 text-[11px] font-medium border border-border bg-secondary text-secondary-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Zap className="h-3 w-3" />
          <span className="hidden sm:inline">Relancer</span>
        </button>

        <div className="w-px h-4 bg-border mx-1" />

        <button className="inline-flex items-center gap-1 h-[24px] px-2 text-[11px] font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors" title="Enregistrer">
          <Save className="h-3 w-3" />
        </button>
        <button className="inline-flex items-center gap-1 h-[24px] px-2 text-[11px] font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors" title="Annuler">
          <RotateCcw className="h-3 w-3" />
        </button>
        <button className="inline-flex items-center gap-1 h-[24px] px-2 text-[11px] font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors" title="Imprimer">
          <Printer className="h-3 w-3" />
        </button>
        <button className="inline-flex items-center gap-1 h-[24px] px-2 text-[11px] font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors" title="Aide">
          <HelpCircle className="h-3 w-3" />
        </button>
      </div>
    </header>
  )
}
