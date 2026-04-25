import { useState, useCallback } from 'react'
import { useAnalyseRupture } from '@/hooks/useAnalyseRupture'
import { LoadingInline, LoadingError, LoadingEmpty } from '@/components/ui/loading'
import { RuptureSearchBar } from '@/components/analyse-rupture/RuptureSearchBar'
import { RuptureFilters } from '@/components/analyse-rupture/RuptureFilters'
import type { RuptureFiltersState } from '@/components/analyse-rupture/RuptureFilters'
import { BlockedOrdersList } from '@/components/analyse-rupture/BlockedOrdersList'

export function AnalyseRuptureView() {
  const [query, setQuery] = useState('')
  const { mutate, isPending, error, data } = useAnalyseRupture()

  const [filters, setFilters] = useState<RuptureFiltersState>({
    demandFilter: 'fermes', stockFilter: 'immediat', usePool: true, mergeBranches: true, includeSf: true, includePf: false,
  })

  const handleAnalyze = useCallback((codeOverride?: string) => {
    const code = (codeOverride ?? query).trim()
    if (!code) return
    mutate({
      componentCode: code, include_previsions: filters.demandFilter === 'tout', include_receptions: filters.stockFilter === 'projeté',
      use_pool: filters.usePool, merge_branches: filters.mergeBranches, include_sf: filters.includeSf, include_pf: filters.includePf,
    })
  }, [query, filters, mutate])

  const updateFilter = <K extends keyof RuptureFiltersState>(key: K, value: RuptureFiltersState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const isProjected = filters.stockFilter === 'projeté'

  return (
    <div className="space-y-2 max-w-5xl">
      <div className="bg-card border border-border p-3">
        <RuptureSearchBar query={query} onQueryChange={setQuery} onAnalyze={() => handleAnalyze()} isPending={isPending} />
        <RuptureFilters
          demandFilter={filters.demandFilter} stockFilter={filters.stockFilter} usePool={filters.usePool}
          mergeBranches={filters.mergeBranches} includeSf={filters.includeSf} includePf={filters.includePf}
          onDemandFilterChange={v => updateFilter('demandFilter', v)} onStockFilterChange={v => updateFilter('stockFilter', v)}
          onUsePoolChange={v => updateFilter('usePool', v)} onMergeBranchesChange={v => updateFilter('mergeBranches', v)}
          onIncludeSfChange={v => updateFilter('includeSf', v)} onIncludePfChange={v => updateFilter('includePf', v)}
        />
      </div>

      {isPending && <LoadingInline label="analyse de rupture" />}
      {error && !isPending && <LoadingError message={error.message} onRetry={() => handleAnalyze()} />}
      {!data && !isPending && !error && <LoadingEmpty message="Recherchez un composant pour analyser son impact de rupture." />}
      {data && !isPending && <BlockedOrdersList result={data} isProjected={isProjected} />}
    </div>
  )
}
