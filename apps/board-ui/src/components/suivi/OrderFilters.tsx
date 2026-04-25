import type { OrderFilterState, FilterOptions } from '@/types/suivi-commandes'

interface OrderFiltersProps {
  filters: OrderFilterState
  onChange: (filters: OrderFilterState) => void
  options: FilterOptions
  statusCounts: Record<string, number>
}

export function OrderFilters({ filters, onChange, options, statusCounts }: OrderFiltersProps) {
  const hasFilters = filters.client !== '__all__' || filters.orderSearch || filters.articleSearch
    || filters.typesCommande.length > 0 || filters.statuts.length > 0

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
    onChange({ client: '__all__', orderSearch: '', articleSearch: '', typesCommande: [], statuts: [] })
  }

  return (
    <div className="bg-card border border-border">
      {/* Toolbar row */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
        <select
          value={filters.client}
          onChange={(e) => onChange({ ...filters, client: e.target.value })}
          className="h-7 px-2 text-[11px] border border-border bg-card outline-none focus:border-ring min-w-[160px]"
        >
          <option value="__all__">Tous les clients</option>
          {options.clients.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <input
          value={filters.orderSearch}
          onChange={(e) => onChange({ ...filters, orderSearch: e.target.value })}
          placeholder="Commande..."
          className="h-7 px-2 text-[11px] border border-border bg-card outline-none focus:border-ring placeholder:text-muted-foreground min-w-[120px]"
        />

        <input
          value={filters.articleSearch}
          onChange={(e) => onChange({ ...filters, articleSearch: e.target.value })}
          placeholder="Article..."
          className="h-7 px-2 text-[11px] border border-border bg-card outline-none focus:border-ring placeholder:text-muted-foreground min-w-[100px]"
        />

        <div className="w-px h-5 bg-border" />

        {options.typesCommande.map((type) => (
          <button
            key={type}
            onClick={() => toggleTypeCommande(type)}
            className={`h-7 px-2 text-[11px] font-medium border transition-colors ${
              filters.typesCommande.includes(type)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {type}
          </button>
        ))}

        {hasFilters && (
          <button
            onClick={clearAll}
            className="ml-auto h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Effacer
          </button>
        )}
      </div>

      {/* Statut filter row */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 flex-wrap">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">Statut</span>
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
