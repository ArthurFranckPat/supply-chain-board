import type { DataSource, RunState, ApiConfig, DataSourceSnapshot, ReportFile } from '@/types/api'
import { apiRequest, DEFAULT_EXTRACTIONS_DIR } from '@/api/core'

export const schedulerApi = {
  getHealth() {
    return apiRequest<{ status: string }>('/health')
  },

  getConfig() {
    return apiRequest<ApiConfig>('/api/v1/config')
  },

  loadData(source: DataSource, extractionsDir?: string | null) {
    return apiRequest<DataSourceSnapshot>('/api/v1/data/load', {
      method: 'POST',
      body: JSON.stringify({ source, extractions_dir: extractionsDir ?? DEFAULT_EXTRACTIONS_DIR }),
    })
  },

  runSchedule(payload: {
    immediate_components?: boolean
    blocking_components_mode?: string
    demand_horizon_days?: number
  }) {
    return apiRequest<RunState>('/api/v1/runs/schedule', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  getRun(runId: string) {
    return apiRequest<RunState>(`/api/v1/runs/${runId}`)
  },

  listReports() {
    return apiRequest<ReportFile[]>('/api/v1/reports/files')
  },
}
