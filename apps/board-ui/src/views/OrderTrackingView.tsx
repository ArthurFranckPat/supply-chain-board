import { useMemo, useState } from 'react'
import { LoadingInline } from '@/components/ui/loading'
import type { OrderFilterState, FilterOptions, SuiviStatusResponse } from '@/types/suivi-commandes'
import { OrderFilters } from '@/components/suivi/OrderFilters'
import { OrderKpiBar } from '@/components/suivi/OrderKpiBar'
import { GroupedOrderTable } from '@/components/suivi/GroupedOrderTable'
import { ByClientTab } from '@/components/suivi/ByClientTab'
import { ByEtatTab } from '@/components/suivi/ByEtatTab'
import { ExportBar } from '@/components/suivi/ExportBar'

const DEFAULT_FILTERS: OrderFilterState = {
  client: '__all__',
  orderSearch: '',
  articleSearch: '',
  typesCommande: [],
  statuts: [],
}

const TABS = [
  { k: 'commandes', label: 'Commandes' },
  { k: 'par-client', label: 'Par Client' },
  { k: 'par-etat', label: 'Par Statut' },
]

interface OrderTrackingViewProps {
  data: SuiviStatusResponse | null
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  onReload: () => void
}

export function OrderTrackingView({ data, loadState, onReload }: OrderTrackingViewProps) {
  const [filters, setFilters] = useState<OrderFilterState>(DEFAULT_FILTERS)
  const [activeTab, setActiveTab] = useState('commandes')

  const options: FilterOptions = useMemo(() => {
    if (!data) return { clients: [], typesCommande: [], statuts: [] }
    const clients = [...new Set(data.rows.map((r) => r['Nom client commande']))].sort()
    const typesCommande = [...new Set(data.rows.map((r) => r['Type commande']))].filter(Boolean).sort()
    const statuts = Object.keys(data.status_counts).sort()
    return { clients, typesCommande, statuts }
  }, [data])

  const filteredRows = useMemo(() => {
    if (!data) return []
    return data.rows.filter((r) => {
      if (filters.client !== '__all__' && r['Nom client commande'] !== filters.client) return false
      if (filters.orderSearch && !r['No commande'].toLowerCase().includes(filters.orderSearch.toLowerCase())) return false
      if (filters.articleSearch && !r.Article.toLowerCase().includes(filters.articleSearch.toLowerCase())) return false
      if (filters.typesCommande.length > 0 && !filters.typesCommande.includes(r['Type commande'])) return false
      if (filters.statuts.length > 0 && !filters.statuts.includes(r.Statut)) return false
      return true
    })
  }, [data, filters])

  if (loadState === 'loading') {
    return <LoadingInline label="des commandes" />
  }

  if (!data || data.rows.length === 0) {
    return (
      <div className="bg-card border border-dashed border-border py-6 text-center">
        <p className="text-xs text-muted-foreground">
          {loadState === 'error'
            ? 'Erreur lors du chargement. Vérifiez que l\'API suivi-commandes est démarrée (port 8001).'
            : 'Aucune commande'}
        </p>
        {loadState === 'error' && (
          <button
            onClick={onReload}
            className="mt-2 text-[11px] text-primary hover:text-primary/80 underline"
          >
            Réessayer
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <OrderKpiBar rows={filteredRows} statusCounts={data.status_counts} />

      <OrderFilters
        filters={filters}
        onChange={setFilters}
        options={options}
        statusCounts={data.status_counts}
      />

      <div className="bg-card border border-border overflow-hidden">
        <div className="flex items-center justify-between px-2 py-1 border-b border-border">
          <div className="flex items-center gap-0">
            {TABS.map((tb) => {
              const isActive = activeTab === tb.k
              return (
                <button
                  key={tb.k}
                  onClick={() => setActiveTab(tb.k)}
                  className={`h-[26px] px-3 text-[11px] font-semibold border border-transparent border-b-0 -mb-px transition-colors ${
                    isActive ? 'bg-card text-foreground border-border relative after:absolute after:inset-x-0 after:top-0 after:h-[2px] after:bg-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tb.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onReload}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Actualiser
            </button>
            <ExportBar rows={filteredRows} />
          </div>
        </div>

        <div>
          {activeTab === 'commandes' && <GroupedOrderTable rows={filteredRows} />}
          {activeTab === 'par-client' && (
            <div className="p-2">
              <ByClientTab rows={filteredRows} />
            </div>
          )}
          {activeTab === 'par-etat' && (
            <div className="p-2">
              <ByEtatTab rows={filteredRows} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
        <span>{filteredRows.length} ligne{filteredRows.length !== 1 ? 's' : ''}</span>
        <span>|</span>
        <span>{new Set(filteredRows.map((r) => r['No commande'])).size} commandes</span>
        {Object.entries(data.status_counts).map(([status, count]) => (
          <span key={status} className={status === 'Retard Prod' ? 'text-destructive font-semibold' : ''}>{status}: {count}</span>
        ))}
      </div>
    </div>
  )
}
