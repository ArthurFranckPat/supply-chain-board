import type { SuiviStatusResponse } from '@/types/suivi-commandes'
import { HttpError, request } from '@/api/shared'

const SUIVI_API_BASE =
  import.meta.env.VITE_SUIVI_API_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8001'

const DEFAULT_EXTRACTIONS_DIR =
  import.meta.env.VITE_EXTRACTIONS_DIR ?? null

export class SuiviApiError extends HttpError {
  constructor(message: string, status = 500) {
    super(message, status)
    this.name = 'SuiviApiError'
  }
}

function suiviRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(SUIVI_API_BASE, path, init).catch(err => {
    if (err instanceof HttpError && !(err instanceof SuiviApiError)) {
      throw new SuiviApiError(err.message, err.status)
    }
    throw err
  })
}

export const suiviClient = {
  getHealth() {
    return suiviRequest<{ status: string }>('/health')
  },

  getStatusFromLatestExport(folder?: string, referenceDate?: string) {
    return suiviRequest<SuiviStatusResponse>('/api/v1/status/from-latest-export', {
      method: 'POST',
      body: JSON.stringify({ folder: folder ?? DEFAULT_EXTRACTIONS_DIR, reference_date: referenceDate ?? null }),
    })
  },
}
