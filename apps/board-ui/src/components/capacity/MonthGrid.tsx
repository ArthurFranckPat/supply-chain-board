import { useState } from 'react'
import type { CalendarDay } from '@/types/capacity'

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
const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function dayBg(status: CalendarDay['status']): string {
  switch (status) {
    case 'workday': return 'bg-green/5 border-green/20'
    case 'holiday': return 'bg-destructive/5 border-destructive/20'
    case 'manual_off': return 'bg-orange/5 border-orange/20'
    case 'weekend': return 'bg-muted border-border'
    default: return 'bg-card border-border'
  }
}

export function MonthGrid({ year, month, days, holidaysFetchedAt, onMonthChange, onToggleDay, onRefreshHolidays, isRefreshing }: MonthGridProps) {
  const [pendingDay, setPendingDay] = useState<CalendarDay | null>(null)
  const [reason, setReason] = useState('')

  const stats = {
    workdays: days.filter(d => d.status === 'workday').length,
    holidays: days.filter(d => d.status === 'holiday').length,
    manualOff: days.filter(d => d.status === 'manual_off').length,
    weekends: days.filter(d => d.status === 'weekend').length,
  }

  const firstDay = days[0]
  const offset = firstDay ? firstDay.weekday : 0
  const gridDays: (CalendarDay | null)[] = []
  for (let i = 0; i < offset; i++) gridDays.push(null)
  for (const d of days) gridDays.push(d)
  while (gridDays.length % 7 !== 0) gridDays.push(null)

  const weeks: (CalendarDay | null)[][] = []
  for (let i = 0; i < gridDays.length; i += 7) weeks.push(gridDays.slice(i, i + 7))

  function handleDayClick(day: CalendarDay) {
    if (day.status === 'weekend' || day.status === 'holiday') return
    if (day.status === 'manual_off') { onToggleDay(day.date, '', true); return }
    setPendingDay(day); setReason('')
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => onMonthChange(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)} className="h-6 px-2 text-[11px] border border-border hover:bg-muted">←</button>
          <h3 className="text-[12px] font-semibold min-w-[120px] text-center">{MONTH_NAMES[month - 1]} {year}</h3>
          <button onClick={() => onMonthChange(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)} className="h-6 px-2 text-[11px] border border-border hover:bg-muted">→</button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onRefreshHolidays} disabled={isRefreshing} className="h-6 px-2 text-[11px] border border-border hover:bg-muted disabled:opacity-50">{isRefreshing ? '...' : 'Fériés'}</button>
          {holidaysFetchedAt && <span className="text-[9px] text-muted-foreground">MAJ {new Date(holidaysFetchedAt).toLocaleDateString('fr-FR')}</span>}
        </div>
      </div>

      <div className="flex gap-3 text-[10px]">
        <span className="text-green font-semibold">{stats.workdays} ouvrés</span>
        <span className="text-destructive font-semibold">{stats.holidays} fériés</span>
        <span className="text-orange font-semibold">{stats.manualOff} off</span>
        <span className="text-muted-foreground">{stats.weekends} WE</span>
      </div>

      <div className="border border-border">
        <div className="grid grid-cols-7 bg-muted">
          {WEEKDAYS.map(w => <div key={w} className="py-1 text-center text-[10px] font-semibold text-muted-foreground uppercase">{w}</div>)}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-t border-border">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="min-h-[44px] bg-muted/30" />
              const clickable = day.status === 'workday' || day.status === 'manual_off'
              return (
                <button key={di} onClick={() => handleDayClick(day)} disabled={!clickable}
                  className={`min-h-[44px] p-1 text-left border-r border-border last:border-r-0 ${dayBg(day.status)} ${clickable ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}>
                  <span className="text-[12px] font-medium">{new Date(day.date).getDate()}</span>
                  {day.holiday && <p className="text-[8px] text-destructive mt-0.5 truncate">{day.holiday.name}</p>}
                  {day.manual_off && day.reason && <p className="text-[8px] text-orange mt-0.5 truncate">{day.reason}</p>}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      {pendingDay && (
        <div className="bg-card border border-border p-2">
          <p className="text-[11px] font-semibold mb-1">Congé {new Date(pendingDay.date).toLocaleDateString('fr-FR')}</p>
          <div className="flex gap-2">
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motif..." className="flex-1 h-7 px-2 text-[12px] border border-border bg-card outline-none" />
            <button onClick={() => { onToggleDay(pendingDay.date, reason, false); setPendingDay(null); setReason(''); }} className="h-7 px-3 bg-primary text-primary-foreground text-[11px] font-semibold">Valider</button>
            <button onClick={() => setPendingDay(null)} className="h-7 px-2 border border-border text-[11px]">Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}
