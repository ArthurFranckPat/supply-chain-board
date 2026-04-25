import { HttpError, request } from '@/api/shared'

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? 'http://127.0.0.1:8000'

export const DEFAULT_EXTRACTIONS_DIR =
  import.meta.env.VITE_EXTRACTIONS_DIR ?? null

export class ApiError extends HttpError {
  constructor(message: string, status = 500) {
    super(message, status)
    this.name = 'ApiError'
  }
}

export function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(API_BASE_URL, path, init).catch((err) => {
    if (err instanceof HttpError && !(err instanceof ApiError)) {
      throw new ApiError(err.message, err.status)
    }
    throw err
  })
}
