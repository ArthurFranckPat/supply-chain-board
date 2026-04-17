import { useEffect, useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { apiClient, ApiError } from '@/api/client'
import { useScheduleRun } from '@/hooks/useScheduleRun'
import { HomeView } from '@/views/HomeView'
import { S1View } from '@/views/S1View'
import { ActionsView } from '@/views/ActionsView'
import { SchedulerView } from '@/views/SchedulerView'
import { ReportsView } from '@/views/ReportsView'
import type { DataSource, RunState, DetailItem } from '@/types/api'
import type { SchedulerOptions } from '@/views/HomeView'
import { Activity, LayoutDashboard, Wrench, CalendarClock, FileText, Settings, Package, Zap, PanelLeftClose, PanelLeftOpen } from 'lucide-react'

type ViewKey = 'home' | 's1' | 'actions' | 'scheduler' | 'reports' | 'settings'
type LoadState = 'idle' | 'loading' | 'ready' | 'error'
type RunStateStatus = 'idle' | 'running' | 'success' | 'error'

const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: React.ReactNode }> = [
  { key: 'home', label: 'Home', icon: <LayoutDashboard className="h-[15px] w-[15px]" /> },
  { key: 's1', label: 'S+1', icon: <CalendarClock className="h-[15px] w-[15px]" /> },
  { key: 'actions', label: 'Actions', icon: <Wrench className="h-[15px] w-[15px]" /> },
  { key: 'scheduler', label: 'Scheduler', icon: <Activity className="h-[15px] w-[15px]" /> },
  { key: 'reports', label: 'Reports', icon: <FileText className="h-[15px] w-[15px]" /> },
]

