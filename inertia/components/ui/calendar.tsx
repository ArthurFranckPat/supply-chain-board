import { createMemo, createSignal, For, type Component } from 'solid-js'
import { cx } from '@/libs/cva'

/**
 * Calendrier « Papier » — sélecteur de date, en mode date unique ou plage.
 *
 *  • mode="single" (défaut) : `value` / `onValueChange` — un clic sélectionne.
 *  • mode="range"           : `range` / `onRangeChange` — 1er clic = début,
 *    survol = aperçu, 2e clic = fin (ordre auto). Barre brand-soft continue
 *    entre les deux bornes (remplies terra).
 *
 * Mois en Fraunces, numéros de semaine ISO en colonne gauche (alignés sur le
 * board S25/S26), lundi en premier (FR). Thémé via le scope .theme-papier.
 */

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

/** Numéro de semaine ISO 8601 (semaine du lundi). */
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
  /** Date sélectionnée — mode single. */
  value?: Date | null
  onValueChange?: (date: Date) => void
  /** Plage sélectionnée — mode range. */
  range?: DateRange | null
  onRangeChange?: (range: DateRange) => void
  /** Borne min (jours antérieurs désactivés). */
  min?: Date
  /** Borne max. */
  max?: Date
  class?: string
}

export const Calendar: Component<CalendarProps> = (props) => {
  const today = startOfDay(new Date())
  const initial = props.mode === 'range' ? (props.range?.start ?? today) : (props.value ?? today)

  const [view, setView] = createSignal({
    y: initial.getFullYear(),
    m: initial.getMonth(),
  })
  // Premier clic d'une nouvelle plage (mi-sélection).
  const [anchor, setAnchor] = createSignal<Date | null>(null)
  // Jour survolé pendant la sélection de la fin.
  const [hover, setHover] = createSignal<Date | null>(null)

  /** 6 semaines à partir du lundi ≤ 1er du mois vu. */
  const weeks = createMemo(() => {
    const { y, m } = view()
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
  })

  const shift = (delta: number) => {
    const { y, m } = view()
    const d = new Date(y, m + delta, 1)
    setView({ y: d.getFullYear(), m: d.getMonth() })
  }
  const goToday = () => {
    setView({ y: today.getFullYear(), m: today.getMonth() })
    // Mode single : "Aujourd'hui" sélectionne réellement la date (pas juste la vue) —
    // sinon le clic ne fait rien de visible quand le mois affiché est déjà le mois courant.
    if (props.mode !== 'range') props.onValueChange?.(today)
  }

  const isDisabled = (d: Date) =>
    (props.min != null && d < startOfDay(props.min)) || (props.max != null && d > props.max)

  /** Plage effective rendue : plage validée OU aperçu (ancre → survol). */
  const effRange = createMemo<DateRange>(() => {
    if (props.mode !== 'range') return { start: null, end: null }
    if (anchor() != null) {
      const a = anchor()!
      const h = hover()
      if (h && !sameDay(a, h)) return a < h ? { start: a, end: h } : { start: h, end: a }
      return { start: a, end: a }
    }
    return { start: props.range?.start ?? null, end: props.range?.end ?? null }
  })

  const onDayClick = (d: Date) => {
    if (props.mode !== 'range') {
      props.onValueChange?.(d)
      return
    }
    if (anchor() == null) {
      setAnchor(d)
      setHover(d)
      props.onRangeChange?.({ start: d, end: null })
    } else {
      const a = anchor()!
      props.onRangeChange?.(a <= d ? { start: a, end: d } : { start: d, end: a })
      setAnchor(null)
      setHover(null)
    }
  }

  return (
    <div
      class={cx(
        'w-[320px] select-none rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(31,26,19,.05)]',
        props.class
      )}
    >
      {/* En-tête : mois (Fraunces) + navigation */}
      <div class="mb-3 flex items-center justify-between">
        <div class="font-fraunces text-[17px] font-bold leading-none tracking-tight">
          {MONTHS[view().m]} <span class="font-medium text-muted-foreground">{view().y}</span>
        </div>
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Mois précédent"
            class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <span class="material-symbols-outlined text-[18px]">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Mois suivant"
            class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <span class="material-symbols-outlined text-[18px]">chevron_right</span>
          </button>
        </div>
      </div>

      {/* Grille : colonne n° de semaine + 7 jours */}
      <div class="grid grid-cols-[24px_repeat(7,1fr)] items-center text-center">
        <div />
        <For each={WEEKDAYS}>
          {(w) => (
            <div class="pb-2 font-mono text-[9px] font-bold tracking-wider text-muted-foreground">
              {w}
            </div>
          )}
        </For>

        <For each={weeks()}>
          {(row) => (
            <>
              <div class="py-1 font-mono text-[10px] text-muted-foreground/60">{row.week}</div>
              <For each={row.days}>
                {(d) => {
                  const inMonth = d.getMonth() === view().m
                  const isToday = sameDay(d, today)
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  const dis = isDisabled(d)

                  // Réactifs : suivent effRange() (ancre + survol) pour l'aperçu live.
                  const hasSpan = () => {
                    const er = effRange()
                    return er.start != null && er.end != null && !sameDay(er.start, er.end)
                  }
                  const isRStart = () => {
                    const er = effRange()
                    return er.start != null && sameDay(d, er.start)
                  }
                  const isREnd = () => {
                    const er = effRange()
                    return hasSpan() && er.end != null && sameDay(d, er.end)
                  }
                  const between = () => {
                    const er = effRange()
                    return hasSpan() && er.start! < d && d < er.end!
                  }
                  const isSel = () =>
                    props.mode !== 'range' && props.value != null && sameDay(d, props.value)
                  const filled = () => isSel() || isRStart() || isREnd()

                  return (
                    <button
                      type="button"
                      disabled={dis}
                      onClick={() => onDayClick(d)}
                      onMouseEnter={() => {
                        if (props.mode === 'range' && anchor() != null) setHover(d)
                      }}
                      class="relative flex h-9 items-center justify-center"
                    >
                      {/* barre de plage — pleine entre, demi aux bornes */}
                      {hasSpan() && (between() || isRStart() || isREnd()) && (
                        <span
                          class={cx(
                            'pointer-events-none absolute inset-y-1.5 bg-brand/20',
                            between() && 'left-0 right-0',
                            isRStart() && 'left-1/2 right-0',
                            isREnd() && 'left-0 right-1/2'
                          )}
                        />
                      )}
                      {/* pastille jour */}
                      <span
                        class={cx(
                          'relative z-[1] flex size-8 items-center justify-center rounded-full text-[12px] tabular-nums transition-colors',
                          filled()
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
                }}
              </For>
            </>
          )}
        </For>
      </div>

      {/* Pied : rappel contexte + saut à aujourd'hui */}
      <div class="mt-3 flex items-center justify-between border-t border-rule-soft pt-2.5">
        <span class="font-mono text-[9px] tracking-wider text-muted-foreground">
          {props.mode === 'range' ? 'Plage · 2 clics' : 'Semaines ISO · lun→dim'}
        </span>
        <button
          type="button"
          onClick={goToday}
          class="font-mono text-[10px] font-bold tracking-wider text-brand transition-colors hover:text-foreground"
        >
          Aujourd'hui
        </button>
      </div>
    </div>
  )
}

export default Calendar
