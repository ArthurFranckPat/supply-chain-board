import { useState, useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Pill } from '@/components/ui/pill'
import { Segmented } from '@/components/ui/segmented'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { HeaderStrip } from '@/components/scheduler/HeaderStrip'
import { CapacityHeatmap } from '@/components/scheduler/CapacityHeatmap'
import { Workqueue, deriveWorkqueue } from '@/components/scheduler/Workqueue'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { FocusBar } from '@/components/scheduler/FocusBar'
import { StockProjection } from '@/components/scheduler/StockProjection'
import { ExpectedComponents } from '@/components/scheduler/ExpectedComponents'
import {
  CalendarDays, TrendingDown, AlertTriangle,
  Search, Save, ChevronDown, ChevronRight, AlertOctagon, CheckCircle2, Package,
} from 'lucide-react'
import type { SchedulerResult, CandidateOF } from '@/types/scheduler'
import type { DetailItem } from '@/types/api'

interface SchedulerViewProps {
  isLoading: boolean
  result: SchedulerResult | null
  error: string | null
  onInspect: (item: DetailItem) => void
}

function formatDateShort(v?: string | null) {
  if (!v) return '-'
  try { return new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) } catch { return v }
}

function formatDateLabel(v: string) {
  try { return new Date(v).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }) } catch { return v }
}

const STATUT_CONFIG: Record<number, { label: string; tone: 'good' | 'primary' | 'default' }> = {
  1: { label: 'Ferme', tone: 'good' },
  2: { label: 'Planifié', tone: 'primary' },
  3: { label: 'Suggéré', tone: 'default' },
}

