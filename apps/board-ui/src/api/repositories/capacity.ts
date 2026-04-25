import type { CapacityConfigResponse } from '@/types/capacity'
import { apiRequest } from '@/api/core'

export const capacityApi = {
  getCapacityConfig() {
    return apiRequest<CapacityConfigResponse>('/api/v1/capacity')
  },

  updatePosteConfig(data: { poste: string; default_hours: number; shift_pattern: string; label?: string }) {
    return apiRequest<{ status: string }>('/api/v1/capacity/poste', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  setCapacityOverride(data: { poste: string; key: string; hours?: number; reason: string; pattern?: Record<string, number> }) {
    return apiRequest<{ status: string }>('/api/v1/capacity/override', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  removeCapacityOverride(data: { poste: string; key: string }) {
    return apiRequest<{ status: string }>('/api/v1/capacity/override', {
      method: 'DELETE',
      body: JSON.stringify({ poste: data.poste, key: data.key, hours: 0, reason: '' }),
    })
  },
}
