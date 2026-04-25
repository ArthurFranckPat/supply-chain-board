import { useState } from 'react'
import { useStockEvolution } from '@/hooks/useStockEvolution'
import { StockChart } from './StockChart'
import { StockStatsPanel } from './StockStatsPanel'
import { StockMovementsTable } from './StockMovementsTable'

export function StockEvolutionView() {
  const [article, setArticle] = useState('11035404')
  const [horizon, setHorizon] = useState('45')
  const [includeInternal, setIncludeInternal] = useState(false)
  const [includeStockQ, setIncludeStockQ] = useState(false)
  const [showAverage, setShowAverage] = useState(false)

  const analyse = useStockEvolution()

  const handleAnalyse = () => {
    if (!article.trim()) return
    const days = parseInt(horizon, 10)
    if (isNaN(days) || days < 1) return
    analyse.mutate({
      itmref: article.trim(),
      horizon_days: days,
      include_internal: includeInternal,
      include_stock_q: includeStockQ,
    })
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Search bar */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
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
          <div className="w-28">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Horizon (jours)</label>
            <input
              type="number"
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyse()}
              min={1}
              max={365}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background font-mono"
            />
          </div>
          <button
            onClick={handleAnalyse}
            disabled={analyse.isPending || !article.trim()}
            className="bg-primary text-white px-5 py-2 rounded-md text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {analyse.isPending ? 'Analyse...' : 'Analyser'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIncludeInternal((v) => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors ${includeInternal ? 'bg-primary' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${includeInternal ? 'translate-x-5' : ''}`} />
          </button>
          <span className="text-[11px] text-muted-foreground">Inclure mouvements internes</span>

          <button
            type="button"
            onClick={() => setIncludeStockQ((v) => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors ${includeStockQ ? 'bg-orange-500' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${includeStockQ ? 'translate-x-5' : ''}`} />
          </button>
          <span className="text-[11px] text-muted-foreground">Inclure stock sous statut Q</span>

          <button
            type="button"
            onClick={() => setShowAverage((v) => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors ${showAverage ? 'bg-purple-500' : 'bg-muted'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${showAverage ? 'translate-x-5' : ''}`} />
          </button>
          <span className="text-[11px] text-muted-foreground">Afficher la moyenne</span>
        </div>
      </div>

      {/* Error */}
      {analyse.error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
          {analyse.error.message}
        </div>
      )}

      {/* Loading */}
      {analyse.isPending && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Chargement de l&apos;historique...
        </div>
      )}

      {/* Results */}
      {analyse.data && !analyse.isPending && (
        <>
          {analyse.data.description && (
            <div className="bg-card border border-border rounded-xl px-5 py-3 flex items-baseline gap-3">
              <span className="text-xs font-mono text-muted-foreground">{analyse.data.article}</span>
              <span className="text-sm font-medium">{analyse.data.description}</span>
            </div>
          )}
          <StockStatsPanel stats={analyse.data} />
          <StockChart data={analyse.data} showAverage={showAverage} />
          <StockMovementsTable movements={analyse.data.items} />
        </>
      )}
    </div>
  )
}
