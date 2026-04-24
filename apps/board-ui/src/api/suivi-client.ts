import type { SuiviStatusResponse, CommentEntry } from '@/types/suivi-commandes'

const SUIVI_API_BASE =
  import.meta.env.VITE_SUIVI_API_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8001'

const DEFAULT_EXTRACTIONS_DIR =
  import.meta.env.VITE_EXTRACTIONS_DIR ?? null

export class SuiviApiError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'SuiviApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SUIVI_API_BASE}${path}`, {
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
    throw new SuiviApiError(message, response.status)
  }

  return (await response.json()) as T
}

export const suiviClient = {
  getHealth() {
    return request<{ status: string }>('/health')
  },

  getStatusFromErp(folder?: string, referenceDate?: string) {
    return request<SuiviStatusResponse>('/api/v1/status/from-erp-extractions', {
      method: 'POST',
      body: JSON.stringify({ folder: folder ?? DEFAULT_EXTRACTIONS_DIR, reference_date: referenceDate ?? null }),
    })
  },

  getStatusFromLatestExport(folder?: string, referenceDate?: string) {
    return request<SuiviStatusResponse>('/api/v1/status/from-latest-export', {
      method: 'POST',
      body: JSON.stringify({ folder: folder ?? null, reference_date: referenceDate ?? null }),
    })
  },

  // ── Comments ──────────────────────────────────────────────────

  getComments() {
    return request<CommentEntry[]>('/api/v1/comments')
  },

  batchUpsertComments(rows: Array<{ no_commande: string; article: string; comment: string }>) {
    return request<{ status: string }>('/api/v1/comments/batch', {
      method: 'PUT',
      body: JSON.stringify({ rows }),
    })
  },

  deleteComment(noCommande: string, article: string) {
    return request<{ status: string }>(`/api/v1/comments/${encodeURIComponent(noCommande)}/${encodeURIComponent(article)}`, {
      method: 'DELETE',
    })
  },
}
