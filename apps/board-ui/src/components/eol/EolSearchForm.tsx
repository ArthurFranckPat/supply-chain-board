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
  familles, setFamilles, prefixes, setPrefixes,
  bomDepthMode, setBomDepthMode, stockMode, setStockMode,
  projectionDate, setProjectionDate, onAnalyze, isPending,
}: EolSearchFormProps) {
  return (
    <div className="bg-card border border-border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px]">
          <label className="block text-[10px] text-muted-foreground mb-0.5">Familles</label>
          <input
            type="text" value={familles} onChange={(e) => setFamilles(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
            placeholder="BDS, BDC"
            className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none focus:border-ring font-mono"
          />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="block text-[10px] text-muted-foreground mb-0.5">Prefixes</label>
          <input
            type="text" value={prefixes} onChange={(e) => setPrefixes(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAnalyze()}
            placeholder="MH, DW..."
            className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none focus:border-ring font-mono"
          />
        </div>
        <div className="w-32">
          <label className="block text-[10px] text-muted-foreground mb-0.5">Nomenclature</label>
          <select
            value={bomDepthMode} onChange={(e) => setBomDepthMode(e.target.value as 'full' | 'level1')}
            className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none"
          >
            <option value="full">Complète</option>
            <option value="level1">Niveau 1</option>
          </select>
        </div>
        <div className="w-36">
          <label className="block text-[10px] text-muted-foreground mb-0.5">Stock</label>
          <select
            value={stockMode} onChange={(e) => setStockMode(e.target.value as typeof stockMode)}
            className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none"
          >
            <option value="physical">Physique</option>
            <option value="net_releaseable">Net allouable</option>
            <option value="projected">Projeté</option>
          </select>
        </div>
        {stockMode === 'projected' && (
          <div className="w-36">
            <label className="block text-[10px] text-muted-foreground mb-0.5">Date</label>
            <input
              type="date" value={projectionDate} onChange={(e) => setProjectionDate(e.target.value)}
              className="w-full h-7 px-2 text-[12px] border border-border bg-card outline-none"
            />
          </div>
        )}
        <button
          onClick={onAnalyze} disabled={isPending || (!familles.trim() && !prefixes.trim())}
          className="h-7 px-3 bg-primary text-primary-foreground text-[11px] font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          {isPending ? '...' : 'Analyser'}
        </button>
      </div>
    </div>
  )
}
