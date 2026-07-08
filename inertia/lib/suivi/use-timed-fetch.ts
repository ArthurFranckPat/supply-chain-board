/**
 * Fetch JSON chronométré (durée affichée dans la toolbar) — factorisé entre
 * les vues réactive et proactive du Suivi (issue #52).
 */
import { createEffect, createResource, createSignal, onCleanup } from 'solid-js'

export function useTimedFetch<T>(urlAccessor: () => string) {
  const [ms, setMs] = createSignal<number | null>(null)
  const [elapsed, setElapsed] = createSignal(0)

  const [data] = createResource(urlAccessor, async (url): Promise<T> => {
    const start = Date.now()
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = (await res.json()) as T
    setMs(Date.now() - start)
    return json
  })

  createEffect(() => {
    if (!data.loading) {
      setElapsed(0)
      return
    }
    const t0 = Date.now()
    const id = setInterval(() => setElapsed(Date.now() - t0), 200)
    onCleanup(() => clearInterval(id))
  })

  return { data, ms, elapsed }
}
