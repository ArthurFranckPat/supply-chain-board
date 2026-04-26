import type { OrderFilterState, FilterOptions } from '@/types/suivi-commandes'

interface OrderFiltersProps {
  filters: OrderFilterState
  onChange: (filters: OrderFilterState) => void
  options: FilterOptions
  statusCounts: Record<string, number>
}

export function OrderFilters({ filters, onChange, options, statusCounts }: OrderFiltersProps) {
  const hasFilters = filters.search || filters.typesCommande.length > 0 || filters.statuts.length > 0

  function toggleTypeCommande(type: string) {
    const next = filters.typesCommande.includes(type)
      ? filters.typesCommande.filter((t) => t !== type)
      : [...filters.typesCommande, type]
    onChange({ ...filters, typesCommande: next })
  }

  function toggleStatut(statut: string) {
    const next = filters.statuts.includes(statut)
      ? filters.statuts.filter((s) => s !== statut)
      : [...filters.statuts, statut]
    onChange({ ...filters, statuts: next })
  }

  function clearAll() {
    onChange({ search: '', typesCommande: [], statuts: [] })
  }

  return (
    <div className="bg-card border border-border space-y-0">
      {/* Search row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <input
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Rechercher commande, article, description, client..."
          className="flex-1 h-7 px-2 text-[11px] border border-border bg-card outline-none focus:border-ring placeholder:text-muted-foreground"
        />
        {hasFilters && (
          <button
            onClick={clearAll}
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            Effacer
          </button>
        )}
      </div>

      {/* Quick filters row */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap">
        {/* Type */}
        {options.typesCommande.map((type) => (
          <button
            key={type}
            onClick={() => toggleTypeCommande(type)}
            className={`h-6 px-2 text-[11px] font-medium border transition-colors ${
              filters.typesCommande.includes(type)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {type}
          </button>
        ))}

        {options.typesCommande.length > 0 && options.statuts.length > 0 && (
          <div className="w-px h-4 bg-border mx-1" />
        )}

        {/* Statut */}
        {options.statuts.map((statut) => {
          const count = statusCounts[statut] ?? 0
          const active = filters.statuts.includes(statut)
          return (
            <button
              key={statut}
              onClick={() => toggleStatut(statut)}
              className={`h-6 px-2 text-[11px] font-medium border transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {statut}
              <span className={`text-[10px] font-mono ml-1 ${active ? 'opacity-70' : 'text-muted-foreground'}`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
