import { useState } from 'react'
import type { CalendarDay } from '@/types/capacity'
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MonthGridProps {
  year: number
  month: number
  days: CalendarDay[]
  holidaysFetchedAt: string | null
  onMonthChange: (year: number, month: number) => void
  onToggleDay: (date: string, reason: string, remove: boolean) => void
  onRefreshHolidays: () => void
  isRefreshing: boolean
}

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

function dayStatusStyles(status: CalendarDay['status']): string {
  switch (status) {
    case 'workday': return 'bg-green/8 border-green/20 text-foreground'
    case 'holiday': return 'bg-destructive/8 border-destructive/20 text-foreground'
    case 'manual_off': return 'bg-orange/8 border-orange/20 text-foreground'
    case 'weekend': return 'bg-muted border-border text-muted-foreground'
    default: return 'bg-card border-border'
  }
}

function dayStatusDot(status: CalendarDay['status']): string {
  switch (status) {
    case 'workday': return 'bg-green'
    case 'holiday': return 'bg-destructive'
    case 'manual_off': return 'bg-orange'
    default: return 'bg-muted-foreground/30'
  }
}

export function MonthGrid({
  year, month, days, holidaysFetchedAt,
  onMonthChange, onToggleDay, onRefreshHolidays, isRefreshing,
}: MonthGridProps) {
  const [pendingDay, setPendingDay] = useState<CalendarDay | null>(null)
  const [reason, setReason] = useState('')

  function prevMonth() {
    if (month === 1) onMonthChange(year - 1, 12)
    else onMonthChange(year, month - 1)
  }

  function nextMonth() {
    if (month === 12) onMonthChange(year + 1, 1)
    else onMonthChange(year, month + 1)
  }

  // Build 7-column grid with offset for first day
  const firstDay = days[0]
  const offset = firstDay ? (firstDay.weekday) : 0 // 0=Mon, 6=Sun

  const gridDays: (CalendarDay | null)[] = []
  for (let i = 0; i < offset; i++) gridDays.push(null)
  for (const d of days) gridDays.push(d)
  // Pad to fill complete weeks
  while (gridDays.length % 7 !== 0) gridDays.push(null)

  const weeks: (CalendarDay | null)[][] = []
  for (let i = 0; i < gridDays.length; i += 7) {
    weeks.push(gridDays.slice(i, i + 7))
  }

  function handleDayClick(day: CalendarDay) {
    if (day.status === 'weekend' || day.status === 'holiday') return
    if (day.status === 'manual_off') {
      onToggleDay(day.date, '', true)
      return
    }
    // workday -> open reason input
    setPendingDay(day)
    setReason('')
  }

  function confirmManualOff() {
    if (!pendingDay) return
    onToggleDay(pendingDay.date, reason, false)
    setPendingDay(null)
    setReason('')
  }

  const stats = {
    workdays: days.filter(d => d.status === 'workday').length,
    holidays: days.filter(d => d.status === 'holiday').length,
    manualOff: days.filter(d => d.status === 'manual_off').length,
    weekends: days.filter(d => d.status === 'weekend').length,
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-semibold min-w-[160px] text-center">
            {MONTH_NAMES[month - 1]} {year}
          </h3>
          <Button variant="ghost" size="sm" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshHolidays}
            disabled={isRefreshing}
            className="text-xs gap-1.5"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            Jours feries
          </Button>
          {holidaysFetchedAt && (
            <span className="text-[10px] text-muted-foreground">
              MAJ {new Date(holidaysFetchedAt).toLocaleDateString('fr-FR')}
            </span>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-4 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green" />
          {stats.workdays} ouvrés
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-destructive" />
          {stats.holidays} férié{stats.holidays > 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-orange" />
          {stats.manualOff} off
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
          {stats.weekends} week-end
        </span>
      </div>

      {/* Calendar grid */}
      <div className="border border-border rounded-xl overflow-hidden">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 bg-muted/50">
          {WEEKDAYS.map(w => (
            <div key={w} className="py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {w}
            </div>
          ))}
        </div>

        {/* Day cells */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-t border-border">
            {week.map((day, di) => {
              if (!day) {
                return <div key={di} className="min-h-[68px] bg-muted/20" />
              }
              const clickable = day.status === 'workday' || day.status === 'manual_off'
              return (
                <button
                  key={di}
                  onClick={() => handleDayClick(day)}
                  disabled={!clickable}
                  className={`min-h-[68px] p-1.5 text-left border-r border-border last:border-r-0 transition-colors relative
                    ${dayStatusStyles(day.status)}
                    ${clickable ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-[13px] font-medium leading-none">
                      {new Date(day.date).getDate()}
                    </span>
                    <span className={`w-[5px] h-[5px] rounded-full mt-1 ${dayStatusDot(day.status)}`} />
                  </div>
                  {day.holiday && (
                    <p className="text-[9px] text-destructive mt-1 leading-tight font-medium truncate">
                      {day.holiday.name}
                    </p>
                  )}
                  {day.manual_off && day.reason && (
                    <p className="text-[9px] text-orange mt-1 leading-tight font-medium truncate">
                      {day.reason}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {/* Reason input popover */}
      {pendingDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-card border border-border rounded-xl p-4 shadow-lg w-80 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground font-mono uppercase">Marquer jour off</p>
              <p className="text-sm font-semibold mt-0.5">
                {new Date(pendingDay.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            <input
              type="text"
              placeholder="Motif (maintenance, pont...)"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:border-ring"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') confirmManualOff() }}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setPendingDay(null)}>
                Annuler
              </Button>
              <Button size="sm" onClick={confirmManualOff}>
                Confirmer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
