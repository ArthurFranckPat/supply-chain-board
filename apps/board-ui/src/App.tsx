import { useState, useEffect } from 'react'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ApiError } from '@/api/client'
import { useScheduleRun } from '@/hooks/useScheduleRun'
import { useAppBootstrap } from '@/hooks/useAppBootstrap'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { DetailDrawer } from '@/components/layout/DetailDrawer'
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
import { LotEcoView } from '@/views/LotEcoView'
import type { DataSource, DetailItem } from '@/types/api'
import type { SchedulingOptions } from '@/views/PilotageView'
import type { ViewKey } from '@/components/layout/nav'

function App() {
  const savedView = (typeof sessionStorage !== 'undefined'
    ? sessionStorage.getItem('active-view') as ViewKey | null
    : null) ?? 'home'

  const [activeView, setActiveView] = useState<ViewKey>(savedView)

  useEffect(() => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('active-view', activeView)
    }
  }, [activeView])

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [source] = useState<DataSource>('extractions')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [detailItem, setDetailItem] = useState<DetailItem | null>(null)
  const [schedulingOptions, setSchedulingOptions] = useState<SchedulingOptions>({
    blockingComponentsMode: 'blocked',
    immediateComponents: false,
    demandHorizonDays: 15,
  })

  const { backendState, loadState, lastSourceSnapshot, suiviData, reloadSuivi } = useAppBootstrap(source)
  const schedule = useScheduleRun()

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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(c => !c)}
        backendState={backendState}
        loadState={loadState}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          activeView={activeView}
          onRunSchedule={handleRunSchedule}
          scheduleResult={schedule.result}
        />

        {errorMessage && (
          <div className="bg-destructive text-destructive-foreground px-6 py-2 text-sm font-medium">
            {errorMessage}
          </div>
        )}

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
            <ErrorBoundary><OrderTrackingView data={suiviData} loadState={loadState} onReload={reloadSuivi} /></ErrorBoundary>
          )}
          {activeView === 'stock-evolution' && (
            <ErrorBoundary><StockEvolutionView /></ErrorBoundary>
          )}
          {activeView === 'lot-eco' && (
            <ErrorBoundary><LotEcoView /></ErrorBoundary>
          )}
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

      <DetailDrawer item={detailItem} onClose={() => setDetailItem(null)} />
    </div>
  )
}

export default App
