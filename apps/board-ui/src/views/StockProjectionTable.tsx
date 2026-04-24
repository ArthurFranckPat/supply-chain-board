import { useState, useEffect } from 'react'
import { apiClient, ApiError } from '@/api/client'
import type { StockProjectionResponse } from '@/types/stock-evolution'
import { TrendingUp, TrendingDown, AlertTriangle, Package } from 'lucide-react'

interface Props {
  articleCode: string
  stockInitial: number
  lotEco: number
  lotOptimal: number
  delaiReappro: number
  demandeHebdo: number
}

function fmtNum(n: number, dec = 1): string {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

export function StockProjectionTable({ articleCode, stockInitial, lotEco, lotOptimal, delaiReappro, demandeHebdo }: Props) {
  const [data, setData] = useState<StockProjectionResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiClient.projectStock({
      article: articleCode,
      stock_initial: stockInitial,
      lot_eco: lotEco,
      lot_optimal: lotOptimal,
      delai_reappro_jours: delaiReappro,
      demande_hebdo: demandeHebdo,
      horizon_weeks: 26,
    })
      .then(setData)
      .catch(err => setError(err instanceof ApiError ? err.message : 'Erreur'))
      .finally(() => setLoading(false))
  }, [articleCode, stockInitial, lotEco, lotOptimal, delaiReappro, demandeHebdo])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-xs text-stone-400">Projection en cours...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-stone-400">
        {error}
      </div>
    )
  }

  if (!data || data.weeks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-stone-400">
        Aucune donnée de projection disponible
      </div>
    )
  }

  const maxStock = Math.max(...data.weeks.map(w => Math.max(w.projected_stock, w.supplier_receptions + w.production_entries, w.simulated_replenishment)), 1)

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-6 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-[#58a6ff] rounded-full" />
          <span className="text-stone-400">Stock projeté</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-[#3fb950] rounded-sm" />
          <span className="text-stone-400">Réceptions fournisseurs</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-[#a371f7] rounded-sm" />
          <span className="text-stone-400">Productions OF</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 bg-[#f0883e] rounded-sm" />
          <span className="text-stone-400">Réappro simulé</span>
        </div>
        {data.rupture_week && (
          <div className="flex items-center gap-1.5 ml-auto">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
            <span className="text-red-600 font-semibold">Rupture en S+{data.rupture_week}</span>
          </div>
        )}
      </div>

      {/* Mini sparkline chart */}
      <div className="relative h-24 bg-[#0d1117] rounded-xl overflow-hidden px-4 pt-4">
        {/* Threshold line */}
        <div
          className="absolute right-4 top-4 text-[9px] text-[#f85149]/60 font-mono"
          style={{ bottom: `${(data.threshold / maxStock) * 100}%` }}
        >
          <div className="w-8 h-px bg-[#f85149]/40 mb-0.5" />
          seuil
        </div>

        <div className="flex items-end h-full gap-[2px]">
          {data.weeks.map((w, i) => {
            const stockH = Math.max((w.projected_stock / maxStock) * 100, 0)
            const supH = Math.max((w.supplier_receptions / maxStock) * 100, 0)
            const prodH = Math.max((w.production_entries / maxStock) * 100, 0)
            const simH = Math.max((w.simulated_replenishment / maxStock) * 100, 0)
            const isFirst = i === 0
            const isS = w.week_label.startsWith('S+')
            return (
              <div key={i} className="flex-1 flex flex-col justify-end gap-px group relative">
                {/* Tooltip on hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10 bg-[#161b22] border border-[#30363d] rounded-lg px-2 py-1.5 text-[10px] text-[#c9d1d9] whitespace-nowrap shadow-xl">
                  <div className="font-semibold text-[#f0f6fc] mb-1">{w.week_label}</div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-sm bg-[#58a6ff]" />
                      <span>Stock: <span className="font-mono font-semibold text-[#f0f6fc]">{fmtNum(w.projected_stock, 0)}</span></span>
                    </div>
                    {w.supplier_receptions > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm bg-[#3fb950]" />
                        <span>Fourn: <span className="font-mono text-[#3fb950]">+{fmtNum(w.supplier_receptions, 0)}</span></span>
                      </div>
                    )}
                    {w.production_entries > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm bg-[#a371f7]" />
                        <span>OF: <span className="font-mono text-[#a371f7]">+{fmtNum(w.production_entries, 0)}</span></span>
                      </div>
                    )}
                    {w.simulated_replenishment > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm bg-[#f0883e]" />
                        <span>Sim: <span className="font-mono text-[#f0883e]">+{fmtNum(w.simulated_replenishment, 0)}</span></span>
                      </div>
                    )}
                    {w.client_exits > 0 && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm bg-[#f85149]" />
                        <span>Sorties: <span className="font-mono text-[#f85149]">-{fmtNum(w.client_exits, 0)}</span></span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Stacked bars */}
                <div className="w-full flex flex-col justify-end" style={{ height: `${stockH}%` }}>
                  <div
                    className={`w-full rounded-t-sm transition-all ${isFirst ? 'bg-[#58a6ff]' : 'bg-[#58a6ff]/60'}`}
                    style={{ height: '100%' }}
                  />
                </div>
                {/* Supplier bars */}
                {supH > 0 && (
                  <div className="absolute bottom-0 w-full flex justify-center">
                    <div
                      className="w-full bg-[#3fb950]/80 rounded-t-sm"
                      style={{ height: `${supH}%`, marginBottom: `${stockH}%` }}
                    />
                  </div>
                )}
                {/* Production bars */}
                {prodH > 0 && (
                  <div className="absolute bottom-0 w-full flex justify-center">
                    <div
                      className="w-full bg-[#a371f7]/80 rounded-t-sm"
                      style={{ height: `${prodH}%`, marginBottom: `${stockH + supH}%` }}
                    />
                  </div>
                )}
                {/* Simulated replenishment */}
                {simH > 0 && (
                  <div
                    className="absolute w-full bg-[#f0883e] rounded-t-sm"
                    style={{ height: `${simH}%`, bottom: `${Math.max(stockH, 0)}%` }}
                  />
                )}
                {/* Below threshold marker */}
                {w.is_below_threshold && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-red-500 rounded-full" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Weekly table — first 13 weeks (S+1 to S+13) */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-[#21262d]">
              <th className="text-left py-2 px-3 font-semibold text-stone-400 uppercase tracking-wider">Semaine</th>
              <th className="text-right py-2 px-3 font-semibold text-stone-400 uppercase tracking-wider">Stock proj.</th>
              <th className="text-right py-2 px-3 font-semibold text-stone-400 uppercase tracking-wider">Sorties client</th>
              <th className="text-right py-2 px-3 font-semibold text-stone-400 uppercase tracking-wider">Réceptions</th>
              <th className="text-right py-2 px-3 font-semibold text-stone-400 uppercase tracking-wider">Productions</th>
              <th className="text-right py-2 px-3 font-semibold text-stone-400 uppercase tracking-wider">Réappro sim.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#21262d]/50">
            {data.weeks.slice(0, 13).map((w, i) => {
              const stockColor = w.projected_stock < 0
                ? 'text-red-400'
                : w.projected_stock < data.threshold
                  ? 'text-amber-400'
                  : 'text-[#c9d1d9]'
              return (
                <tr key={i} className={`hover:bg-[#161b22]/50 transition-colors ${w.is_below_threshold ? 'bg-red-500/[0.03]' : ''}`}>
                  <td className="py-2 px-3 font-medium text-stone-300">{w.week_label}</td>
                  <td className={`py-2 px-3 text-right font-mono font-semibold ${stockColor}`}>
                    {w.projected_stock < 0 ? `${fmtNum(w.projected_stock, 0)} ⚠️` : fmtNum(w.projected_stock, 0)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[#f85149]">
                    {w.client_exits > 0 ? `-${fmtNum(w.client_exits, 1)}` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[#3fb950]">
                    {w.supplier_receptions > 0 ? `+${fmtNum(w.supplier_receptions, 0)}` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[#a371f7]">
                    {w.production_entries > 0 ? `+${fmtNum(w.production_entries, 0)}` : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[#f0883e]">
                    {w.simulated_replenishment > 0 ? `+${fmtNum(w.simulated_replenishment, 0)}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {data.horizon_weeks > 13 && (
        <p className="text-[10px] text-stone-500 text-center">
          + {data.horizon_weeks - 13} semaines supplémentaires dans la projection
        </p>
      )}
    </div>
  )
}