import { Segmented } from '@/components/ui/segmented'

export interface RuptureFiltersState {
  demandFilter: 'fermes' | 'tout'
  stockFilter: 'immediat' | 'projeté'
  usePool: boolean
  mergeBranches: boolean
  includeSf: boolean
  includePf: boolean
}

interface RuptureFiltersProps extends RuptureFiltersState {
  onDemandFilterChange: (value: 'fermes' | 'tout') => void
  onStockFilterChange: (value: 'immediat' | 'projeté') => void
  onUsePoolChange: (value: boolean) => void
  onMergeBranchesChange: (value: boolean) => void
  onIncludeSfChange: (value: boolean) => void
  onIncludePfChange: (value: boolean) => void
}

export function RuptureFilters({
  demandFilter,
  stockFilter,
  usePool,
  mergeBranches,
  includeSf,
  includePf,
  onDemandFilterChange,
  onStockFilterChange,
  onUsePoolChange,
  onMergeBranchesChange,
  onIncludeSfChange,
  onIncludePfChange,
}: RuptureFiltersProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-2 mt-3 pt-3 border-t border-border">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Demande</span>
        <Segmented
          value={demandFilter}
          onChange={(v) => onDemandFilterChange(v as 'fermes' | 'tout')}
          options={[
            { value: 'fermes', label: 'Fermes' },
            { value: 'tout', label: 'Tout' },
          ]}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Stock</span>
        <Segmented
          value={stockFilter}
          onChange={(v) => onStockFilterChange(v as 'immediat' | 'projeté')}
          options={[
            { value: 'immediat', label: 'Immediat' },
            { value: 'projeté', label: 'Projete' },
          ]}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Source</span>
        <Segmented
          value={usePool ? 'pool' : 'stock'}
          onChange={(v) => onUsePoolChange(v === 'pool')}
          options={[
            { value: 'pool', label: 'Pool' },
            { value: 'stock', label: 'Stock' },
          ]}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">Branches</span>
        <Segmented
          value={mergeBranches ? 'merge' : 'split'}
          onChange={(v) => onMergeBranchesChange(v === 'merge')}
          options={[
            { value: 'merge', label: 'Fusion' },
            { value: 'split', label: 'Split' },
          ]}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">SF</span>
        <Segmented
          value={includeSf ? 'oui' : 'non'}
          onChange={(v) => onIncludeSfChange(v === 'oui')}
          options={[
            { value: 'oui', label: 'Oui' },
            { value: 'non', label: 'Non' },
          ]}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">PF</span>
        <Segmented
          value={includePf ? 'oui' : 'non'}
          onChange={(v) => onIncludePfChange(v === 'oui')}
          options={[
            { value: 'oui', label: 'Oui' },
            { value: 'non', label: 'Non' },
          ]}
        />
      </div>
    </div>
  )
}