function formatTimestamp(value?: string | null) {
  if (!value) return 'N/A'
  try { return new Date(value).toLocaleString('fr-FR') } catch { return value }
}

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('home')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [backendState, setBackendState] = useState<'checking' | 'ready' | 'error'>('checking')
  const [source] = useState<DataSource>('extractions')
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [s1RunState, setS1RunState] = useState<RunStateStatus>('idle')
  const [lastS1Run, setLastS1Run] = useState<RunState | null>(null)
  const [lastSourceSnapshot, setLastSourceSnapshot] = useState<Record<string, unknown> | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<DetailItem | null>(null)
  const [schedulerOptions, setSchedulerOptions] = useState<SchedulerOptions>({
    feasibilityMode: 'projected',
    blockingComponentsMode: 'blocked',
    immediateComponents: false,
    demandHorizonDays: 15,
  })

  const schedule = useScheduleRun()

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      try {
        const health = await apiClient.getHealth()
        if (cancelled) return
        setBackendState(health.status === 'ok' ? 'ready' : 'error')
      } catch {
        if (!cancelled) setBackendState('error')
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [])

  async function handleLoadSource() {
    setLoadState('loading')
    setErrorMessage(null)
    try {
      const response = await apiClient.loadData(source)
      setLastSourceSnapshot(response)
      setLoadState('ready')
    } catch (error) {
      setLoadState('error')
      setErrorMessage(error instanceof ApiError ? error.message : 'Chargement impossible.')
    }
  }

  async function handleRunS1() {
    setS1RunState('running')
    setErrorMessage(null)
    try {
      const response = await apiClient.runS1({
        horizon: 7,
        include_previsions: false,
        feasibility_mode: schedulerOptions.feasibilityMode,
      })
      if (response.status === 'running') {
        setLastS1Run(response)
        setActiveView('s1')
        const settled = await pollRun(response.run_id)
        setLastS1Run(settled)
        setS1RunState(settled.status === 'completed' ? 'success' : 'error')
      } else {
        setLastS1Run(response)
        setS1RunState(response.status === 'completed' ? 'success' : 'error')
        setActiveView('s1')
      }
    } catch (error) {
      setS1RunState('error')
      setErrorMessage(error instanceof ApiError ? error.message : 'Run S+1 impossible.')
    }
  }

  async function handleRunSchedule() {
    setErrorMessage(null)
    try {
      await schedule.trigger({
        blocking_components_mode: schedulerOptions.blockingComponentsMode,
        immediate_components: schedulerOptions.immediateComponents,
        demand_horizon_days: schedulerOptions.demandHorizonDays,
      })
      setActiveView('scheduler')
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Scheduler impossible.')
    }
  }

  async function pollRun(runId: string): Promise<RunState> {
    for (let i = 0; i < 120; i++) {
      const run = await apiClient.getRun(runId)
      if (run.status !== 'running') return run
      await new Promise((r) => setTimeout(r, 1000))
    }
    throw new ApiError('Run timeout')
  }

  const s1Kpis = useMemo(() => {
    const summary = lastS1Run?.result?.summary as Record<string, number> | undefined
    return [
      { label: 'OF matchés', value: summary?.matched_ofs ?? 0 },
      { label: 'OF non faisables', value: summary?.non_feasible_ofs ?? 0, warn: true },
      { label: 'Alertes composants', value: summary?.action_components ?? 0, warn: true },
      { label: 'Postes kanban', value: summary?.kanban_postes ?? 0, warn: true },
    ]
  }, [lastS1Run])

  // Derive topbar subtitle
  const topbarSubtitle = activeView === 'scheduler' && schedule.result
    ? (() => {
        const allOfs = Object.values(schedule.result.line_candidates).flat()
        const days = [...new Set(allOfs.map(o => o.scheduled_day).filter(Boolean))].sort()
        if (days.length < 2) return ''
        const start = new Date(days[0]!).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
        const end = new Date(days[days.length - 1]!).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
        return `${start} → ${end}`
      })()
    : ''

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className={`shrink-0 border-r border-border bg-card flex flex-col transition-[width] duration-200 ${sidebarCollapsed ? 'w-[56px]' : 'w-[220px]'}`}>
        {/* Brand + collapse toggle */}
        <div className={`flex items-center gap-2.5 py-[14px] ${sidebarCollapsed ? 'px-3 justify-center' : 'px-4.5'}`}>
          <div className="w-8 h-8 rounded-[9px] shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0f766e,#166534)' }}>
            <Package className="h-4 w-4 text-white" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="text-[9.5px] text-muted-foreground font-mono uppercase tracking-wider font-medium leading-none">Supply Chain</p>
              <p className="text-[15px] font-bold text-foreground leading-tight mt-0.5">Ordo Board</p>
            </div>
          )}
        </div>

        {/* Navigation label */}
        {!sidebarCollapsed && (
          <div className="px-3 pt-3.5 pb-1.5 text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
            Navigation
          </div>
        )}

        {/* Nav items */}
        <nav className={`flex flex-col gap-0.5 flex-1 ${sidebarCollapsed ? 'px-2 pt-3' : 'px-2.5'}`}>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveView(item.key)}
              title={sidebarCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-2.5 py-2 rounded-[7px] text-[12.5px] font-medium transition-colors text-left ${
                sidebarCollapsed ? 'px-0 justify-center' : 'px-[11px]'
              } ${
                activeView === item.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground hover:bg-accent'
              }`}
            >
              {item.icon}
              {!sidebarCollapsed && item.label}
            </button>
          ))}
        </nav>

        {/* System section */}
        <div className={sidebarCollapsed ? 'px-2 pb-2' : 'px-2.5 pb-2'}>
          {!sidebarCollapsed && (
            <div className="px-[11px] pb-1.5 text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
              Système
            </div>
          )}
          <button
            onClick={() => setActiveView('settings')}
            title={sidebarCollapsed ? 'Settings' : undefined}
            className={`w-full flex items-center gap-2.5 py-2 rounded-[7px] text-[12.5px] font-medium transition-colors text-left ${
              sidebarCollapsed ? 'px-0 justify-center' : 'px-[11px]'
            } ${
              activeView === 'settings'
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-accent'
            }`}
          >
            <Settings className="h-[15px] w-[15px] text-muted-foreground" />
            {!sidebarCollapsed && 'Settings'}
          </button>
        </div>

        {/* Status indicators */}
        {!sidebarCollapsed && (
          <div className="px-3.5 py-3.5 border-t border-border flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>API</span>
              <span className={`inline-flex items-center gap-1.5 px-[7px] py-[2px] rounded-full text-[10px] font-semibold ${
                backendState === 'ready' ? 'bg-green/10 text-green' : 'bg-muted text-muted-foreground'
              }`}>
                <span className={`w-[5px] h-[5px] rounded-full ${backendState === 'ready' ? 'bg-green' : 'bg-muted-foreground'}`} />
                {backendState === 'ready' ? 'ready' : backendState}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Source</span>
              <span className={`inline-flex items-center gap-1.5 px-[7px] py-[2px] rounded-full text-[10px] font-semibold ${
                loadState === 'ready' ? 'bg-green/10 text-green' : 'bg-muted text-muted-foreground'
              }`}>
                <span className={`w-[5px] h-[5px] rounded-full ${loadState === 'ready' ? 'bg-green' : 'bg-muted-foreground'}`} />
                {loadState === 'ready' ? 'ready' : loadState}
              </span>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <div className={`border-t border-border py-2 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
          <button
            onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Agrandir' : 'Réduire'}
            className={`w-full flex items-center gap-2 py-1.5 rounded-[7px] text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ${
              sidebarCollapsed ? 'px-0 justify-center' : 'px-2'
            }`}
          >
            {sidebarCollapsed
              ? <PanelLeftOpen className="h-4 w-4 shrink-0" />
              : <>
                  <PanelLeftClose className="h-4 w-4 shrink-0" />
                  <span>Réduire</span>
                </>
            }
          </button>
        </div>
      </aside>

      {/* Main workspace */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-[54px] shrink-0 border-b border-border bg-card flex items-center justify-between px-[22px]">
          <div className="flex items-baseline gap-3">
            <h2 className="text-[15.5px] font-semibold tracking-tight">
              {NAV_ITEMS.find((n) => n.key === activeView)?.label}
              {activeView === 'settings' && 'Settings'}
            </h2>
            {topbarSubtitle && (
              <span className="text-[11.5px] text-muted-foreground">{topbarSubtitle}</span>
            )}
          </div>
          <div className="flex items-center gap-2.5 text-[11.5px] text-muted-foreground">
            <span>Dernier run: <strong className="text-foreground font-mono">{formatTimestamp(lastS1Run?.completed_at ?? lastS1Run?.created_at)}</strong></span>
            {activeView === 'scheduler' && (
              <button
                onClick={handleRunSchedule}
                className="bg-primary text-white border-none px-3 py-[7px] rounded-[7px] text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 hover:bg-primary/90 transition-colors"
              >
                <Zap className="h-3 w-3" />
                Relancer
              </button>
            )}
          </div>
        </header>

        {/* Error banner */}
        {errorMessage && (
          <div className="bg-destructive text-destructive-foreground px-6 py-2 text-sm font-medium">
            {errorMessage}
          </div>
        )}

        {/* KPI bar for S1 context */}
        {(activeView === 's1' || activeView === 'actions') && (
          <div className="grid grid-cols-4 gap-3 p-4">
            {s1Kpis.map((kpi) => (
              <Card key={kpi.label} className="py-2">
                <CardContent className="flex items-center justify-between px-4 py-0">
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                  <span className={`text-lg font-bold ${kpi.warn && kpi.value > 0 ? 'text-orange' : ''}`}>
                    {kpi.value}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeView === 'home' && (
            <HomeView
              loadState={loadState}
              s1RunState={s1RunState}
              scheduleState={schedule.isLoading ? 'running' : schedule.result ? 'success' : 'idle'}
              lastSourceSnapshot={lastSourceSnapshot}
              options={schedulerOptions}
              onLoadSource={handleLoadSource}
              onRunS1={handleRunS1}
              onRunSchedule={handleRunSchedule}
              onOptionsChange={setSchedulerOptions}
            />
          )}
          {activeView === 's1' && (
            <S1View
              runState={s1RunState}
              data={lastS1Run as Record<string, unknown> | null}
              onInspect={(item) => setDetailItem(item)}
            />
          )}
          {activeView === 'actions' && (
            <ActionsView
              data={(lastS1Run?.result as Record<string, unknown>)?.action_report as Record<string, unknown> | null}
              onInspect={(item) => setDetailItem(item)}
            />
          )}
          {activeView === 'scheduler' && (
            <SchedulerView
              isLoading={schedule.isLoading}
              result={schedule.result}
              error={schedule.error instanceof Error ? schedule.error.message : schedule.error ?? null}
              onInspect={(item) => setDetailItem(item)}
            />
          )}
          {activeView === 'reports' && (
            <ReportsView
              embeddedReports={(lastS1Run?.result as Record<string, unknown>)?.reports as Record<string, unknown> | null}
              onInspect={(item) => setDetailItem(item)}
            />
          )}
          {activeView === 'settings' && (
            <div className="text-sm text-muted-foreground">
              <p>Source: <strong>{source}</strong></p>
              <p>API: <strong>{backendState}</strong></p>
            </div>
          )}
        </div>
      </main>

      {/* Detail drawer */}
      {detailItem && (
        <aside className="w-80 shrink-0 border-l border-border bg-card overflow-auto">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-mono uppercase">Detail</p>
              <h3 className="text-sm font-semibold">{detailItem.title}</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDetailItem(null)}>Fermer</Button>
          </div>
          <div className="p-4">
            <p className="text-sm text-muted-foreground mb-3">{detailItem.description}</p>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-[70vh] font-mono">
              {JSON.stringify(detailItem.payload, null, 2)}
            </pre>
          </div>
        </aside>
      )}
    </div>
  )
}

export default App
