import { useState, useEffect, useCallback } from 'react'

export interface RetardChargeItem {
  poste: string
  libelle: string
  heures: number
}

export interface RetardChargeData {
  items: RetardChargeItem[]
  total_heures: number
}

export function useRetardCharge() {
  const [data, setData] = useState<RetardChargeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('http://127.0.0.1:8001/api/v1/retard-charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder: '/Users/arthurbledou/Library/CloudStorage/OneDrive-AldesAeraulique/Données/Extractions',
          reference_date: null,
        }),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = await resp.json()
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return { data, loading, error, refetch: fetchData }
}
