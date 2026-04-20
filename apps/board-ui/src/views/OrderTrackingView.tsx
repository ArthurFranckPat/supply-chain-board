import { useMemo, useState } from 'react'
import { Pill } from '@/components/ui/pill'
import { LoadingInline } from '@/components/ui/loading'
import type { OrderFilterState, FilterOptions, SuiviStatusResponse } from '@/types/suivi-commandes'
import { OrderFilters } from '@/components/suivi/OrderFilters'
import { OrderKpiBar } from '@/components/suivi/OrderKpiBar'
import { GroupedOrderTable } from '@/components/suivi/GroupedOrderTable'
import { ByClientTab } from '@/components/suivi/ByClientTab'
import { ByEtatTab } from '@/components/suivi/ByEtatTab'
import { ExportBar } from '@/components/suivi/ExportBar'
import {
  ShoppingCart, Users, BarChart3, RefreshCw,
} from 'lucide-react'

const DEFAULT_FILTERS: OrderFilterState = {
  client: '__all__',
  orderSearch: '',
  articleSearch: '',
  typesCommande: [],
  statuts: [],
}

const TABS = [
  { k: 'commandes', label: 'Commandes', icon: <ShoppingCart className="h-3 w-3" /> },
  { k: 'par-client', label: 'Par Client', icon: <Users className="h-3 w-3" /> },
  { k: 'par-etat', label: 'Par Statut', icon: <BarChart3 className="h-3 w-3" /> },
]

interface OrderTrackingViewProps {
  data: SuiviStatusResponse | null
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  onReload: () => void
}

export function OrderTrackingView({ data, loadState, onReload }: OrderTrackingViewProps) {
  const [filters, setFilters] = useState<OrderFilterState>(DEFAULT_FILTERS)
  const [activeTab, setActiveTab] = useState('commandes')

  // Extract filter options from raw data
  const options: FilterOptions = useMemo(() => {
    if (!data) return { clients: [], typesCommande: [], statuts: [] }
    const clients = [...new Set(data.rows.map((r) => r['Nom client commande']))].sort()
    const typesCommande = [...new Set(data.rows.map((r) => r['Type commande']))].filter(Boolean).sort()
    const statuts = Object.keys(data.status_counts).sort()
    return { clients, typesCommande, statuts }
  }, [data])

  // Apply all filters
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

  // Loading state
  if (loadState === 'loading') {
    return <LoadingInline label="des commandes" />
  }

  // Error / no data
  if (!data || data.rows.length === 0) {
    return (
      <div className="bg-card border border-dashed border-border rounded-2xl py-16 text-center">
        <div className="flex items-center justify-center mb-3">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <p className="font-semibold text-muted-foreground">Aucune commande</p>
        <p className="text-sm text-muted-foreground mt-1">
          {loadState === 'error'
            ? 'Erreur lors du chargement. Vérifiez que l\u2019API suivi-commandes est démarrée (port 8001).'
            : 'Vérifiez que l\u2019API suivi-commandes est démarrée (port 8001).'}
        </p>
        {loadState === 'error' && (
          <button
            onClick={onReload}
            className="mt-3 text-xs font-medium text-primary hover:text-primary/80 underline underline-offset-2 inline-flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            R\u00e9essayer
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* KPI bar */}
      <OrderKpiBar rows={filteredRows} statusCounts={data.status_counts} />

      {/* Filters */}
      <OrderFilters
        filters={filters}
        onChange={setFilters}
        options={options}
        statusCounts={data.status_counts}
      />

      {/* Main card with tabs */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Tab bar + actions */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
          <div className="flex items-center gap-0.5">
            {TABS.map((tb) => {
              const isActive = activeTab === tb.k
              return (
                <button
                  key={tb.k}
                  onClick={() => setActiveTab(tb.k)}
                  className={`inline-flex items-center gap-1.5 px-3 py-[7px] text-xs font-semibold rounded-[7px] transition-colors ${
                    isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'
                  }`}
                >
                  {tb.icon}
                  {tb.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onReload}
              className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Actualiser
            </button>
            <ExportBar rows={filteredRows} />
          </div>
        </div>

        {/* Tab content */}
        <div className="p-0">
          {activeTab === 'commandes' && <GroupedOrderTable rows={filteredRows} />}
          {activeTab === 'par-client' && (
            <div className="p-3.5">
              <ByClientTab rows={filteredRows} />
            </div>
          )}
          {activeTab === 'par-etat' && (
            <div className="p-3.5">
              <ByEtatTab rows={filteredRows} />
            </div>
          )}
        </div>
      </section>

      {/* Footer summary */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground px-1">
        <span>{filteredRows.length} ligne{filteredRows.length !== 1 ? 's' : ''}</span>
        <span className="text-border">|</span>
        <span>{new Set(filteredRows.map((r) => r['No commande'])).size} commandes</span>
        <span className="text-border">|</span>
        {Object.entries(data.status_counts).map(([status, count]) => (
          <span key={status}>
            <Pill tone={status === 'Retard Prod' ? 'danger' : 'default'}>{status}: {count}</Pill>
          </span>
        ))}
      </div>
    </div>
  )
}
