import type { DataSource, RunState } from '@/types/api'
import type { MonthCalendar, CapacityConfigResponse } from '@/types/capacity'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000'

export class ApiError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const payload = (await response.json()) as { detail?: string }
      message = payload.detail ?? message
    } catch {
      // ignore json parse errors
    }
    throw new ApiError(message, response.status)
  }

  return (await response.json()) as T
}

export const apiClient = {
  getHealth() {
    return request<{ status: string }>('/health')
  },

  getConfig() {
    return request<Record<string, unknown>>('/config')
  },

  loadData(source: DataSource, extractionsDir?: string) {
    return request<Record<string, unknown>>('/data/load', {
      method: 'POST',
      body: JSON.stringify({ source, extractions_dir: extractionsDir ?? null }),
    })
  },

  runSchedule(payload: {
    immediate_components?: boolean
    blocking_components_mode?: string
    demand_horizon_days?: number
  }) {
    return request<RunState>('/runs/schedule', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getRun(runId: string) {
    return request<RunState>(`/runs/${runId}`)
  },

  listReports() {
    return request<Record<string, unknown>[]>('/reports/files')
  },

  // ── Calendar ────────────────────────────────────────────────
  getCalendar(year: number, month: number) {
    return request<MonthCalendar>(`/calendar/${year}/${month}`)
  },

  updateManualOffDays(data: {
    year: number
    additions: Array<{ date: string; reason?: string }>
    removals: string[]
  }) {
    return request<{ status: string; manual_off_count: number }>('/calendar/manual-off', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  refreshHolidays(year: number) {
    return request<{ status: string; holidays_count: number }>('/calendar/holidays/refresh', {
      method: 'POST',
      body: JSON.stringify({ year }),
    })
  },

  // ── Capacity ────────────────────────────────────────────────
  getCapacityConfig() {
    return request<CapacityConfigResponse>('/capacity')
  },

  updatePosteConfig(data: { poste: string; default_hours: number; shift_pattern: string; label?: string }) {
    return request<{ status: string }>('/capacity/poste', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  setCapacityOverride(data: { poste: string; key: string; hours?: number; reason: string; pattern?: Record<string, number> }) {
    return request<{ status: string }>('/capacity/override', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  removeCapacityOverride(data: { poste: string; key: string }) {
    return request<{ status: string }>('/capacity/override', {
      method: 'DELETE',
      body: JSON.stringify({ poste: data.poste, key: data.key, hours: 0, reason: '' }),
    })
  },
}
