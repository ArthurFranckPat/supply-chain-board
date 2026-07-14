import React, { useState, useMemo } from 'react'
import { cn } from '@/libs/cn'

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]
const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const DAY_MS = 86_400_000

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (t.getUTCDay() + 6) % 7 // lun = 0
  t.setUTCDate(t.getUTCDate() - dayNum + 3) // jeudi de cette semaine
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  return (
    1 +
    Math.round(
      ((t.getTime() - firstThursday.getTime()) / DAY_MS -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    )
  )
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export type DateRange = { start: Date | null; end: Date | null }

export type CalendarProps = {
  mode?: 'single' | 'range'
  value?: Date | null
  onValueChange?: (date: Date) => void
  range?: DateRange | null
  onRangeChange?: (range: DateRange) => void
  min?: Date
  max?: Date
  className?: string
}

export function Calendar({
  mode = 'single',
  value,
  onValueChange,
  range,
  onRangeChange,
  min,
  max,
  className,
}: CalendarProps) {
  const today = startOfDay(new Date())
  const initial = mode === 'range' ? (range?.start ?? today) : (value ?? today)

  const [view, setView] = useState({
    y: initial.getFullYear(),
    m: initial.getMonth(),
  })
  const [anchor, setAnchor] = useState<Date | null>(null)
  const [hover, setHover] = useState<Date | null>(null)

  const weeks = useMemo(() => {
    const { y, m } = view
    const first = new Date(y, m, 1)
    const offset = (first.getDay() + 6) % 7
    const start = new Date(y, m, 1 - offset)
    const rows: { week: number; days: Date[] }[] = []
    for (let r = 0; r < 6; r++) {
      const days: Date[] = []
      for (let c = 0; c < 7; c++) {
        days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + r * 7 + c))
      }
      rows.push({ week: isoWeek(days[0]), days })
    }
    return rows
  }, [view])

  const shift = (delta: number) => {
    const { y, m } = view
    const d = new Date(y, m + delta, 1)
    setView({ y: d.getFullYear(), m: d.getMonth() })
  }

  const goToday = () => {
    setView({ y: today.getFullYear(), m: today.getMonth() })
    if (mode !== 'range') onValueChange?.(today)
  }

  const isDisabled = (d: Date) =>
    (min != null && d < startOfDay(min)) || (max != null && d > max)

  const effRange = useMemo<DateRange>(() => {
    if (mode !== 'range') return { start: null, end: null }
    if (anchor != null) {
      const a = anchor
      const h = hover
      if (h && !sameDay(a, h)) return a < h ? { start: a, end: h } : { start: h, end: a }
      return { start: a, end: a }
    }
    return { start: range?.start ?? null, end: range?.end ?? null }
  }, [mode, anchor, hover, range])

  const onDayClick = (d: Date) => {
    if (mode !== 'range') {
      onValueChange?.(d)
      return
    }
    if (anchor == null) {
      setAnchor(d)
      setHover(d)
      onRangeChange?.({ start: d, end: null })
    } else {
      const a = anchor
      onRangeChange?.(a <= d ? { start: a, end: d } : { start: d, end: a })
      setAnchor(null)
      setHover(null)
    }
  }

  return (
    <div
      className={cn(
        'w-[320px] select-none rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(31,26,19,.05)]',
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="font-sans text-[17px] font-bold leading-none tracking-tight">
          {MONTHS[view.m]} <span className="font-medium text-muted-foreground">{view.y}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Mois précédent"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Mois suivant"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[24px_repeat(7,1fr)] items-center text-center">
        <div />
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-2 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
            {w}
          </div>
        ))}

        {weeks.map((row, rowIdx) => (
          <React.Fragment key={rowIdx}>
            <div className="py-1 font-mono text-[10px] text-muted-foreground/60">{row.week}</div>
            {row.days.map((d, dIdx) => {
              const inMonth = d.getMonth() === view.m
              const isToday = sameDay(d, today)
              const isWeekend = d.getDay() === 0 || d.getDay() === 6
              const dis = isDisabled(d)

              const er = effRange
              const hasSpan = er.start != null && er.end != null && !sameDay(er.start, er.end)
              const isRStart = er.start != null && sameDay(d, er.start)
              const isREnd = hasSpan && er.end != null && sameDay(d, er.end)
              const between = hasSpan && er.start! < d && d < er.end!
              const isSel = mode !== 'range' && value != null && sameDay(d, value)
              const filled = isSel || isRStart || isREnd

              return (
                <button
                  key={dIdx}
                  type="button"
                  disabled={dis}
                  onClick={() => onDayClick(d)}
                  onMouseEnter={() => {
                    if (mode === 'range' && anchor != null) setHover(d)
                  }}
                  className="relative flex h-9 items-center justify-center"
                >
                  {hasSpan && (between || isRStart || isREnd) && (
                    <span
                      className={cn(
                        'pointer-events-none absolute inset-y-1.5 bg-brand/20',
                        between && 'left-0 right-0',
                        isRStart && 'left-1/2 right-0',
                        isREnd && 'left-0 right-1/2'
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      'relative z-[1] flex size-8 items-center justify-center rounded-full text-[12px] tabular-nums transition-colors',
                      filled
                        ? 'bg-brand font-bold text-card'
                        : isToday
                          ? 'border border-brand font-bold text-brand'
                          : inMonth
                            ? isWeekend
                              ? 'text-muted-foreground hover:bg-brand-soft hover:text-foreground'
                              : 'text-foreground hover:bg-brand-soft'
                            : 'text-muted-foreground/40',
                      dis && 'opacity-40'
                    )}
                  >
                    {d.getDate()}
                  </span>
                </button>
              )
            })}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-rule-soft pt-2.5">
        <span className="font-mono text-[9px] tracking-wider text-muted-foreground">
          {mode === 'range' ? 'Plage · 2 clics' : 'Semaines ISO · lun→dim'}
        </span>
        <button
          type="button"
          onClick={goToday}
          className="font-mono text-[10px] font-bold tracking-wider text-brand transition-colors hover:text-foreground"
        >
          Aujourd'hui
        </button>
      </div>
    </div>
  )
}
export default Calendar
