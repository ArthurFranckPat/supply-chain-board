import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { apiClient, ApiError } from '@/api/client'
import { suiviClient } from '@/api/suivi-client'
import { useScheduleRun } from '@/hooks/useScheduleRun'
import { PilotageView } from '@/views/PilotageView'
import { ActionsView } from '@/views/ActionsView'
import { OrdonnancementView } from '@/views/OrdonnancementView'
import { CapacityView } from '@/views/CapacityView'
import { RapportsView } from '@/views/RapportsView'
import { AnalyseRuptureView } from '@/views/AnalyseRuptureView'
import { FeasibilityView } from '@/views/FeasibilityView'
import { EolResidualsView } from '@/views/EolResidualsView'
import { ResidualFabricationView } from '@/views/ResidualFabricationView'
import { OrderTrackingView } from '@/views/OrderTrackingView'
import { StockEvolutionView } from '@/views/StockEvolutionView'
import type { DataSource, DetailItem } from '@/types/api'
import type { SchedulingOptions } from '@/views/PilotageView'
import type { SuiviStatusResponse } from '@/types/suivi-commandes'
import { Activity, LayoutDashboard, Wrench, CalendarDays, FileText, Settings, Package, Zap, PanelLeftClose, PanelLeftOpen, AlertTriangle, ShoppingCart, CheckCircle, PackageSearch, Factory, TrendingUp } from 'lucide-react'

type ViewKey = 'home' | 'actions' | 'scheduler' | 'analyse-rupture' | 'feasibility' | 'capacity' | 'eol-residuals' | 'fabricable' | 'order-tracking' | 'reports' | 'settings' | 'stock-evolution'
type LoadState = 'idle' | 'loading' | 'ready' | 'error'

const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: React.ReactNode }> = [
  { key: 'home', label: 'Pilotage', icon: <LayoutDashboard className="h-[15px] w-[15px]" /> },
  { key: 'actions', label: 'Actions appro', icon: <Wrench className="h-[15px] w-[15px]" /> },
  { key: 'scheduler', label: 'Ordonnancement', icon: <Activity className="h-[15px] w-[15px]" /> },
  { key: 'analyse-rupture', label: 'Ruptures', icon: <AlertTriangle className="h-[15px] w-[15px]" /> },
  { key: 'feasibility', label: 'Faisabilité', icon: <CheckCircle className="h-[15px] w-[15px]" /> },
  { key: 'eol-residuals', label: 'Stock EOL', icon: <PackageSearch className="h-[15px] w-[15px]" /> },
  { key: 'fabricable', label: 'Fabricabilité', icon: <Factory className="h-[15px] w-[15px]" /> },
  { key: 'capacity', label: 'Capacités', icon: <CalendarDays className="h-[15px] w-[15px]" /> },
  { key: 'order-tracking', label: 'Commandes', icon: <ShoppingCart className="h-[15px] w-[15px]" /> },
  { key: 'stock-evolution', label: 'Historique stock', icon: <TrendingUp className="h-[15px] w-[15px]" /> },
  { key: 'reports', label: 'Rapports', icon: <FileText className="h-[15px] w-[15px]" /> },
]

