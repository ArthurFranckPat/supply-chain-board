export interface CalendarDay {
  date: string
  weekday: number
  status: 'workday' | 'holiday' | 'manual_off' | 'weekend'
  holiday: { name: string; source: string } | null
  manual_off: boolean
  reason?: string
}

export interface MonthCalendar {
  year: number
  month: number
  days: CalendarDay[]
  holidays_fetched_at: string | null
}

export interface PosteConfig {
  poste: string
  label: string
  default_hours: number
  shift_pattern: string
  daily_overrides: Record<string, { hours: number; reason: string }>
}

export interface WeeklyOverrideEntry {
  pattern: Record<string, number>  // {"1": 14, "2": 14, ..., "6": 0}
  reason: string
}

export interface CapacityConfigResponse {
  defaults: {
    shift_hours: number
    max_day_hours: number
    min_open_hours: number
  }
  postes: Record<string, PosteConfig>
  weekly_overrides: Record<string, Record<string, WeeklyOverrideEntry>>
}
