import type { MonthCalendar } from '@/types/capacity'
import { apiRequest } from '@/api/core'

export const calendarApi = {
  getCalendar(year: number, month: number) {
    return apiRequest<MonthCalendar>(`/api/v1/calendar/${year}/${month}`)
  },

  updateManualOffDays(data: {
    year: number
    additions: Array<{ date: string; reason?: string }>
    removals: string[]
  }) {
    return apiRequest<{ status: string; manual_off_count: number }>('/api/v1/calendar/manual-off', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  refreshHolidays(year: number) {
    return apiRequest<{ status: string; holidays_count: number }>('/api/v1/calendar/holidays/refresh', {
      method: 'POST',
      body: JSON.stringify({ year }),
    })
  },
}
