import { useState } from 'react'
import { apiClient, ApiError } from '@/api/client'
import { StockChart } from './StockChart'
import { StockStatsPanel } from './StockStatsPanel'
import { StockMovementsTable } from './StockMovementsTable'
import type { StockEvolutionResponse } from '@/types/stock-evolution'

const HORIZON_OPTIONS = [
  { value: 30, label: '30 jours' },
  { value: 45, label: '45 jours' },
  { value: 90, label: '90 jours' },
  { value: 180, label: '180 jours' },
  { value: 365, label: '1 an' },
]

export function StockEvolutionView() {
  const [article, setArticle] = useState('')
  const [horizon, setHorizon] = useState(45)
  const [includeInternal, setIncludeInternal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<StockEvolutionResponse | null>(null)

  const handleAnalyse = async () => {
    if (!article.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiClient.getStockEvolution(article.trim(), {
        horizon_days: horizon,
        include_internal: includeInternal,
      })
      setResult(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Search bar */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Article</label>
            <input
              type="text"
              value={article}
              onChange={(e) => setArticle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyse()}
              placeholder="Code article (ex: 11035404)..."
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background font-mono"
            />
          </div>
          <div className="w-36">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Horizon</label>
            <select
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
            >
              {HORIZON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => setIncludeInternal((v) => !v)}
            className={`px-3 py-2 rounded-md text-[11px] font-semibold border transition-colors ${
              includeInternal
                ? 'bg-primary/10 border-primary/20 text-primary'
                : 'bg-background border-border text-muted-foreground'
            }`}
          >
            Inclure internes
          </button>
          <button
            onClick={handleAnalyse}
            disabled={loading || !article.trim()}
            className="bg-primary text-white px-5 py-2 rounded-md text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Analyse...' : 'Analyser'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Chargement de l&apos;historique...
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          <StockStatsPanel stats={result} />
          <StockChart data={result} />
          <StockMovementsTable movements={result.items} />
        </>
      )}
    </div>
  )
}
