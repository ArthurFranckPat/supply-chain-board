import {
  Calendar as AstryxCalendar,
  type ISODateString,
} from "@astryxdesign/core/Calendar"

import { cn } from "@r/lib/utils"
import { buttonVariants } from "@r/components/ui/button"

// Calendar — Lot 3 (issue #90). react-day-picker DayPicker → Astryx Calendar.
//
// API shadcn (React-Day-Picker) traduite vers Astryx :
//   mode="single" + selected + onSelect → mode="single" + value + onChange
//   mode="range"  + selected + onSelect → mode="range"  + value + onChange
//
// Astryx Calendar exige value: ISODateString (string ISO yyyy-mm-dd).
// Le wrapper convertit Date ↔ ISODateString.
// buttonVariants export conservé car calendar.tsx l'exportait avant et
// CalendarDayButton l'utilisait (consommateurs possibles).

type CalendarMode = "single" | "range" | "multiple"

interface DateRangeLike {
  from?: Date
  to?: Date
}

interface CalendarProps {
  className?: string
  mode?: CalendarMode
  selected?: Date | DateRangeLike | Date[] | undefined
  defaultSelected?: Date | DateRangeLike | Date[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSelect?: (selected: any, triggerDate: any, modifiers: any, e: any) => void
  locale?: unknown
  showOutsideDays?: boolean
  captionLayout?: string
  formatters?: unknown
  components?: unknown
  buttonVariant?: string
  defaultMonth?: Date
  month?: Date
  /** Base UI/react-day-picker disabled — fonction predicate, tableau de dates,
   *  ou objet Matcher react-day-picker ({ after, before, dayOfWeek… }). */
  disabled?: ((date: Date) => boolean) | Date[] | object | undefined
  classNames?: unknown
  /** Alignement du popup — ignoré (Astryx positionne lui-même). */
  align?: "start" | "center" | "end" | "left" | "right"
  /** Nombre de mois affichés — ignoré (Astryx gère sa propre navigation). */
  numberOfMonths?: number
}

function toISO(date: Date | undefined): ISODateString | undefined {
  if (!date) return undefined
  return date.toISOString().slice(0, 10) as ISODateString
}

function fromISO(iso: ISODateString): Date {
  return new Date(iso)
}

function Calendar({
  className,
  mode = "single",
  selected,
  onSelect,
  numberOfMonths: _numberOfMonths,
  locale: _locale,
  showOutsideDays: _showOutsideDays,
  captionLayout: _captionLayout,
  formatters: _formatters,
  components: _components,
  buttonVariant: _buttonVariant,
  defaultMonth: _defaultMonth,
  month: _month,
  disabled: _disabled,
  classNames: _classNames,
}: CalendarProps) {
  // Astryx Calendar ne supporte que single + range. Multiple → single.
  const astryxMode: "single" | "range" = mode === "range" ? "range" : "single"

  if (astryxMode === "range") {
    const range = (selected as DateRangeLike | undefined) ?? {}
    const value: { start: ISODateString; end: ISODateString } | undefined =
      range.from && range.to
        ? { start: toISO(range.from)!, end: toISO(range.to)! }
        : undefined
    return (
      <AstryxCalendar
        data-slot="calendar"
        mode="range"
        value={value}
        onChange={(next: { start: ISODateString; end: ISODateString }) => {
          const from = fromISO(next.start)
          const to = fromISO(next.end)
          onSelect?.({ from, to }, from, {}, undefined)
        }}
        className={cn(className)}
      />
    )
  }

  const value = toISO(selected as Date | undefined)
  return (
    <AstryxCalendar
      data-slot="calendar"
      mode="single"
      value={value}
      onChange={(next: ISODateString) => {
        const date = fromISO(next)
        onSelect?.(date, date, {}, undefined)
      }}
      className={cn(className)}
    />
  )
}

// CalendarDayButton était un sous-composant custom dans l'ancien calendar.tsx.
// Conserver un export vide pour rétrocompatibilité.
function CalendarDayButton() {
  return null
}

export { Calendar, CalendarDayButton, buttonVariants }
