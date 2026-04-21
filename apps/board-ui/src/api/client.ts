import type { DataSource, RunState } from '@/types/api'
import type { MonthCalendar, CapacityConfigResponse } from '@/types/capacity'
import type { AnalyseRuptureResponse } from '@/types/analyse-rupture'
import type { FeasibilityResponse, ArticleSearchResult, OrderSearchResult } from '@/types/feasibility'
import type { EolResidualsResponse } from '@/types/eol-residuals'
import type { ResidualFabricationResponse } from '@/types/residual-fabrication'
import type { StockEvolutionResponse, StockChartData } from '@/types/stock-evolution'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000'

const DEFAULT_EXTRACTIONS_DIR =
  import.meta.env.VITE_EXTRACTIONS_DIR ?? null

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
      body: JSON.stringify({ source, extractions_dir: extractionsDir ?? DEFAULT_EXTRACTIONS_DIR }),
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

  // ── Analyse de Rupture ────────────────────────────────────────
  analyserRupture(componentCode: string, options?: {
    include_previsions?: boolean
    include_receptions?: boolean
    use_pool?: boolean
    merge_branches?: boolean
    include_sf?: boolean
    include_pf?: boolean
  }) {
    return request<AnalyseRuptureResponse>('/api/v1/analyse-rupture', {
      method: 'POST',
      body: JSON.stringify({
        component_code: componentCode,
        include_previsions: options?.include_previsions ?? false,
        include_receptions: options?.include_receptions ?? false,
        use_pool: options?.use_pool ?? true,
        merge_branches: options?.merge_branches ?? true,
        include_sf: options?.include_sf ?? true,
        include_pf: options?.include_pf ?? false,
      }),
    })
  },

  // ── EOL Residual Stock Analysis ────────────────────────────────
  eolResidualsAnalysis(data: {
    familles?: string[]
    prefixes?: string[]
    bom_depth_mode?: string
    stock_mode?: string
    component_types?: string
    projection_date?: string
  }) {
    return request<EolResidualsResponse>('/api/v1/eol-residuals', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  eolResidualsFabricable(data: {
    familles?: string[]
    prefixes?: string[]
    desired_qty?: number
    bom_depth_mode?: string
    stock_mode?: string
    projection_date?: string
  }) {
    return request<ResidualFabricationResponse>('/api/v1/eol-residuals/fabricable', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // ── Feasibility ──────────────────────────────────────────────
  checkFeasibility(data: { article: string; quantity: number; desired_date: string; use_receptions?: boolean; check_capacity?: boolean; depth_mode?: string }) {
    return request<FeasibilityResponse>('/api/v1/feasibility/check', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  findPromiseDate(data: { article: string; quantity: number; max_horizon_days?: number }) {
    return request<FeasibilityResponse>('/api/v1/feasibility/promise-date', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  simulateReschedule(data: { num_commande: string; article: string; new_date: string; new_quantity?: number; depth_mode?: string; use_receptions?: boolean }) {
    return request<FeasibilityResponse>('/api/v1/feasibility/reschedule', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  searchArticles(query: string, limit?: number) {
    return request<{ articles: ArticleSearchResult[] }>(`/api/v1/feasibility/articles?q=${encodeURIComponent(query)}&limit=${limit ?? 20}`)
  },

  searchOrders(query: string, limit?: number) {
    return request<{ orders: OrderSearchResult[] }>(`/api/v1/feasibility/orders?q=${encodeURIComponent(query)}&limit=${limit ?? 30}`)
  },

  // ── Stock Evolution ───────────────────────────────────────────
  getStockEvolution(itmref: string, options?: { horizon_days?: number; include_internal?: boolean }) {
    const params = new URLSearchParams({ itmref })
    if (options?.horizon_days) params.set('horizon_days', String(options.horizon_days))
    if (options?.include_internal) params.set('include_internal', 'true')
    return request<StockEvolutionResponse>(`/api/v1/stock-evolution/${encodeURIComponent(itmref)}?${params}`)
  },

  getStockEvolutionChart(itmref: string, options?: { horizon_days?: number; include_internal?: boolean }) {
    const params = new URLSearchParams({ itmref })
    if (options?.horizon_days) params.set('horizon_days', String(options.horizon_days))
    if (options?.include_internal) params.set('include_internal', 'true')
    return request<StockChartData>(`/api/v1/stock-evolution/${encodeURIComponent(itmref)}/chart?${params}`)
  },
}
