import { useState } from 'react'
import { apiClient, ApiError } from '@/api/client'
import type { EolResidualsResponse, EolComponent } from '@/types/eol-residuals'

export function EolResidualsView() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<EolResidualsResponse | null>(null)

  const [familles, setFamilles] = useState('BDS,BDC')
  const [prefixes, setPrefixes] = useState('')
  const [bomDepthMode, setBomDepthMode] = useState<'full' | 'level1'>('full')
  const [stockMode, setStockMode] = useState<'physical' | 'net_releaseable' | 'projected'>('physical')
  const [projectionDate, setProjectionDate] = useState('2026-12-31')

  const handleAnalyze = async () => {
    const famillesList = familles.split(',').map(s => s.trim()).filter(Boolean)
    const prefixesList = prefixes.split(',').map(s => s.trim()).filter(Boolean)
    if (famillesList.length === 0 && prefixesList.length === 0) {
      setError('Au moins une famille ou un prefixe requis')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiClient.eolResidualsAnalysis({
        familles: famillesList,
        prefixes: prefixesList,
        bom_depth_mode: bomDepthMode,
        stock_mode: stockMode,
        projection_date: stockMode === 'projected' ? projectionDate : undefined,
      })
      setResult(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const achatComponents = result?.components.filter(c => c.component_type === 'ACHAT') ?? []
  const fabComponents = result?.components.filter(c => c.component_type === 'FABRICATION') ?? []
  const totalAchatValue = achatComponents.reduce((sum, c) => sum + c.value, 0)
  const totalFabValue = fabComponents.reduce((sum, c) => sum + c.value, 0)

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Form */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Familles produit</label>
            <input
              type="text"
              value={familles}
              onChange={(e) => setFamilles(e.target.value)}
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
              <option value="full">Complete</option>
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
            onClick={handleAnalyze}
            disabled={loading || (!familles.trim() && !prefixes.trim())}
            className="bg-primary text-white px-5 py-2 rounded-md text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Analyser
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
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Analyse en cours...
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] text-muted-foreground font-mono uppercase">Analyse residuelle EOL</p>
                <p className="text-sm font-semibold mt-0.5">
                  {result.summary.unique_component_count} composants uniques &middot; {result.summary.target_pf_count} PF cibles
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">
                  Stock total: <strong>{result.summary.total_stock_qty.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</strong>
                </p>
                <p className="text-sm font-semibold mt-0.5">
                  {result.summary.total_value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                </p>
              </div>
            </div>
          </div>

          {/* Summary by type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-[11px] font-semibold text-blue uppercase mb-1">ACHAT (achetes)</p>
              <p className="text-lg font-bold text-blue">{achatComponents.length}</p>
              <p className="text-xs text-muted-foreground">composants</p>
              <p className="text-sm font-semibold mt-2">{totalAchatValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-[11px] font-semibold text-purple uppercase mb-1">FABRICATION (internes)</p>
              <p className="text-lg font-bold text-purple">{fabComponents.length}</p>
              <p className="text-xs text-muted-foreground">composants</p>
              <p className="text-sm font-semibold mt-2">{totalFabValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
            </div>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-[11px] font-semibold text-amber-800 mb-1">Alertes</p>
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">{w}</p>
              ))}
            </div>
          )}

          {/* Components table */}
          {result.components.length > 0 && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold">{result.components.length} composants</p>
              </div>
              <div className="overflow-auto max-h-[480px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Article</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground">Type</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground">PF cibles</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Stock qte</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">PMP</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Valeur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.components.map((comp: EolComponent) => (
                      <tr key={comp.article} className="border-t border-border hover:bg-accent/40 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-semibold">{comp.article}</td>
                        <td className="px-3 py-2.5 text-muted-foreground max-w-[200px] truncate">{comp.description}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            comp.component_type === 'ACHAT' ? 'bg-blue/10 text-blue' : 'bg-purple/10 text-purple'
                          }`}>
                            {comp.component_type}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center font-semibold">{comp.used_by_target_pf_count}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{comp.stock_qty.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{comp.pmp.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{comp.value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
