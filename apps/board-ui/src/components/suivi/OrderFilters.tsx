import type { OrderFilterState, FilterOptions } from '@/types/suivi-commandes'
import { Search, X, Users, Tag, AlertTriangle } from 'lucide-react'

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
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Toolbar row */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-border flex-wrap">
        {/* Client filter */}
        <div className="inline-flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-lg min-w-[180px] max-w-[280px]">
          <Users className="h-3 w-3 text-muted-foreground shrink-0" />
          <select
            value={filters.client}
            onChange={(e) => onChange({ ...filters, client: e.target.value })}
            className="flex-1 bg-transparent border-none outline-none text-xs text-foreground cursor-pointer"
          >
            <option value="__all__">Tous les clients</option>
            {options.clients.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Order search */}
        <div className="inline-flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-lg min-w-[140px]">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            value={filters.orderSearch}
            onChange={(e) => onChange({ ...filters, orderSearch: e.target.value })}
            placeholder="Commande..."
            className="flex-1 bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground"
          />
          {filters.orderSearch && (
            <button onClick={() => onChange({ ...filters, orderSearch: '' })} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Article search */}
        <div className="inline-flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-lg min-w-[120px]">
          <Search className="h-3 w-3 text-muted-foreground shrink-0" />
          <input
            value={filters.articleSearch}
            onChange={(e) => onChange({ ...filters, articleSearch: e.target.value })}
            placeholder="Article..."
            className="flex-1 bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground"
          />
          {filters.articleSearch && (
            <button onClick={() => onChange({ ...filters, articleSearch: '' })} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="w-px h-5 bg-border" />

        {/* Type commande toggles */}
        {options.typesCommande.map((type) => (
          <button
            key={type}
            onClick={() => toggleTypeCommande(type)}
            className={`inline-flex items-center gap-1 px-2.5 py-[5px] rounded-[7px] text-[11px] font-semibold transition-colors ${
              filters.typesCommande.includes(type)
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'bg-transparent text-muted-foreground border border-border hover:bg-muted'
            }`}
          >
            <Tag className="h-2.5 w-2.5" />
            {type}
          </button>
        ))}

        {/* Clear all */}
        {hasFilters && (
          <button
            onClick={clearAll}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
          >
            <X className="h-3 w-3" />
            Effacer filtres
          </button>
        )}
      </div>

      {/* Statut filter row */}
      <div className="flex items-center gap-1.5 px-3.5 py-2 flex-wrap">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider font-mono mr-1">Statut</span>
        {options.statuts.map((statut) => {
          const count = statusCounts[statut] ?? 0
          const active = filters.statuts.includes(statut)
          return (
            <button
              key={statut}
              onClick={() => toggleStatut(statut)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-[5px] rounded-[7px] text-[11px] font-semibold transition-colors ${
                active
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'bg-transparent text-muted-foreground border border-border hover:bg-muted'
              }`}
            >
              {statut === 'Retard Prod' && <AlertTriangle className="h-2.5 w-2.5" />}
              {statut}
              <span className={`text-[10px] font-bold px-1.5 py-[1px] rounded-full font-mono ${
                active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
