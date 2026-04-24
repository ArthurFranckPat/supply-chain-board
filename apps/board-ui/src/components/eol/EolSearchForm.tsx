
export interface EolSearchFormProps {
  familles: string
  setFamilles: (v: string) => void
  prefixes: string
  setPrefixes: (v: string) => void
  bomDepthMode: 'full' | 'level1'
  setBomDepthMode: (v: 'full' | 'level1') => void
  stockMode: 'physical' | 'net_releaseable' | 'projected'
  setStockMode: (v: 'physical' | 'net_releaseable' | 'projected') => void
  projectionDate: string
  setProjectionDate: (v: string) => void
  onAnalyze: () => void
  isPending: boolean
}

export function EolSearchForm({
  familles,
  setFamilles,
  prefixes,
  setPrefixes,
  bomDepthMode,
  setBomDepthMode,
  stockMode,
  setStockMode,
  projectionDate,
  setProjectionDate,
  onAnalyze,
  isPending,
}: EolSearchFormProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Familles produit</label>
          <input
            type="text"
            value={familles}
            onChange={(e) => setFamilles(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
            placeholder="BDS, BDC"
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background font-mono"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Prefixes (optionnel)</label>
          <input
            type="text"
            value={prefixes}
            onChange={(e) => setPrefixes(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
            placeholder="MH, DW..."
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background font-mono"
          />
        </div>
        <div className="w-36">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Profondeur nomenclature</label>
          <select
            value={bomDepthMode}
            onChange={(e) => setBomDepthMode(e.target.value as 'full' | 'level1')}
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
          >
            <option value="full">Complète</option>
            <option value="level1">Niveau 1</option>
          </select>
        </div>
        <div className="w-44">
          <label className="block text-[11px] font-medium text-muted-foreground mb-1">Mode stock</label>
          <select
            value={stockMode}
            onChange={(e) => setStockMode(e.target.value as typeof stockMode)}
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
          >
            <option value="physical">Physique</option>
            <option value="net_releaseable">Net allouable</option>
            <option value="projected">Projete</option>
          </select>
        </div>
        {stockMode === 'projected' && (
          <div className="w-40">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Date projection</label>
            <input
              type="date"
              value={projectionDate}
              onChange={(e) => setProjectionDate(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
            />
          </div>
        )}
        <button
          onClick={onAnalyze}
          disabled={isPending || (!familles.trim() && !prefixes.trim())}
          className="bg-primary text-white px-5 py-2 rounded-md text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          Analyser
        </button>
      </div>
    </div>
  )
}
