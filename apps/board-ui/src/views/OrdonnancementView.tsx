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
import { useSchedulerData } from '@/hooks/useSchedulerData'
import {
  CalendarDays, TrendingDown, AlertTriangle,
  ChevronDown, ChevronRight, Package,
} from 'lucide-react'
import type { SchedulerResult } from '@/types/scheduler'
import type { RunState } from '@/types/api'

interface OrdonnancementViewProps {
  isLoading: boolean
  result: SchedulerResult | null
  error: string | null
  runState?: RunState | null
}

const TABS = [
  { k: 'planning', label: 'Planning', icon: <CalendarDays className="h-3 w-3" /> },
  { k: 'components', label: 'Composants', icon: <Package className="h-3 w-3" />, countKey: 'reception_rows' as const },
  { k: 'stock', label: 'Stock', icon: <TrendingDown className="h-3 w-3" /> },
]

export function OrdonnancementView({ isLoading, result, error, runState }: OrdonnancementViewProps) {
  const s = useSchedulerData(result)

  const workqueue = result ? deriveWorkqueue(result.alerts) : []

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
  return (
    <div className={s.dark ? 'dark' : ''}>
      <div className="flex flex-col gap-3">
        <HeaderStrip
          score={result.score} tauxService={result.taux_service} tauxOuverture={result.taux_ouverture}
          totalOf={s.stats?.totalPlanned ?? 0} totalRealisables={s.stats?.totalRealisables ?? 0}
          totalBlocked={s.stats?.totalBlocked ?? 0} totalUnscheduled={s.stats?.unscheduledCount ?? 0}
          totalOrdersRisk={s.stats?.ordersLate ?? 0} nbJit={result.nb_jit}
          nbChangements={result.nb_changements_serie} showKpis={s.showKpis}
          onToggleKpis={() => s.setShowKpis(v => !v)} weekMode={s.weekMode} onWeekMode={s.setWeekMode}
          density={s.density} onDensity={(v) => s.setDensity(v as 'compact' | 'comfort')} dark={s.dark} onDark={() => s.setDark(v => !v)}
          showWorkqueue={s.showWorkqueue} onToggleWorkqueue={() => s.setShowWorkqueue(v => !v)}
        />

        <div className="relative p-3.5 pt-0">
          {s.showWorkqueue && (
            <div className="absolute top-0 left-3.5 z-30 w-[320px]">
              <Workqueue items={workqueue} onFocus={(refs) => {
                if (refs.line) s.setFocusLine(refs.line)
                if (refs.day) s.setFocusDay(refs.day)
              }} />
            </div>
          )}

          <div className="flex flex-col gap-3 min-w-0">
            {s.activeTab === 'planning' && (
              <>
                <button onClick={() => s.setShowHeatmap(v => !v)}
                  className="flex items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {s.showHeatmap ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <span className="font-semibold uppercase tracking-wider font-mono text-[10px]">Heatmap charge</span>
                  <span className="text-muted-foreground/50">{s.showHeatmap ? 'masquer' : 'afficher'}</span>
                </button>
                {s.showHeatmap && (
                  <CapacityHeatmap candidates={result.line_candidates} lineLabels={result.line_labels ?? {}}
                    focusLine={s.focusLine} focusDay={s.focusDay}
                    onCell={(line, day) => { s.setFocusLine(line === s.focusLine ? null : line); s.setFocusDay(day === s.focusDay ? null : day) }}
                  />
                )}
                <FocusBar focusLine={s.focusLine} focusDay={s.focusDay} lensBlocked={s.lensBlocked}
                  onFocusLine={s.setFocusLine} onFocusDay={s.setFocusDay} setLensBlocked={s.setLensBlocked}
                  count={s.filtered.length} total={s.allOfs.length}
                />
              </>
            )}

            <section className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Tabs */}
              <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border">
                {TABS.map(tb => {
                  const isActive = s.activeTab === tb.k
                  const count = tb.countKey ? (result[tb.countKey]?.length ?? 0) : undefined
                  return (
                    <button key={tb.k} onClick={() => s.setActiveTab(tb.k)}
                      className={`inline-flex items-center gap-1.5 px-3 py-[7px] text-xs font-semibold rounded-[7px] transition-colors ${
                        isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent'
                      }`}
                    >
                      {tb.icon}{tb.label}
                      {count !== undefined && (
                        <span className={`text-[10px] font-bold px-1.5 py-[1px] rounded-full font-mono ${
                          isActive ? 'bg-primary/15' : 'bg-muted'
                        } text-muted-foreground`}>{count}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {s.activeTab === 'planning' && (
                <>
                  <SchedulerFilters
                    query={s.query} onQueryChange={s.setQuery}
                    focusLine={s.focusLine} onFocusLineChange={s.setFocusLine}
                    focusDay={s.focusDay} onFocusDayChange={s.setFocusDay}
                    statusFilter={s.statusFilter} onStatusFilterChange={s.setStatusFilter}
                    lines={s.lines} days={s.days} lineLabels={result.line_labels ?? {}}
                    expandedDays={s.expandedDays}
                    onCollapseAll={() => s.setExpandedDays(new Set())}
                    onExpandAll={(d) => s.setExpandedDays(new Set(d))}
                    allDays={s.days}
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
                    {s.days.map(d => (
                      <DayCard key={d} day={d} rows={s.grouped[d] ?? []}
                        isOpen={!s.expandedDays.has(d)} density={s.density} onToggle={s.toggleDay}
                      />
                    ))}
                    {s.days.length === 0 && (
                      <div className="py-12 text-center text-sm text-muted-foreground">Aucun résultat</div>
                    )}
                  </div>
                </>
              )}

              {s.activeTab === 'components' && (
                <div className="p-4"><ExpectedComponents rows={result.reception_rows} /></div>
              )}
              {s.activeTab === 'stock' && (
                <div className="p-4"><StockProjection entries={result.stock_projection} /></div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
