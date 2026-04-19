import type { ApiConfig, DataSource, ReportFile, RunState } from '../types'

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
      // Ignore JSON parsing errors for non-JSON responses.
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
    return request<ApiConfig>('/config')
  },

  loadData(source: DataSource) {
    return request<Record<string, unknown>>('/data/load', {
      method: 'POST',
      body: JSON.stringify({ source }),
    })
  },

  getRun(runId: string) {
    return request<RunState>(`/runs/${runId}`)
  },

  getLatestActionReport() {
    return request<Record<string, unknown>>('/reports/actions/latest')
  },

  listReports() {
    return request<ReportFile[]>('/reports/files')
  },
}
