import { useState, useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { HeaderStrip } from '@/components/scheduler/HeaderStrip'
import { CapacityHeatmap } from '@/components/scheduler/CapacityHeatmap'
import { Workqueue, deriveWorkqueue } from '@/components/scheduler/Workqueue'
import { ScheduleProgress } from '@/components/scheduler/ScheduleProgress'
import { FocusBar } from '@/components/scheduler/FocusBar'
import { StockProjection } from '@/components/scheduler/StockProjection'
import { ExpectedComponents } from '@/components/scheduler/ExpectedComponents'
import { SchedulerFilters } from '@/components/scheduling/SchedulerFilters'
import { DayCard } from '@/components/scheduling/DayCard'
import {
  CalendarDays, TrendingDown, AlertTriangle,
  ChevronDown, ChevronRight, Package,
} from 'lucide-react'
import type { SchedulerResult, CandidateOF } from '@/types/scheduler'
import type { DetailItem, RunState } from '@/types/api'

interface OrdonnancementViewProps {
  isLoading: boolean
  result: SchedulerResult | null
  error: string | null
  runState?: RunState | null
  onInspect: (item: DetailItem) => void
}

export function OrdonnancementView({ isLoading, result, error, runState, onInspect: _onInspect }: OrdonnancementViewProps) {
  /* ── Controls ─────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState<string>('planning')
  const [showKpis, setShowKpis] = useState(true)
  const [weekMode, setWeekMode] = useState('week')
  const [density, setDensity] = useState<'compact' | 'comfort'>('comfort')
  const [dark, setDark] = useState(false)
  const [focusLine, setFocusLine] = useState<string | null>(null)
  const [focusDay, setFocusDay] = useState<string | null>(null)
  const [lensBlocked, setLensBlocked] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [showWorkqueue, setShowWorkqueue] = useState(false)

  /* ── Derived data ─────────────────────────────────────────── */
  const allOfs = useMemo(() => {
    if (!result) return []
    return Object.entries(result.line_candidates).flatMap(([line, ofs]) =>
      ofs.map((o) => ({ ...o, line }))
    )
  }, [result])

  const days = useMemo(() => {
    const daySet = new Set<string>()
    for (const o of allOfs) { if (o.scheduled_day) daySet.add(o.scheduled_day) }
    return [...daySet].sort()
  }, [allOfs])

  const lines = useMemo(() => [...new Set(allOfs.map(o => o.line))].sort(), [allOfs])

  const filtered = useMemo(() => allOfs.filter(o => {
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
  }), [allOfs, focusLine, focusDay, lensBlocked, statusFilter, query, result?.line_labels])

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

  const workqueue = useMemo(() => result ? deriveWorkqueue(result.alerts) : [], [result])

  const stats = useMemo(() => {
    if (!result) return null
    const all = Object.values(result.line_candidates).flat()
    const totalPlanned = all.filter(o => o.scheduled_day).length
    const totalBlocked = all.filter(o => o.blocking_components).length
    return {
      totalPlanned,
      totalBlocked,
      totalRealisables: totalPlanned - totalBlocked,
      unscheduledCount: result.unscheduled_rows.length,
      ordersLate: result.order_rows.filter(r => r.statut.toLowerCase().includes('retard') || r.statut.toLowerCase().includes('non')).length,
    }
  }, [result])

  /* ── Early returns ────────────────────────────────────────── */
  if (isLoading) {
    return runState?.step_key
      ? <div className="flex items-center justify-center py-24"><ScheduleProgress runState={runState} /></div>
      : (
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

  if (error) {
    return (
      <div className="bg-card border border-border rounded-2xl py-16 text-center">
        <div className="flex items-center justify-center mb-3">
          <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
        </div>
        <p className="text-destructive font-semibold">Erreur d'ordonnancement</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="bg-card border border-dashed border-border rounded-2xl py-16 text-center">
        <div className="flex items-center justify-center mb-3">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
        <p className="font-semibold text-muted-foreground">Aucun calcul d'ordonnancement disponible</p>
        <p className="text-sm text-muted-foreground mt-1">Lancez l'ordonnancement depuis Pilotage.</p>
      </div>
    )
  }

  /* ── Main render ──────────────────────────────────────────── */
  const tabs = [
    { k: 'planning', label: 'Planning', icon: <CalendarDays className="h-3 w-3" /> },
    { k: 'components', label: 'Composants', icon: <Package className="h-3 w-3" />, count: result.reception_rows.length },
    { k: 'stock', label: 'Stock', icon: <TrendingDown className="h-3 w-3" /> },
  ]

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="flex flex-col gap-3">
        <HeaderStrip
          score={result.score} tauxService={result.taux_service} tauxOuverture={result.taux_ouverture}
          totalOf={stats?.totalPlanned ?? 0} totalRealisables={stats?.totalRealisables ?? 0}
          totalBlocked={stats?.totalBlocked ?? 0} totalUnscheduled={stats?.unscheduledCount ?? 0}
          totalOrdersRisk={stats?.ordersLate ?? 0} nbJit={result.nb_jit}
          nbChangements={result.nb_changements_serie} showKpis={showKpis}
          onToggleKpis={() => setShowKpis(v => !v)} weekMode={weekMode} onWeekMode={setWeekMode}
          density={density} onDensity={(v) => setDensity(v as 'compact' | 'comfort')} dark={dark} onDark={() => setDark(v => !v)}
          showWorkqueue={showWorkqueue} onToggleWorkqueue={() => setShowWorkqueue(v => !v)}
        />

        <div className="relative p-3.5 pt-0">
          {showWorkqueue && (
            <div className="absolute top-0 left-3.5 z-30 w-[320px]">
              <Workqueue items={workqueue} onFocus={(refs) => {
                if (refs.line) setFocusLine(refs.line)
                if (refs.day) setFocusDay(refs.day)
              }} />
            </div>
          )}

          <div className="flex flex-col gap-3 min-w-0">
            {activeTab === 'planning' && (
              <>
                <button onClick={() => setShowHeatmap(v => !v)}
                  className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showHeatmap ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <span className="font-semibold uppercase tracking-wider font-mono text-[10px]">Heatmap charge</span>
                  <span className="text-muted-foreground/50">{showHeatmap ? 'masquer' : 'afficher'}</span>
                </button>
                {showHeatmap && (
                  <CapacityHeatmap candidates={result.line_candidates} lineLabels={result.line_labels ?? {}}
                    focusLine={focusLine} focusDay={focusDay}
                    onCell={(line, day) => { setFocusLine(line === focusLine ? null : line); setFocusDay(day === focusDay ? null : day) }}
                  />
                )}
                <FocusBar focusLine={focusLine} focusDay={focusDay} lensBlocked={lensBlocked}
                  onFocusLine={setFocusLine} onFocusDay={setFocusDay} setLensBlocked={setLensBlocked}
                  count={filtered.length} total={allOfs.length}
                />
              </>
            )}

            <section className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Tabs */}
              <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border">
                {tabs.map(tb => {
                  const isActive = activeTab === tb.k
                  return (
                    <button key={tb.k} onClick={() => setActiveTab(tb.k)}
                      className={`inline-flex items-center gap-1.5 px-3 py-[7px] text-xs font-semibold rounded-[7px] transition-colors ${
                        isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'
                      }`}
                    >
                      {tb.icon}{tb.label}
                      {tb.count !== undefined && (
                        <span className={`text-[10px] font-bold px-1.5 py-[1px] rounded-full font-mono ${
                          isActive ? 'bg-primary/15' : 'bg-muted'
                        } text-muted-foreground`}>{tb.count}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {activeTab === 'planning' && (
                <>
                  <SchedulerFilters
                    query={query} onQueryChange={setQuery}
                    focusLine={focusLine} onFocusLineChange={setFocusLine}
                    focusDay={focusDay} onFocusDayChange={setFocusDay}
                    statusFilter={statusFilter} onStatusFilterChange={setStatusFilter}
                    lines={lines} days={days} lineLabels={result.line_labels ?? {}}
                    expandedDays={expandedDays}
                    onCollapseAll={() => setExpandedDays(new Set())}
                    onExpandAll={(d) => setExpandedDays(new Set(d))}
                    allDays={days}
                  />
                  {/* Column headers */}
                  <div className="grid gap-3 px-3.5 py-2 border-b border-border text-[10px] font-semibold text-muted-foreground font-mono uppercase tracking-wider bg-accent/30"
                    style={{ gridTemplateColumns: '130px 120px 1fr 90px 70px 60px 60px 85px 85px' }}
                  >
                    <span>OF</span><span>Commande</span><span>Article</span><span>Statut</span>
                    <span>Ligne</span><span className="text-right">Qté</span>
                    <span className="text-right">Charge</span><span>Échéance</span><span>État</span>
                  </div>
                  {/* Body */}
                  <div className="max-h-[62vh] overflow-y-auto">
                    {days.map(d => (
                      <DayCard key={d} day={d} rows={grouped[d] ?? []}
                        isOpen={!expandedDays.has(d)} density={density} onToggle={toggleDay}
                      />
                    ))}
                    {days.length === 0 && (
                      <div className="py-12 text-center text-sm text-muted-foreground">Aucun résultat</div>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'components' && (
                <div className="p-4"><ExpectedComponents rows={result.reception_rows} /></div>
              )}
              {activeTab === 'stock' && (
                <div className="p-4"><StockProjection entries={result.stock_projection} /></div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
