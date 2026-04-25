import type { FeasibilityResponse, ArticleSearchResult, OrderSearchResult } from '@/types/feasibility'
import { apiRequest } from '@/api/core'

export const feasibilityApi = {
  checkFeasibility(data: { article: string; quantity: number; desired_date: string; use_receptions?: boolean; check_capacity?: boolean; depth_mode?: string }) {
    return apiRequest<FeasibilityResponse>('/api/v1/feasibility/check', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  findPromiseDate(data: { article: string; quantity: number; max_horizon_days?: number }) {
    return apiRequest<FeasibilityResponse>('/api/v1/feasibility/promise-date', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  simulateReschedule(data: { num_commande: string; article: string; new_date: string; new_quantity?: number; depth_mode?: string; use_receptions?: boolean }) {
    return apiRequest<FeasibilityResponse>('/api/v1/feasibility/reschedule', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  searchArticles(query: string, limit?: number) {
    return apiRequest<{ articles: ArticleSearchResult[] }>(`/api/v1/feasibility/articles?q=${encodeURIComponent(query)}&limit=${limit ?? 20}`)
  },

  searchOrders(query: string, limit?: number) {
    return apiRequest<{ orders: OrderSearchResult[] }>(`/api/v1/feasibility/orders?q=${encodeURIComponent(query)}&limit=${limit ?? 30}`)
  },
}
