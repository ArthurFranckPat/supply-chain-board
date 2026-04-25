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
      itmref: article.trim(), horizon_days: days,
      include_internal: includeInternal, include_stock_q: includeStockQ,
    })
  }

  return (
    <div className="max-w-6xl space-y-3">
      <div className="bg-card border border-border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[10px] text-muted-foreground mb-0.5">Article</label>
            <input type="text" value={article} onChange={(e) => setArticle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyse()}
              placeholder="Code article..."
              className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none focus:border-ring font-mono"
            />
          </div>
          <div className="w-24">
            <label className="block text-[10px] text-muted-foreground mb-0.5">Horizon</label>
            <input type="number" value={horizon} onChange={(e) => setHorizon(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyse()} min={1} max={365}
              className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none focus:border-ring font-mono"
            />
          </div>
          <button onClick={handleAnalyse} disabled={analyse.isPending || !article.trim()}
            className="h-7 px-3 bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {analyse.isPending ? '...' : 'Analyser'}
          </button>
        </div>
        <div className="flex items-center gap-4 mt-2">
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={includeInternal} onChange={(e) => setIncludeInternal(e.target.checked)} className="h-3 w-3" />
            Internes
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={includeStockQ} onChange={(e) => setIncludeStockQ(e.target.checked)} className="h-3 w-3" />
            Stock Q
          </label>
          <label className="flex items-center gap-1 text-[11px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showAverage} onChange={(e) => setShowAverage(e.target.checked)} className="h-3 w-3" />
            Moyenne
          </label>
        </div>
      </div>

      {analyse.error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2 text-xs">{analyse.error.message}</div>
      )}

      {analyse.isPending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent animate-spin" />
          Chargement...
        </div>
      )}

      {analyse.data && !analyse.isPending && (
        <>
          {analyse.data.description && (
            <div className="bg-card border border-border px-3 py-2 flex items-baseline gap-2">
              <span className="text-[11px] font-mono text-muted-foreground">{analyse.data.article}</span>
              <span className="text-xs font-medium">{analyse.data.description}</span>
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
