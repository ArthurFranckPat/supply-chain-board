export class HttpError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
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
    throw new HttpError(message, response.status)
  }

  return (await response.json()) as T
}