export function SchedulerView({ isLoading, result, error, onInspect: _onInspect }: SchedulerViewProps) {
  // Controls
  const [activeTab, setActiveTab] = useState<string>('planning')
  const [showKpis, setShowKpis] = useState(true)
  const [weekMode, setWeekMode] = useState('week')
  const [density, setDensity] = useState('comfort')
  const [dark, setDark] = useState(false)
  const [focusLine, setFocusLine] = useState<string | null>(null)
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const [lensBlocked, setLensBlocked] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showWorkqueue, setShowWorkqueue] = useState(false)

  // Derived data
  const allOfs = useMemo(() => {
    if (!result) return []
    return Object.entries(result.line_candidates).flatMap(([line, ofs]) =>
      ofs.map((o) => ({ ...o, line }))
    )
  }, [result])

  const days = useMemo(() => {
    const daySet = new Set<string>()
    for (const o of allOfs) {
      if (o.scheduled_day) daySet.add(o.scheduled_day)
    }
    return [...daySet].sort()
  }, [allOfs])

  const lines = useMemo(() => [...new Set(allOfs.map(o => o.line))].sort(), [allOfs])

  const filtered = useMemo(() => {
    return allOfs.filter(o => {
      if (focusLine && o.line !== focusLine) return false
      if (focusDay && o.scheduled_day !== focusDay) return false
      if (lensBlocked && !o.blocking_components) return false
      if (statusFilter === 'ferme' && o.statut_num !== 1) return false
      if (statusFilter === 'planifie' && o.statut_num !== 2) return false
      if (statusFilter === 'sugg' && o.statut_num !== 3) return false
      if (query) {
        const q = query.toLowerCase()
        const lineLabel = result?.line_labels?.[o.line]?.toLowerCase() ?? ''
        return o.num_of.toLowerCase().includes(q)
            || o.article.toLowerCase().includes(q)
            || (o.description ?? '').toLowerCase().includes(q)
            || o.line.toLowerCase().includes(q)
            || lineLabel.includes(q)
      }
      return true
    })
  }, [allOfs, focusLine, focusDay, lensBlocked, statusFilter, query])

  const grouped = useMemo(() => {
    const g: Record<string, CandidateOF[]> = {}
    for (const of_ of filtered) {
      const day = of_.scheduled_day ?? '__none__'
      if (!g[day]) g[day] = []
      g[day].push(of_)
    }
    return g
  }, [filtered])

  function toggleDay(key: string) {
    setExpandedDays(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }

  const workqueue = useMemo(() => {
    if (!result) return []
    return deriveWorkqueue(result.alerts)
  }, [result])

  const stats = useMemo(() => {
    if (!result) return null
    const totalPlanned = Object.values(result.line_candidates).flat().filter((o) => o.scheduled_day).length
    const totalBlocked = Object.values(result.line_candidates).flat().filter((o) => o.blocking_components).length
    const totalRealisables = totalPlanned - totalBlocked
    const unscheduledCount = result.unscheduled_rows.length
    const ordersLate = result.order_rows.filter((r) =>
      r.statut.toLowerCase().includes('retard') || r.statut.toLowerCase().includes('non')
    ).length
    return { totalPlanned, totalBlocked, totalRealisables, unscheduledCount, ordersLate }
  }, [result])

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-20 rounded-2xl"><Skeleton className="h-full w-full rounded-2xl" /></div>
        <div className="grid grid-cols-[320px_1fr] gap-3.5">
          <Skeleton className="h-96 rounded-2xl" />
          <div className="space-y-3">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-card border border-border rounded-2xl py-16 text-center">
        <div className="flex items-center justify-center mb-3">
          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
        </div>
        <p className="text-destructive font-semibold">Erreur Scheduler</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
      </div>
    )
  }

  // Empty state
  if (!result) {
    return (
      <div className="bg-card border border-dashed border-border rounded-2xl py-16 text-center">
        <div className="flex items-center justify-center mb-3">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <p className="font-semibold text-muted-foreground">Aucun run scheduler disponible</p>
        <p className="text-sm text-muted-foreground mt-1">Lancez le scheduler depuis Home.</p>
      </div>
    )
  }

  const tabs = [
    { k: 'planning', label: 'Planning', icon: <CalendarDays className="h-3 w-3" /> },
    { k: 'components', label: 'Composants', icon: <Package className="h-3 w-3" />, count: result.reception_rows.length },
    { k: 'stock', label: 'Stock', icon: <TrendingDown className="h-3 w-3" /> },
  ]

  // Dark mode class
  const darkClass = dark ? 'dark' : ''

  return (
    <div className={darkClass}>
      <div className="flex flex-col gap-3">
        {/* Header Strip */}
        <HeaderStrip
          score={result.score}
          tauxService={result.taux_service}
          tauxOuverture={result.taux_ouverture}
          totalOf={stats?.totalPlanned ?? 0}
          totalRealisables={stats?.totalRealisables ?? 0}
          totalBlocked={stats?.totalBlocked ?? 0}
          totalUnscheduled={stats?.unscheduledCount ?? 0}
          totalOrdersRisk={stats?.ordersLate ?? 0}
          nbJit={result.nb_jit}
          nbChangements={result.nb_changements_serie}
          showKpis={showKpis}
          onToggleKpis={() => setShowKpis(v => !v)}
          weekMode={weekMode}
          onWeekMode={setWeekMode}
          density={density}
          onDensity={setDensity}
          dark={dark}
          onDark={() => setDark(v => !v)}
          showWorkqueue={showWorkqueue}
          onToggleWorkqueue={() => setShowWorkqueue(v => !v)}
        />

        {/* Main content */}
        <div className="relative p-3.5 pt-0">
          {/* Workqueue overlay */}
          {showWorkqueue && (
            <div className="absolute top-0 left-3.5 z-30 w-[320px]">
              <Workqueue items={workqueue} onFocus={(refs) => {
                if (refs.line) setFocusLine(refs.line)
                if (refs.day) setFocusDay(refs.day)
              }} />
            </div>
          )}

          {/* Content */}
          <div className="flex flex-col gap-3 min-w-0">
            {/* Heatmap & FocusBar only for planning tab */}
            {activeTab === 'planning' && (
              <>
                <button
                  onClick={() => setShowHeatmap(v => !v)}
                  className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showHeatmap ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <span className="font-semibold uppercase tracking-wider font-mono text-[10px]">Heatmap charge</span>
                  <span className="text-muted-foreground/50">{showHeatmap ? 'masquer' : 'afficher'}</span>
                </button>
                {showHeatmap && (
                <CapacityHeatmap
                  candidates={result.line_candidates}
                  lineLabels={result.line_labels ?? {}}
                  focusLine={focusLine}
                  focusDay={focusDay}
                  onCell={(line, day) => {
                    setFocusLine(line === focusLine ? null : line)
                    setFocusDay(day === focusDay ? null : day)
                  }}
                />
                )}

                <FocusBar
                  focusLine={focusLine}
                  focusDay={focusDay}
                  lensBlocked={lensBlocked}
                  onFocusLine={setFocusLine}
                  onFocusDay={setFocusDay}
                  setLensBlocked={setLensBlocked}
                  count={filtered.length}
                  total={allOfs.length}
                />
              </>
            )}

            {/* Main card with tabs */}
            <section className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Tabs */}
              <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border">
                {tabs.map(tb => {
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
                      {tb.count !== undefined && (
                        <span className={`text-[10px] font-bold px-1.5 py-[1px] rounded-full font-mono ${
                          isActive ? 'bg-primary/15' : 'bg-muted'
                        } text-muted-foreground`}>
                          {tb.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

                {/* Tab content */}
                {activeTab === 'planning' && (
                  <>
                    {/* Toolbar */}
                    <div className="px-3.5 py-2.5 border-b border-border flex items-center gap-2.5 flex-wrap">
                      <div className="inline-flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-lg flex-1 min-w-[220px] max-w-[380px]">
                        <Search className="h-3 w-3 text-muted-foreground" />
                        <input
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="OF · article · ligne / poste"
                          className="flex-1 bg-transparent border-none outline-none text-xs text-foreground"
                        />
                      </div>
                      <Select value={focusLine ?? '__all__'} onValueChange={(v) => setFocusLine(v === '__all__' ? null : v)}>
                        <SelectTrigger className="h-[30px] w-[260px] text-[11px] font-mono">
                          <SelectValue placeholder="Toutes lignes" />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false} className="min-w-[300px]">
                          <SelectItem value="__all__">Toutes lignes</SelectItem>
                          {lines.map((l) => (
                            <SelectItem key={l} value={l}>
                              {result?.line_labels?.[l] ? `${l} - ${result.line_labels[l]}` : l}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={focusDay ?? '__all__'} onValueChange={(v) => setFocusDay(v === '__all__' ? null : v)}>
                        <SelectTrigger className="h-[30px] w-[180px] text-[11px]">
                          <SelectValue placeholder="Tous les jours" />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false} className="min-w-[200px]">
                          <SelectItem value="__all__">Tous les jours</SelectItem>
                          {days.map((d) => (
                            <SelectItem key={d} value={d}>{formatDateLabel(d)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Segmented
                        value={statusFilter}
                        onChange={setStatusFilter}
                        options={[
                          { value: 'all', label: 'Tous' },
                          { value: 'ferme', label: 'Fermes' },
                          { value: 'planifie', label: 'Planifiés' },
                          { value: 'sugg', label: 'Suggérés' },
                        ]}
                      />
                      <div className="ml-auto flex gap-1.5">
                        <button className="text-[11px] text-muted-foreground bg-transparent border border-border px-2.5 py-[5px] rounded-md inline-flex items-center gap-1.5">
                          <Save className="h-2.5 w-2.5" />
                          Enregistrer vue
                        </button>
                        <button
                          onClick={() => setExpandedDays(new Set())}
                          className="text-[11px] text-muted-foreground bg-transparent border border-border px-2.5 py-[5px] rounded-md"
                        >
                          Déplier tout
                        </button>
                        <button
                          onClick={() => setExpandedDays(new Set(days))}
                          className="text-[11px] text-muted-foreground bg-transparent border border-border px-2.5 py-[5px] rounded-md"
                        >
                          Plier tout
                        </button>
                      </div>
                    </div>

                    {/* Column headers */}
                    <div className="grid gap-3 px-3.5 py-2 border-b border-border text-[10px] font-semibold text-muted-foreground font-mono uppercase tracking-wider bg-accent/30"
                      style={{ gridTemplateColumns: '130px 120px 1fr 90px 70px 60px 60px 85px 85px' }}
                    >
                      <span>OF</span>
                      <span>Commande</span>
                      <span>Article</span>
                      <span>Statut</span>
                      <span>Ligne</span>
                      <span className="text-right">Qté</span>
                      <span className="text-right">Charge</span>
                      <span>Échéance</span>
                      <span>État</span>
                    </div>

                    {/* Body */}
                    <div className="max-h-[62vh] overflow-y-auto">
                      {days.map(d => {
                        const rows = grouped[d] || []
                        if (rows.length === 0) return null
                        const isOpen = !expandedDays.has(d)
                        const totalCharge = rows.reduce((s, o) => s + o.charge_hours, 0)
                        const nbBlocked = rows.filter(o => o.blocking_components).length
                        const nbRealizable = rows.length - nbBlocked
                        const pctRealizable = rows.length > 0 ? Math.round((nbRealizable / rows.length) * 100) : 100

                        return (
                          <div key={d}>
                            <button
                              onClick={() => toggleDay(d)}
                              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 border-none cursor-pointer font-[inherit] text-left border-b border-border ${
                                isOpen ? 'bg-primary/5' : 'bg-accent/30'
                              }`}
                            >
                              {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              <CalendarDays className={`h-[13px] w-[13px] ${isOpen ? 'text-primary' : 'text-muted-foreground'}`} />
                              <span className="text-[12.5px] font-semibold">{formatDateLabel(d)}</span>
                              <Pill mono>{rows.length} OF</Pill>
                              <Pill mono>{totalCharge.toFixed(1)}h engagées</Pill>
                              {pctRealizable < 100 && (
                                <Pill tone={pctRealizable < 90 ? 'warn' : 'good'} mono>{pctRealizable}% réalisable</Pill>
                              )}
                              {nbBlocked > 0 && (
                                <Pill tone="danger" icon={<AlertOctagon className="h-2.5 w-2.5" />} mono>{nbBlocked} bloqués</Pill>
                              )}
                            </button>
                            {isOpen && rows.slice(0, 80).map((of, idx) => {
                              const s = STATUT_CONFIG[of.statut_num] ?? STATUT_CONFIG[3]
                              const sched = new Date(of.scheduled_day ?? '')
                              const due = new Date(of.due_date)
                              const diffDays = Math.round((due.getTime() - sched.getTime()) / 86400000)
                              const dueTone = diffDays < 0 ? 'danger' : diffDays < 2 ? 'warn' : 'default'
                              const blocked = !!of.blocking_components
                              const rowH = density === 'compact' ? '30px' : '38px'

                              return (
                                <div
                                  key={of.num_of}
                                  className="grid gap-3 items-center text-xs border-b border-border/50"
                                  style={{
                                    gridTemplateColumns: '130px 120px 1fr 90px 70px 60px 60px 85px 85px',
                                    padding: density === 'compact' ? '4px 14px' : '7px 14px',
                                    minHeight: rowH,
                                    background: idx % 2 === 1 ? 'var(--color-accent)' : 'transparent',
                                    borderLeft: blocked ? '3px solid var(--color-destructive)' : '3px solid transparent',
                                  }}
                                >
                                  <span className="font-mono text-[11.5px] font-medium">{of.num_of}</span>
                                  {of.linked_orders ? (
                                    <SimpleTooltip
                                      side="bottom"
                                      content={
                                        <div className="max-w-[260px]">
                                          {of.linked_orders.split(',').map((cmd: string, ci: number) => (
                                            <div key={ci} className="font-mono text-[11px] py-0.5">{cmd.trim()}</div>
                                          ))}
                                        </div>
                                      }
                                    >
                                      <span className="font-mono text-[11px] text-primary cursor-pointer truncate">
                                        {of.linked_orders.split(',').length > 1
                                          ? `${of.linked_orders.split(',')[0].trim()} (+${of.linked_orders.split(',').length - 1})`
                                          : of.linked_orders.split(',')[0].trim()}
                                      </span>
                                    </SimpleTooltip>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/50">-</span>
                                  )}
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="font-semibold text-xs">{of.article}</span>
                                    {of.description && (
                                      <span className="text-[10.5px] text-muted-foreground truncate">{of.description}</span>
                                    )}
                                  </div>
                                  <Pill tone={s.tone}>{s.label}</Pill>
                                  <span className="font-mono text-[11px] text-muted-foreground">{of.line}</span>
                                  <span className="text-right tabular-nums">{of.quantity.toLocaleString('fr-FR')}</span>
                                  <span className="text-right tabular-nums font-mono">{of.charge_hours.toFixed(1)}h</span>
                                  <span className={`font-mono text-[11px] ${dueTone === 'danger' ? 'text-destructive font-semibold' : dueTone === 'warn' ? 'text-orange font-semibold' : 'text-muted-foreground'}`}>
                                    {formatDateShort(of.due_date)}{diffDays < 0 ? ' ↗' : ''}
                                  </span>
                                  {blocked ? (
                                    <SimpleTooltip
                                      side="left"
                                      content={
                                        <div className="max-w-[280px]">
                                          <div className="font-semibold text-destructive mb-1">Composants bloquants</div>
                                          {of.blocking_components.split(',').map((comp: string, ci: number) => (
                                            <div key={ci} className="flex items-center gap-1.5 text-[11px] py-0.5">
                                              <span className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                                              {comp.trim()}
                                            </div>
                                          ))}
                                        </div>
                                      }
                                    >
                                      <span className="inline-flex items-center gap-1 text-destructive font-semibold text-[11px] cursor-pointer">
                                        <AlertOctagon className="h-3 w-3" />
                                        Bloqué
                                      </span>
                                    </SimpleTooltip>
                                  ) : (
                                    <SimpleTooltip
                                      side="left"
                                      content={<span>Tous les composants sont disponibles</span>}
                                    >
                                      <span className="inline-flex items-center gap-1 text-green text-[11px] cursor-pointer">
                                        <CheckCircle2 className="h-3 w-3" />
                                        OK
                                      </span>
                                    </SimpleTooltip>
                                  )}
                                </div>
                              )
                            })}
                            {isOpen && rows.length > 80 && (
                              <div className="px-3.5 py-2.5 text-[11px] text-muted-foreground text-center border-b border-border/50 bg-accent/30">
                                +{rows.length - 80} OF supplémentaires
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {days.length === 0 && (
                        <div className="py-12 text-center text-sm text-muted-foreground">Aucun résultat</div>
                      )}
                    </div>
                  </>
                )}

                {activeTab === 'components' && (
                  <div className="p-4">
                    <ExpectedComponents rows={result.reception_rows} />
                  </div>
                )}
                {activeTab === 'stock' && (
                  <div className="p-4">
                    <StockProjection entries={result.stock_projection} />
                  </div>
                )}
              </section>
            </div>
          </div>
      </div>
    </div>
  )
}
