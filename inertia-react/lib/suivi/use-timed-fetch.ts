/**
 * Fetch JSON chronométré (durée affichée dans la toolbar) — port React du hook
 * Solid (inertia/lib/suivi/use-timed-fetch.ts). Sémantique conservée : la
 * donnée précédente reste en place pendant un re-fetch (le spinner du shell
 * masque la table de toute façon), `ms` = durée du dernier fetch réussi,
 * `elapsed` = chrono live pendant le chargement.
 *
 * Le hook s'enregistre aussi dans le store global data-status (widget du
 * masthead, présent sur toutes les pages) : début/fin de chaque requête
 * alimentent le chrono et l'heure de mise à jour. Un bump du `nonce` (bouton
 * « recharger » global) est injecté dans l'URL fetchée — l'effet re-court et
 * re-charge le fragment sans que la page ait quoi que ce soit à faire.
 */
import { useEffect, useState } from 'react'

import { useDataStatusStore } from '@r/lib/data-status-store'

/**
 * `url` à `null` = fragment non requis pour l'instant (onglet inactif, dépendance
 * absente) : aucun fetch n'est déclenché et l'état retombe au repos. Permet de
 * conditionner un chargement sans violer les règles des hooks.
 */
export function useTimedFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [ms, setMs] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  // Bouton « recharger » du masthead : le nonce en dépendance re-court l'effet.
  const nonce = useDataStatusStore((s) => s.nonce)

  useEffect(() => {
    if (url === null) {
      setLoading(false)
      return
    }
    let cancelled = false
    let settled = false
    setLoading(true)
    setError(null)
    setElapsed(0)
    const fullUrl = nonce > 0 ? `${url}${url.includes('?') ? '&' : '?'}_r=${nonce}` : url
    useDataStatusStore.getState().begin()
    const t0 = Date.now()
    const tick = setInterval(() => setElapsed(Date.now() - t0), 200)

    fetch(fullUrl, { headers: { accept: 'application/json' } })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<T>
      })
      .then((json) => {
        if (cancelled) return
        settled = true
        setMs(Date.now() - t0)
        setData(json)
        useDataStatusStore.getState().end(Date.now() - t0)
      })
      .catch((e: Error) => {
        if (cancelled) return
        settled = true
        setError(e)
        useDataStatusStore.getState().fail(e.message)
      })
      .finally(() => {
        clearInterval(tick)
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      clearInterval(tick)
      // Requête interrompue en vol (changement d'URL, unmount, re-bump) :
      // décompte du compteur global, sans écraser la dernière mesure.
      if (!settled) useDataStatusStore.getState().abort()
    }
  }, [url, nonce])

  return { data, loading, error, ms, elapsed }
}
