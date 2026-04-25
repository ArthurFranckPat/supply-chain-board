import { useState } from 'react'
import { useEolResiduals } from '@/hooks/useEolResiduals'
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
      familles: famillesList, prefixes: prefixesList,
      bom_depth_mode: bomDepthMode, stock_mode: stockMode,
      projection_date: stockMode === 'projected' ? projectionDate : undefined,
    })
  }

  return (
    <div className="max-w-6xl space-y-3">
      <EolSearchForm
        familles={familles} setFamilles={setFamilles}
        prefixes={prefixes} setPrefixes={setPrefixes}
        bomDepthMode={bomDepthMode} setBomDepthMode={setBomDepthMode}
        stockMode={stockMode} setStockMode={setStockMode}
        projectionDate={projectionDate} setProjectionDate={setProjectionDate}
        onAnalyze={handleAnalyze} isPending={analyse.isPending}
      />

      {analyse.error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-3 py-2 text-xs">
          {analyse.error.message}
        </div>
      )}

      {analyse.isPending && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <div className="w-3 h-3 border-2 border-primary border-t-transparent animate-spin" />
          Analyse residuelle en cours...
        </div>
      )}

      {!analyse.isPending && !analyse.data && !analyse.error && (
        <div className="py-10 text-center">
          <p className="text-xs text-muted-foreground">Saisissez des familles ou prefixes, puis cliquez sur Analyser.</p>
        </div>
      )}

      {analyse.data && (
        <EolResultsTable data={analyse.data} bomDepthMode={bomDepthMode} stockMode={stockMode} projectionDate={projectionDate} />
      )}
    </div>
  )
}