function App() {
  const [activeView, setActiveView] = useState<ViewKey>('home')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [backendState, setBackendState] = useState<'checking' | 'ready' | 'error'>('checking')
  const [source] = useState<DataSource>('extractions')
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [lastSourceSnapshot, setLastSourceSnapshot] = useState<Record<string, unknown> | null>(null)
  const [suiviData, setSuiviData] = useState<SuiviStatusResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<DetailItem | null>(null)
  const [schedulingOptions, setSchedulingOptions] = useState<SchedulingOptions>({
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

        // Auto-load both data sources in parallel as soon as API is ready
        if (health.status === 'ok') {
          setLoadState('loading')
          try {
            const [ordoData, suiviResp] = await Promise.all([
              apiClient.loadData(source),
              suiviClient.getStatusFromErp().catch(() => null),
            ])
            if (cancelled) return
            setLastSourceSnapshot(ordoData)
            setSuiviData(suiviResp)
            setLoadState('ready')
          } catch {
            if (!cancelled) setLoadState('error')
          }
        }
      } catch {
        if (!cancelled) setBackendState('error')
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [source])

  async function handleRunSchedule() {
    setErrorMessage(null)
    try {
      await schedule.trigger({
        blocking_components_mode: schedulingOptions.blockingComponentsMode,
        immediate_components: schedulingOptions.immediateComponents,
        demand_horizon_days: schedulingOptions.demandHorizonDays,
      })
      setActiveView('scheduler')
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Ordonnancement impossible.')
    }
  }

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
              <p className="text-[15px] font-bold text-foreground leading-tight mt-0.5">Ordo Cockpit</p>
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
            title={sidebarCollapsed ? 'Paramètres' : undefined}
            className={`w-full flex items-center gap-2.5 py-2 rounded-[7px] text-[12.5px] font-medium transition-colors text-left ${
              sidebarCollapsed ? 'px-0 justify-center' : 'px-[11px]'
            } ${
              activeView === 'settings'
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-accent'
            }`}
          >
            <Settings className="h-[15px] w-[15px] text-muted-foreground" />
            {!sidebarCollapsed && 'Paramètres'}
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
              {activeView === 'settings' && 'Paramètres'}
            </h2>
            {topbarSubtitle && (
              <span className="text-[11.5px] text-muted-foreground">{topbarSubtitle}</span>
            )}
          </div>
          <div className="flex items-center gap-2.5 text-[11.5px] text-muted-foreground">
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

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeView === 'home' && (
            <ErrorBoundary><PilotageView
              loadState={loadState}
              scheduleState={schedule.isLoading ? 'running' : schedule.result ? 'success' : 'idle'}
              lastSourceSnapshot={lastSourceSnapshot}
              backendState={backendState}
              suiviReady={suiviData !== null}
              options={schedulingOptions}
              onRunSchedule={handleRunSchedule}
              onOptionsChange={setSchedulingOptions}
              onNavigate={(view) => setActiveView(view as ViewKey)}
            /></ErrorBoundary>
          )}
          {activeView === 'actions' && (
            <ErrorBoundary><ActionsView
              data={null}
              onInspect={(item) => setDetailItem(item)}
            /></ErrorBoundary>
          )}
          {activeView === 'scheduler' && (
            <ErrorBoundary><OrdonnancementView
              isLoading={schedule.isLoading}
              result={schedule.result}
              error={schedule.error instanceof Error ? schedule.error.message : schedule.error ?? null}
              runState={schedule.runState}
              onInspect={(item) => setDetailItem(item)}
            /></ErrorBoundary>
          )}
          {activeView === 'capacity' && (
            <ErrorBoundary><CapacityView onInspect={(item) => setDetailItem(item)} /></ErrorBoundary>
          )}
          {activeView === 'analyse-rupture' && (
            <ErrorBoundary><AnalyseRuptureView /></ErrorBoundary>
          )}
          {activeView === 'feasibility' && (
            <ErrorBoundary><FeasibilityView /></ErrorBoundary>
          )}
          {activeView === 'eol-residuals' && (
            <ErrorBoundary><EolResidualsView /></ErrorBoundary>
          )}
          {activeView === 'fabricable' && (
            <ErrorBoundary><ResidualFabricationView /></ErrorBoundary>
          )}
          {activeView === 'order-tracking' && (
            <ErrorBoundary><OrderTrackingView data={suiviData} loadState={loadState} onReload={() => {
              suiviClient.getStatusFromErp().then(setSuiviData).catch(() => {})
            }} /></ErrorBoundary>
          )}
          {activeView === 'stock-evolution' && <ErrorBoundary><StockEvolutionView /></ErrorBoundary>}
          {activeView === 'reports' && (
            <ErrorBoundary><RapportsView
              embeddedReports={null}
              onInspect={(item) => setDetailItem(item)}
            /></ErrorBoundary>
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
