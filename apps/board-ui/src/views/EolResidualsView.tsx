import { useState } from 'react'
import { useEolResiduals } from '@/hooks/useEolResiduals'
import { Package, AlertTriangle } from 'lucide-react'
import { EolSearchForm } from '@/components/eol/EolSearchForm'
import { EolResultsTable } from '@/components/eol/EolResultsTable'

export function EolResidualsView() {
  const analyse = useEolResiduals()

  const [familles, setFamilles] = useState('BDS,BDC')
  const [prefixes, setPrefixes] = useState('')
  const [bomDepthMode, setBomDepthMode] = useState<'full' | 'level1'>('full')
  const [stockMode, setStockMode] = useState<'physical' | 'net_releaseable' | 'projected'>('physical')
  const [projectionDate, setProjectionDate] = useState('2026-12-31')

  const handleAnalyze = () => {
    const famillesList = familles.split(',').map(s => s.trim()).filter(Boolean)
    const prefixesList = prefixes.split(',').map(s => s.trim()).filter(Boolean)
    if (famillesList.length === 0 && prefixesList.length === 0) return
    analyse.mutate({
      familles: famillesList,
      prefixes: prefixesList,
      bom_depth_mode: bomDepthMode,
      stock_mode: stockMode,
      projection_date: stockMode === 'projected' ? projectionDate : undefined,
    })
  }

  const stockModeLabel = stockMode === 'physical'
    ? 'stock physique'
    : stockMode === 'net_releaseable'
    ? 'stock net allouable'
    : `stock projete au ${projectionDate}`

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <EolSearchForm
        familles={familles}
        setFamilles={setFamilles}
        prefixes={prefixes}
        setPrefixes={setPrefixes}
        bomDepthMode={bomDepthMode}
        setBomDepthMode={setBomDepthMode}
        stockMode={stockMode}
        setStockMode={setStockMode}
        projectionDate={projectionDate}
        setProjectionDate={setProjectionDate}
        onAnalyze={handleAnalyze}
        isPending={analyse.isPending}
      />

      {/* Error */}
      {analyse.error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-[11px] uppercase mb-0.5">Erreur d'analyse</p>
            <p>{analyse.error.message}</p>
          </div>
        </div>
      )}

      {/* Loading */}
      {analyse.isPending && (
        <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <p className="text-sm font-medium">Analyse residuelle en cours...</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Nomenclature {bomDepthMode === 'full' ? 'complete' : 'niveau 1'} &middot; {stockModeLabel}
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!analyse.isPending && !analyse.data && !analyse.error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Aucune analyse chargee</p>
          <p className="text-[11px] text-muted-foreground mt-1.5 max-w-[340px] leading-relaxed">
            Saisissez des familles produit ou des prefixes d'articles, puis cliquez sur{' '}
            <strong className="text-foreground">Analyser</strong> pour identifier les composants residuels EOL et leur valorisation.
          </p>
        </div>
      )}

      {/* Results */}
      {analyse.data && (
        <EolResultsTable
          data={analyse.data}
          bomDepthMode={bomDepthMode}
          stockMode={stockMode}
          projectionDate={projectionDate}
        />
      )}
    </div>
  )
}
