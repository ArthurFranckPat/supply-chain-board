import { useState } from 'react'
import { apiClient } from '@/api/client'
import { GridTable, type GridTableColumn } from '@/components/ui/GridTable'
import { cn } from '@/lib/utils'
import type { OrderSearchResult } from '@/types/feasibility'

export interface RescheduleTabProps {
  loading: boolean
  depthMode: 'full' | 'level1'
  useReceptions: boolean
  onDepthModeChange: (mode: 'full' | 'level1') => void
  onUseReceptionsChange: (value: boolean) => void
  onReschedule: (params: {
    num_commande: string
    article: string
    new_date: string
    new_quantity?: number
    depth_mode: string
    use_receptions: boolean
  }) => void
  onResetMutations: () => void
}

export function RescheduleTab({
  loading,
  depthMode,
  useReceptions,
  onDepthModeChange,
  onUseReceptionsChange,
  onReschedule,
  onResetMutations,
}: RescheduleTabProps) {
  const [rescheduleQuery, setRescheduleQuery] = useState('')
  const [orderResults, setOrderResults] = useState<OrderSearchResult[]>([])
  const [selectedOrder, setSelectedOrder] = useState<OrderSearchResult | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleQty, setRescheduleQty] = useState<number | ''>('')
  const [orderSearchLoading, setOrderSearchLoading] = useState(false)
  const [orderSearchError, setOrderSearchError] = useState<string | null>(null)

  const handleOrderSearch = async () => {
    if (!rescheduleQuery || rescheduleQuery.length < 2) return
    setOrderSearchLoading(true)
    setOrderSearchError(null)
    setSelectedOrder(null)
    onResetMutations()
    try {
      const res = await apiClient.searchOrders(rescheduleQuery, 30)
      setOrderResults(res.orders)
      if (res.orders.length === 0) {
        setOrderSearchError('Aucune commande trouvee')
      }
    } catch (err) {
      setOrderSearchError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setOrderSearchLoading(false)
    }
  }

  const handleSelectOrder = (order: OrderSearchResult) => {
    setSelectedOrder(order)
    onResetMutations()
  }

  const handleReschedule = () => {
    if (!selectedOrder || !rescheduleDate) return
    onReschedule({
      num_commande: selectedOrder.num_commande,
      article: selectedOrder.article,
      new_date: rescheduleDate,
      ...(rescheduleQty !== '' && rescheduleQty !== selectedOrder.quantity ? { new_quantity: rescheduleQty } : {}),
      depth_mode: depthMode,
      use_receptions: useReceptions,
    })
  }

  const handleDeselectOrder = () => {
    setSelectedOrder(null)
    onResetMutations()
  }

  const columns: GridTableColumn<OrderSearchResult>[] = [
    { key: 'num_commande', header: 'Commande', width: '110px', cell: (o) => <span className="font-mono font-semibold">{o.num_commande}</span> },
    { key: 'client', header: 'Client', width: '120px', cell: (o) => <span className="truncate">{o.client}</span> },
    { key: 'article', header: 'Article', width: '100px', cell: (o) => <span className="font-mono">{o.article}</span> },
    { key: 'description', header: 'Description', width: '1fr', cell: (o) => <span className="text-muted-foreground truncate">{o.description}</span> },
    { key: 'type', header: 'Type', align: 'center', width: '60px', cell: (o) => (
      <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-semibold',
        o.type_commande === 'MTS' ? 'bg-emerald-50 text-emerald-700' :
        o.type_commande === 'MTO' ? 'bg-violet-50 text-violet-700' :
        'bg-muted text-muted-foreground'
      )}>
        {o.type_commande}
      </span>
    ) },
    { key: 'qty', header: 'Qté rest.', align: 'right', width: '80px', cell: (o) => <span className="tabular-nums font-mono font-semibold">{o.quantity}</span> },
    { key: 'qty_cmd', header: 'Qté cmd', align: 'right', width: '80px', cell: (o) => <span className="tabular-nums font-mono text-muted-foreground">{o.quantity_ordered}</span> },
    { key: 'date', header: 'Date expé', align: 'right', width: '110px', cell: (o) => (
      <span>{o.date_expedition ? new Date(o.date_expedition).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}</span>
    ) },
  ]

  return (
    <>
      {/* Step 1: Search */}
      <div className="bg-card border border-border rounded-sm p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[11px] font-medium text-muted-foreground mb-1">Commande ou article</label>
            <input
              type="text"
              value={rescheduleQuery}
              onChange={(e) => setRescheduleQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleOrderSearch()}
              placeholder="N commande, code article, client..."
              className="w-full px-3 py-2 border border-border rounded-sm text-sm bg-background"
            />
          </div>
          <button onClick={handleOrderSearch} disabled={orderSearchLoading || rescheduleQuery.length < 2}
            className="bg-primary text-white px-4 py-2 rounded-sm text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
            Rechercher
          </button>
        </div>
      </div>

      {/* Step 2: Order selection */}
      {orderResults.length > 0 && !selectedOrder && (
        <div className="bg-card border border-border rounded-sm overflow-hidden">
          <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
            <p className="text-[11px] font-semibold">{orderResults.length} ligne(s) trouvee(s)</p>
            <p className="text-[10px] text-muted-foreground">Cliquez sur une ligne pour la selectionner</p>
          </div>
          <GridTable
            columns={columns}
            data={orderResults}
            keyExtractor={(o, i) => `${o.num_commande}-${o.article}-${i}`}
            maxHeight="320px"
            onRowClick={handleSelectOrder}
            emptyMessage="Aucune commande trouvee"
          />
        </div>
      )}

      {/* Step 3: Selected order + simulate */}
      {selectedOrder && (
        <div className="bg-card border border-border rounded-sm p-3">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[10px] text-muted-foreground font-mono uppercase">Commande selectionnee</p>
              <p className="text-sm font-semibold mt-0.5">
                {selectedOrder.num_commande} / <span className="font-mono">{selectedOrder.article}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedOrder.client} &middot; {selectedOrder.description} &middot; {selectedOrder.quantity} unites restantes
              </p>
              <p className="text-xs text-muted-foreground">
                Date actuelle: <strong>
                  {selectedOrder.date_expedition
                    ? new Date(selectedOrder.date_expedition).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                    : 'N/A'}
                </strong>
              </p>
            </div>
            <button onClick={handleDeselectOrder}
              className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition-colors">
              Changer
            </button>
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <div className="w-44">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Nouvelle date</label>
              <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-sm text-sm bg-background" />
            </div>
            <div className="w-28">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                Quantite <span className="text-muted-foreground/60">({selectedOrder.quantity})</span>
              </label>
              <input
                type="number"
                value={rescheduleQty === '' ? selectedOrder.quantity : rescheduleQty}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setRescheduleQty(v === selectedOrder.quantity ? '' : v)
                }}
                min={1}
                placeholder={String(selectedOrder.quantity)}
                className="w-full px-3 py-2 border border-border rounded-sm text-sm bg-background"
              />
            </div>
            <button onClick={handleReschedule} disabled={loading || !rescheduleDate}
              className="bg-primary text-white px-4 py-2 rounded-sm text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              Simuler
            </button>
            <select value={depthMode} onChange={(e) => onDepthModeChange(e.target.value as 'full' | 'level1')}
              className="px-2 py-2 border border-border rounded-sm text-[11px] bg-background text-muted-foreground">
              <option value="full">Nomenclature complete</option>
              <option value="level1">Niveau 1 uniquement</option>
            </select>
            <button
              type="button"
              onClick={() => onUseReceptionsChange(!useReceptions)}
              className={`px-2.5 py-2 rounded-sm text-[11px] font-semibold border transition-colors ${
                useReceptions
                  ? 'bg-primary/10 border-primary/20 text-primary'
                  : 'bg-background border-border text-muted-foreground'
              }`}
              title={useReceptions ? 'Stock + receptions prevues avant la date' : 'Stock disponible uniquement'}
            >
              {useReceptions ? 'Stock + receptions' : 'Stock immediat'}
            </button>
          </div>
        </div>
      )}

      {orderSearchError && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-sm text-sm">
          {orderSearchError}
        </div>
      )}
    </>
  )
}
