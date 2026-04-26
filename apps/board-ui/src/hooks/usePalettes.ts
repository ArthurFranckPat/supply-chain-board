import { useState, useEffect, useCallback } from 'react'

export interface PaletteLigne {
  num_commande: string
  article: string
  designation: string
  type_commande: string
  statut: string
  qte_restante: number
  unites_par_pal: number
  type_palette: string
  gamme: string
  nb_palettes: number
  date_expedition: string
}

export interface PaletteByDay {
  date: string
  date_fmt: string
  palettes_standard: number
  palettes_easyhome: number
  total_palettes: number
  camions: number
  nb_lignes: number
}

export interface PaletteMoyenne {
  par_jour: number
  par_semaine: number
}

export interface PaletteTotaux {
  palettes_standard: number
  palettes_easyhome: number
  total_palettes: number
  camions: number
  total_lignes: number
}

export interface PaletteData {
  lignes: PaletteLigne[]
  by_day: PaletteByDay[]
  moyenne: PaletteMoyenne
  totaux: PaletteTotaux
}

export function usePalettes() {
  const [data, setData] = useState<PaletteData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('http://127.0.0.1:8001/api/v1/palettes', {
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
