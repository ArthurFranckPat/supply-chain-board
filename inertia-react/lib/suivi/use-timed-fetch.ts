/**
 * Fetch JSON chronométré (durée affichée dans la toolbar) — port React du hook
 * Solid (inertia/lib/suivi/use-timed-fetch.ts). Sémantique conservée : la
 * donnée précédente reste en place pendant un re-fetch (le spinner du shell
 * masque la table de toute façon), `ms` = durée du dernier fetch réussi,
 * `elapsed` = chrono live pendant le chargement.
 */
import { useEffect, useState } from 'react'

export function useTimedFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [ms, setMs] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setElapsed(0)
    const t0 = Date.now()
    const tick = setInterval(() => setElapsed(Date.now() - t0), 200)

    fetch(url, { headers: { accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<T>
      })
      .then((json) => {
        if (cancelled) return
        setMs(Date.now() - t0)
        setData(json)
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e)
      })
      .finally(() => {
        clearInterval(tick)
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      clearInterval(tick)
    }
  }, [url])

  return { data, loading, error, ms, elapsed }
}
