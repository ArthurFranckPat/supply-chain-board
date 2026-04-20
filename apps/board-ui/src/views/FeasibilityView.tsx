import { useState, useCallback, Fragment } from 'react'
import { apiClient, ApiError } from '@/api/client'
import type { FeasibilityResponse, CapacityImpact, AffectedOrder, BOMNode, ArticleSearchResult, OrderSearchResult } from '@/types/feasibility'
import { ChevronDown, ChevronRight } from 'lucide-react'

type TabKey = 'check' | 'promise' | 'reschedule'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'check', label: 'Verification' },
  { key: 'promise', label: 'Date promise' },
  { key: 'reschedule', label: 'Replanification' },
]

export function FeasibilityView() {
  const [activeTab, setActiveTab] = useState<TabKey>('check')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FeasibilityResponse | null>(null)

  // Check tab
  const [checkArticle, setCheckArticle] = useState('')
  const [checkQty, setCheckQty] = useState(10)
  const [checkDate, setCheckDate] = useState('')

  // Promise tab
  const [promiseArticle, setPromiseArticle] = useState('')
  const [promiseQty, setPromiseQty] = useState(10)

  // Reschedule tab - two-step flow
  const [rescheduleQuery, setRescheduleQuery] = useState('')
  const [orderResults, setOrderResults] = useState<OrderSearchResult[]>([])
  const [selectedOrder, setSelectedOrder] = useState<OrderSearchResult | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleQty, setRescheduleQty] = useState<number | ''>('')
  const [orderSearchLoading, setOrderSearchLoading] = useState(false)

  // Autocomplete for article inputs
  const [suggestions, setSuggestions] = useState<ArticleSearchResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState<'check' | 'promise' | null>(null)

  // Depth mode (shared across tabs)
  const [depthMode, setDepthMode] = useState<'full' | 'level1'>('full')

  // Stock mode: immediate (stock only) vs projected (stock + receptions)
  const [useReceptions, setUseReceptions] = useState(true)

  const handleArticleSearch = useCallback(async (query: string, target: 'check' | 'promise') => {
    if (query.length < 2) {
      setSuggestions([])
      setShowSuggestions(null)
      return
    }
    try {
      const res = await apiClient.searchArticles(query, 8)
      setSuggestions(res.articles)
      setShowSuggestions(target)
    } catch {
      setSuggestions([])
    }
  }, [])

  const handleCheck = async () => {
    if (!checkArticle || !checkDate) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiClient.checkFeasibility({
        article: checkArticle,
        quantity: checkQty,
        desired_date: checkDate,
        depth_mode: depthMode,
        use_receptions: useReceptions,
      })
      setResult(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const handlePromise = async () => {
    if (!promiseArticle) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiClient.findPromiseDate({
        article: promiseArticle,
        quantity: promiseQty,
      })
      setResult(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  // Step 1: search orders by num_commande OR article
  const handleOrderSearch = async () => {
    if (!rescheduleQuery || rescheduleQuery.length < 2) return
    setOrderSearchLoading(true)
    setSelectedOrder(null)
    setResult(null)
    setError(null)
    try {
      const res = await apiClient.searchOrders(rescheduleQuery, 30)
      setOrderResults(res.orders)
      if (res.orders.length === 0) {
        setError('Aucune commande trouvee')
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur')
    } finally {
      setOrderSearchLoading(false)
    }
  }

  // Step 2: select an order line
  const handleSelectOrder = (order: OrderSearchResult) => {
    setSelectedOrder(order)
    setResult(null)
    setError(null)
  }

  // Step 3: run simulation
  const handleReschedule = async () => {
    if (!selectedOrder || !rescheduleDate) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await apiClient.simulateReschedule({
        num_commande: selectedOrder.num_commande,
        article: selectedOrder.article,
        new_date: rescheduleDate,
        ...(rescheduleQty !== '' && rescheduleQty !== selectedOrder.quantity ? { new_quantity: rescheduleQty } : {}),
        depth_mode: depthMode,
        use_receptions: useReceptions,
      })
      setResult(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  const resetTab = (tab: TabKey) => {
    setActiveTab(tab)
    setResult(null)
    setError(null)
    if (tab === 'reschedule') {
      setOrderResults([])
      setSelectedOrder(null)
      setRescheduleDate('')
      setRescheduleQty('')
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => resetTab(tab.key)}
            className={`px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
              activeTab === tab.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Check tab ──────────────────────────────────────────── */}
      {activeTab === 'check' && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Article</label>
              <input
                type="text"
                value={checkArticle}
                onChange={(e) => { setCheckArticle(e.target.value); handleArticleSearch(e.target.value, 'check') }}
                onFocus={() => checkArticle.length >= 2 && handleArticleSearch(checkArticle, 'check')}
                placeholder="Code article..."
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
              />
              {showSuggestions === 'check' && suggestions.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-48 overflow-auto">
                  {suggestions.map((s) => (
                    <button key={s.code} onClick={() => { setCheckArticle(s.code); setShowSuggestions(null) }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors">
                      <span className="font-mono font-semibold">{s.code}</span>
                      <span className="text-muted-foreground ml-2">{s.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="w-24">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Quantite</label>
              <input type="number" value={checkQty} onChange={(e) => setCheckQty(Number(e.target.value))} min={1}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background" />
            </div>
            <div className="w-40">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Date souhaitee</label>
              <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background" />
            </div>
            <button onClick={handleCheck} disabled={loading || !checkArticle || !checkDate}
              className="bg-primary text-white px-4 py-2 rounded-md text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              Verifier
            </button>
            <select value={depthMode} onChange={(e) => setDepthMode(e.target.value as 'full' | 'level1')}
              className="px-2 py-2 border border-border rounded-md text-[11px] bg-background text-muted-foreground">
              <option value="full">Nomenclature complete</option>
              <option value="level1">Niveau 1 uniquement</option>
            </select>
            <button
              type="button"
              onClick={() => setUseReceptions(!useReceptions)}
              className={`px-2.5 py-2 rounded-md text-[11px] font-semibold border transition-colors ${
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

      {/* ── Promise tab ────────────────────────────────────────── */}
      {activeTab === 'promise' && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Article</label>
              <input
                type="text"
                value={promiseArticle}
                onChange={(e) => { setPromiseArticle(e.target.value); handleArticleSearch(e.target.value, 'promise') }}
                onFocus={() => promiseArticle.length >= 2 && handleArticleSearch(promiseArticle, 'promise')}
                placeholder="Code article..."
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
              />
              {showSuggestions === 'promise' && suggestions.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-card border border-border rounded-md shadow-lg max-h-48 overflow-auto">
                  {suggestions.map((s) => (
                    <button key={s.code} onClick={() => { setPromiseArticle(s.code); setShowSuggestions(null) }}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors">
                      <span className="font-mono font-semibold">{s.code}</span>
                      <span className="text-muted-foreground ml-2">{s.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="w-24">
              <label className="block text-[11px] font-medium text-muted-foreground mb-1">Quantite</label>
              <input type="number" value={promiseQty} onChange={(e) => setPromiseQty(Number(e.target.value))} min={1}
                className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background" />
            </div>
            <button onClick={handlePromise} disabled={loading || !promiseArticle}
              className="bg-primary text-white px-4 py-2 rounded-md text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
              Trouver date
            </button>
          </div>
        </div>
      )}

      {/* ── Reschedule tab (two-step flow) ─────────────────────── */}
      {activeTab === 'reschedule' && (
        <>
          {/* Step 1: Search */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[240px]">
                <label className="block text-[11px] font-medium text-muted-foreground mb-1">Commande ou article</label>
                <input
                  type="text"
                  value={rescheduleQuery}
                  onChange={(e) => setRescheduleQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleOrderSearch()}
                  placeholder="N commande, code article, client..."
                  className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
                />
              </div>
              <button onClick={handleOrderSearch} disabled={orderSearchLoading || rescheduleQuery.length < 2}
                className="bg-primary text-white px-4 py-2 rounded-md text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                Rechercher
              </button>
            </div>
          </div>

          {/* Step 2: Order selection */}
          {orderResults.length > 0 && !selectedOrder && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold">{orderResults.length} ligne(s) trouvee(s)</p>
                <p className="text-[10px] text-muted-foreground">Cliquez sur une ligne pour la selectionner</p>
              </div>
              <div className="overflow-auto max-h-[320px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Commande</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Client</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Article</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Description</th>
                      <th className="text-center px-3 py-2 font-medium text-muted-foreground">Type</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qte restante</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qte commandee</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Date expedition</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderResults.map((order, i) => (
                      <tr key={`${order.num_commande}-${order.article}-${i}`}
                        onClick={() => handleSelectOrder(order)}
                        className="border-t border-border hover:bg-accent/50 cursor-pointer transition-colors">
                        <td className="px-4 py-2.5 font-mono font-semibold">{order.num_commande}</td>
                        <td className="px-3 py-2.5 max-w-[120px] truncate">{order.client}</td>
                        <td className="px-3 py-2.5 font-mono">{order.article}</td>
                        <td className="px-3 py-2.5 text-muted-foreground max-w-[180px] truncate">{order.description}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            order.type_commande === 'MTS' ? 'bg-blue/10 text-blue' :
                            order.type_commande === 'MTO' ? 'bg-purple/10 text-purple' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {order.type_commande}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold">{order.quantity}</td>
                        <td className="px-3 py-2.5 text-right text-muted-foreground">{order.quantity_ordered}</td>
                        <td className="px-4 py-2.5 text-right">
                          {order.date_expedition
                            ? new Date(order.date_expedition).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3: Selected order + simulate */}
          {selectedOrder && (
            <div className="bg-card border border-border rounded-xl p-5">
              {/* Selected order summary */}
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
                <button onClick={() => { setSelectedOrder(null); setResult(null) }}
                  className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent transition-colors">
                  Changer
                </button>
              </div>

              {/* New date + quantity + simulate */}
              <div className="flex items-end gap-3">
                <div className="w-44">
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Nouvelle date</label>
                  <input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background" />
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
                    className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background"
                  />
                </div>
                <button onClick={handleReschedule} disabled={loading || !rescheduleDate}
                  className="bg-primary text-white px-4 py-2 rounded-md text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  Simuler
                </button>
                <select value={depthMode} onChange={(e) => setDepthMode(e.target.value as 'full' | 'level1')}
                  className="px-2 py-2 border border-border rounded-md text-[11px] bg-background text-muted-foreground">
                  <option value="full">Nomenclature complete</option>
                  <option value="level1">Niveau 1 uniquement</option>
                </select>
                <button
                  type="button"
                  onClick={() => setUseReceptions(!useReceptions)}
                  className={`px-2.5 py-2 rounded-md text-[11px] font-semibold border transition-colors ${
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
        </>
      )}

      {/* Error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Analyse en cours...
        </div>
      )}

      {/* Results */}
      {result && <FeasibilityResultDisplay result={result} />}
    </div>
  )
}

function FeasibilityResultDisplay({ result }: { result: FeasibilityResponse }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground font-mono uppercase">{result.article}</p>
            <p className="text-sm font-semibold">{result.description}</p>
            <p className="text-xs text-muted-foreground mt-1">{result.quantity} unites</p>
          </div>
          <div className="text-right">
            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold ${
              result.feasible ? 'bg-green/10 text-green' : 'bg-destructive/10 text-destructive'
            }`}>
              <span className={`w-2 h-2 rounded-full ${result.feasible ? 'bg-green' : 'bg-destructive'}`} />
              {result.feasible ? 'Faisable' : 'Non faisable'}
            </span>
            {result.feasible_date && (
              <p className="text-xs text-muted-foreground mt-1.5">
                Date feasible: <strong>{new Date(result.feasible_date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</strong>
                {result.desired_date && result.feasible_date !== result.desired_date && (
                  <span className="text-orange ml-1"> (au lieu du {new Date(result.desired_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })})</span>
                )}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground mt-0.5">{result.computation_ms}ms</p>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {result.alerts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-[11px] font-semibold text-amber-800 mb-1">Alertes</p>
          {result.alerts.map((alert, i) => (
            <p key={i} className="text-xs text-amber-700">{alert}</p>
          ))}
        </div>
      )}

      {/* Reschedule context: original vs new */}
      {result.original_date && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center gap-6 text-xs">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-0.5">Original</p>
              <p className="font-semibold">
                {new Date(result.original_date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                {result.original_quantity != null && <span className="text-muted-foreground font-normal ml-2">x{result.original_quantity}</span>}
              </p>
            </div>
            <span className="text-muted-foreground text-lg">&rarr;</span>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-0.5">Simulation</p>
              <p className="font-semibold">
                {result.desired_date
                  ? new Date(result.desired_date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
                  : '-'}
                <span className="text-muted-foreground font-normal ml-2">x{result.quantity}</span>
              </p>
            </div>
            {result.original_quantity != null && result.quantity !== result.original_quantity && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                result.quantity > result.original_quantity ? 'bg-amber-100 text-amber-800' : 'bg-green/10 text-green'
              }`}>
                {result.quantity > result.original_quantity ? '+' : ''}{result.quantity - result.original_quantity} unites
              </span>
            )}
          </div>
        </div>
      )}

      {/* BOM Tree - complete nomenclature view */}
      {result.bom_tree.length > 0 && (
        <BOMTree nodes={result.bom_tree} depthMode={result.depth_mode} />
      )}

      {/* Capacity impacts */}
      {result.capacity_impacts.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-xs font-semibold">Capacite atelier</p>
          </div>
          <div className="divide-y divide-border">
            {result.capacity_impacts.map((impact: CapacityImpact) => (
              <div key={impact.poste_charge} className="px-5 py-3 flex items-center gap-4">
                <div className="min-w-[160px]">
                  <p className="text-xs font-medium">{impact.poste_label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{impact.poste_charge}</p>
                </div>
                <div className="flex-1">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${impact.utilization_pct > 100 ? 'bg-destructive' : impact.utilization_pct > 80 ? 'bg-amber-500' : 'bg-green'}`}
                      style={{ width: `${Math.min(impact.utilization_pct, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right min-w-[120px]">
                  <p className="text-xs">{impact.hours_required}h / {impact.hours_available}h</p>
                  <p className={`text-[10px] font-semibold ${impact.utilization_pct > 100 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {impact.utilization_pct}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Affected orders (reschedule only) */}
      {result.affected_orders.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-xs font-semibold">Commandes impactees ({result.affected_orders.length})</p>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-5 py-2 font-medium text-muted-foreground">Commande</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Client</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Article</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Qte</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Date originale</th>
                <th className="text-right px-5 py-2 font-medium text-muted-foreground">Impact</th>
              </tr>
            </thead>
            <tbody>
              {result.affected_orders.map((order: AffectedOrder, i: number) => (
                <tr key={`${order.num_commande}-${i}`} className="border-t border-border">
                  <td className="px-5 py-2 font-mono">{order.num_commande}</td>
                  <td className="px-3 py-2">{order.client}</td>
                  <td className="px-3 py-2 font-mono">{order.article}</td>
                  <td className="px-3 py-2 text-right">{order.quantity}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{order.original_date}</td>
                  <td className="px-5 py-2 text-right">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      order.impact === 'delayed' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                    }`}>
                      {order.impact}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Collapsible BOM tree with stock status per component. */
function BOMTree({ nodes, depthMode }: { nodes: BOMNode[]; depthMode: string; useReceptions?: boolean }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [filterShortages, setFilterShortages] = useState(false)

  function toggle(article: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(article)) next.delete(article)
      else next.add(article)
      return next
    })
  }

  function countShortages(nodes: BOMNode[]): number {
    let count = 0
    for (const n of nodes) {
      if (n.status === 'shortage') count++
      if (n.children.length > 0) count += countShortages(n.children)
    }
    return count
  }

  function hasShortage(node: BOMNode): boolean {
    if (node.status === 'shortage') return true
    return node.children.some(hasShortage)
  }

  function renderNode(node: BOMNode, depth: number) {
    if (filterShortages && !hasShortage(node)) return null

    const hasChildren = node.children.length > 0
    const isCollapsed = collapsed.has(node.article)

    return (
      <Fragment key={`${depth}-${node.article}`}>
        <div
          className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/40 cursor-pointer"
          style={{ paddingLeft: `${12 + depth * 20}px` }}
          onClick={() => hasChildren && toggle(node.article)}
        >
          {hasChildren ? (
            isCollapsed
              ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}

          <span className={`w-2 h-2 rounded-full shrink-0 ${
            node.status === 'ok' ? 'bg-green' :
            node.status === 'shortage' ? 'bg-destructive' :
            'bg-muted-foreground/40'
          }`} />

          <span className="font-mono font-semibold text-[12px] min-w-[90px]">{node.article}</span>
          <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">{node.description}</span>

          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
            node.is_purchase ? 'bg-blue/10 text-blue' : 'bg-purple/10 text-purple'
          }`}>
            {node.is_purchase ? 'ACH' : 'FAB'}
          </span>

          <span className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground shrink-0 tabular-nums">
            <span title="Quantite par unite">x{node.quantity_per_unit}</span>
            <span className="text-foreground font-medium" title="Besoin total">{Math.round(node.quantity_needed)}</span>
            <span title="Stock disponible">{node.stock_available.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}</span>
            <span className={`font-semibold min-w-[40px] text-right ${
              node.stock_gap > 0 ? 'text-destructive' : 'text-green'
            }`}>
              {node.stock_gap > 0 ? `-${node.stock_gap.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}` : 'OK'}
            </span>
          </span>
        </div>

        {hasChildren && !isCollapsed && node.children.map((child) => renderNode(child, depth + 1))}
      </Fragment>
    )
  }

  const shortages = countShortages(nodes)

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <p className="text-xs font-semibold">
          Nomenclature ({nodes.length} composants{depthMode === 'full' ? ', recursive' : ', niveau 1'})
          {shortages > 0 && <span className="text-destructive ml-2">({shortages} rupture{shortages > 1 ? 's' : ''})</span>}
        </p>
        <button
          onClick={() => setFilterShortages(!filterShortages)}
          className={`px-2.5 py-1 rounded text-[10px] font-semibold transition-colors ${
            filterShortages ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          {filterShortages ? 'Ruptures uniquement' : 'Tous les composants'}
        </button>
      </div>
      <div className="px-3 py-2 space-y-0.5">
        {nodes.map((n) => renderNode(n, 0))}
      </div>
    </div>
  )
}