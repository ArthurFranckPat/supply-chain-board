import { apiRequest } from '@/api/core'
import type {
  PlanningBoardResponse,
  PlanningBoardOF,
  OfPatchPayload,
  PlanningBoardOverride,
  PlanningBoardEvent,
} from '@/types/planningBoard'

export const planningBoardApi = {
  listOfs(params: {
    from?: string
    to?: string
    statut?: number | null
    poste?: string | null
    q?: string | null
  }) {
    const search = new URLSearchParams()
    if (params.from) search.set('from', params.from)
    if (params.to) search.set('to', params.to)
    if (params.statut != null) search.set('statut', String(params.statut))
    if (params.poste) search.set('poste', params.poste)
    if (params.q) search.set('q', params.q)
    const qs = search.toString()
    return apiRequest<PlanningBoardResponse>(`/api/v1/planning-board/ofs${qs ? `?${qs}` : ''}`)
  },

  patchOf(numOf: string, payload: OfPatchPayload) {
    return apiRequest<PlanningBoardOF>(`/api/v1/planning-board/ofs/${encodeURIComponent(numOf)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  resetOf(numOf: string) {
    return apiRequest<PlanningBoardOF>(
      `/api/v1/planning-board/ofs/${encodeURIComponent(numOf)}/override`,
      { method: 'DELETE' },
    )
  },

  listOverrides() {
    return apiRequest<{ overrides: PlanningBoardOverride[]; total: number }>(
      '/api/v1/planning-board/overrides',
    )
  },

  resetAll() {
    return apiRequest<{ deleted: number }>('/api/v1/planning-board/overrides', {
      method: 'DELETE',
    })
  },

  listEvents(limit = 100) {
    return apiRequest<{ events: PlanningBoardEvent[] }>(
      `/api/v1/planning-board/events?limit=${limit}`,
    )
  },
}
