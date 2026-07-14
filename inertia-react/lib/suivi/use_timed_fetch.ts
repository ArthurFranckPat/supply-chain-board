import { useState, useEffect } from 'react'

export function useTimedFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [ms, setMs] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!url) return

    let active = true
    setLoading(true)
    setError(false)
    // IMPORTANT : on NE touche pas à `data` ici. La version Solid (createResource)
    // conserve la valeur précédente pendant le refetch — l'utilisateur garde les
    // lignes courantes sous l'overlay de chargement au lieu de voir un flash vide.
    // Ne pas remettre setData(null) : ça ferait clignoter le tableau à chaque
    // "Actualiser" (régression UX vs Solid).
    setElapsed(0)

    const start = Date.now()
    const intervalId = setInterval(() => {
      if (active) {
        setElapsed(Date.now() - start)
      }
    }, 200)

    fetch(url, { headers: { accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<T>
      })
      .then((json) => {
        if (active) {
          clearInterval(intervalId)
          setData(json)
          setMs(Date.now() - start)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (active) {
          clearInterval(intervalId)
          setError(true)
          setLoading(false)
          console.error('[useTimedFetch] error:', err)
        }
      })

    return () => {
      active = false
      clearInterval(intervalId)
    }
  }, [url])

  return { data, loading, error, ms, elapsed }
}
