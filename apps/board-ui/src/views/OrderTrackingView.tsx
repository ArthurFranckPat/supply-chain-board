import { useMemo, useState } from 'react'
import { LoadingInline } from '@/components/ui/loading'
import type { OrderFilterState, FilterOptions, SuiviStatusResponse } from '@/types/suivi-commandes'
import { OrderFilters } from '@/components/suivi/OrderFilters'
import { OrderKpiBar } from '@/components/suivi/OrderKpiBar'
import { GroupedOrderTable } from '@/components/suivi/GroupedOrderTable'
import { ExportBar } from '@/components/suivi/ExportBar'
import { RetardChargeChart } from '@/components/suivi/RetardChargeChart'
import { PaletteView } from '@/components/suivi/PaletteView'

const DEFAULT_FILTERS: OrderFilterState = {
  search: '',
  typesCommande: [],
  statuts: [],
}

const TABS = [
  { k: 'commandes', label: 'Carnet de commandes' },
  { k: 'retard', label: 'Analyse Retard' },
  { k: 'logistique', label: 'Logistique' },
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
    if (!data) return { typesCommande: [], statuts: [] }
    const typesCommande = [...new Set(data.rows.map((r) => r['Type commande']))].filter(Boolean).sort()
    const statuts = Object.keys(data.status_counts).sort()
    return { typesCommande, statuts }
  }, [data])

  const filteredRows = useMemo(() => {
    if (!data) return []
    const q = filters.search.trim().toLowerCase()

    const result = data.rows.filter((r) => {
      let searchMatches = true

      if (q) {
        const words = q.split(/\s+/).filter(Boolean)

        // Single word that looks like an identifier (no spaces) → exact prefix match on id fields only
        if (words.length === 1) {
          const w = words[0]
          searchMatches =
            r['No commande'].toLowerCase().startsWith(w) ||
            r.Article.toLowerCase().startsWith(w)
        } else {
          // Multi-word → match all words anywhere (commande, article, description, client)
          const haystack = [
            r['No commande'],
            r.Article,
            r['Désignation 1'] ?? '',
            r['Nom client commande'],
          ].join(' ').toLowerCase()
          searchMatches = words.every((word) => haystack.includes(word))
        }
      }

      if (!searchMatches) return false
      if (filters.typesCommande.length > 0 && !filters.typesCommande.includes(r['Type commande'])) return false
      if (filters.statuts.length > 0 && !filters.statuts.includes(r.Statut)) return false
      return true
    })

    return result
  }, [data, filters])

  const cqAlertCount = useMemo(
    () => filteredRows.filter((r) => r['_alerte_cq_statut'] === true || r['_allocation_virtuelle_avec_cq'] === true).length,
    [filteredRows],
  )

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
          {activeTab === 'retard' && (
            <div className="p-4">
              <RetardChargeChart />
            </div>
          )}
          {activeTab === 'logistique' && <PaletteView />}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-t border-border text-[10px]">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            <span className="font-mono font-bold text-foreground tabular-nums">{filteredRows.length}</span> lignes
          </span>
          <span className="text-border">|</span>
          <span className="text-muted-foreground">
            <span className="font-mono font-bold text-foreground tabular-nums">{new Set(filteredRows.map((r) => r['No commande'])).size}</span> commandes
          </span>
        </div>
        <div className="flex items-center gap-2">
          {Object.entries(data.status_counts).map(([status, count]) => {
            const colorDot =
              status === 'Retard Prod' ? 'bg-red-500' :
              status === 'Allocation à faire' ? 'bg-sky-500' :
              status === 'A Expédier' ? 'bg-emerald-500' :
              'bg-slate-400'
            return (
              <span key={status} className="flex items-center gap-1 text-muted-foreground">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${colorDot}`} />
                {status}: <span className="font-mono font-semibold text-foreground tabular-nums">{count}</span>
              </span>
            )
          })}
          <span className="text-border">|</span>
          <span
            className="flex items-center gap-1 text-amber-700"
            title="Lignes dépendantes du stock sous contrôle qualité (allocation virtuelle ou expédition)."
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
            CQ: <span className="font-mono font-semibold text-foreground tabular-nums">{cqAlertCount}</span>
          </span>
        </div>
      </div>
    </div>
  )
}
