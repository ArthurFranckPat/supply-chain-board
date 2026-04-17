import type { DataSource, RunState } from '@/types/api'

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

  runS1(payload: {
    horizon: number
    include_previsions: boolean
    feasibility_mode: string
  }) {
    return request<RunState>('/runs/s1', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  runSchedule(payload: {
    immediate_components?: boolean
    blocking_components_mode?: string
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
}
