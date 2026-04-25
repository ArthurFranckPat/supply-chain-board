import { useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useScheduleRun } from '@/hooks/useScheduleRun'
import { useAppBootstrap } from '@/hooks/useAppBootstrap'
import { AppLayout } from '@/components/layout/AppLayout'
import { DetailDrawerProvider } from '@/context/DetailDrawerContext'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
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
import type { DataSource } from '@/types/api'
import type { SchedulingOptions } from '@/views/PilotageView'

function App() {
  const navigate = useNavigate()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [source] = useState<DataSource>('extractions')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
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
      navigate('/scheduler')
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Ordonnancement impossible.')
    }
  }

  const scheduleState = schedule.isLoading ? 'running' : schedule.result ? 'success' : 'idle'

  return (
    <DetailDrawerProvider>
      <AppLayout
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        backendState={backendState}
        loadState={loadState}
        onRunSchedule={handleRunSchedule}
        scheduleResult={schedule.result}
        errorMessage={errorMessage}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/pilotage" replace />} />
          <Route
            path="/pilotage"
            element={
              <ErrorBoundary>
                <PilotageView
                  loadState={loadState}
                  scheduleState={scheduleState}
                  lastSourceSnapshot={lastSourceSnapshot}
                  backendState={backendState}
                  suiviReady={suiviData !== null}
                  options={schedulingOptions}
                  onRunSchedule={handleRunSchedule}
                  onOptionsChange={setSchedulingOptions}
                />
              </ErrorBoundary>
            }
          />
          <Route path="/actions" element={<ErrorBoundary><ActionsView data={null} /></ErrorBoundary>} />
          <Route
            path="/scheduler"
            element={
              <ErrorBoundary>
                <OrdonnancementView
                  isLoading={schedule.isLoading}
                  result={schedule.result}
                  error={schedule.error instanceof Error ? schedule.error.message : schedule.error ?? null}
                  runState={schedule.runState ?? null}
                />
              </ErrorBoundary>
            }
          />
          <Route path="/capacity" element={<ErrorBoundary><CapacityView /></ErrorBoundary>} />
          <Route path="/analyse-rupture" element={<ErrorBoundary><AnalyseRuptureView /></ErrorBoundary>} />
          <Route path="/feasibility" element={<ErrorBoundary><FeasibilityView /></ErrorBoundary>} />
          <Route path="/eol-residuals" element={<ErrorBoundary><EolResidualsView /></ErrorBoundary>} />
          <Route path="/fabricable" element={<ErrorBoundary><ResidualFabricationView /></ErrorBoundary>} />
          <Route
            path="/order-tracking"
            element={
              <ErrorBoundary>
                <OrderTrackingView data={suiviData} loadState={loadState} onReload={reloadSuivi} />
              </ErrorBoundary>
            }
          />
          <Route path="/stock-evolution" element={<ErrorBoundary><StockEvolutionView /></ErrorBoundary>} />
          <Route path="/lot-eco" element={<ErrorBoundary><LotEcoView /></ErrorBoundary>} />
          <Route path="/reports" element={<ErrorBoundary><RapportsView embeddedReports={null} /></ErrorBoundary>} />
          <Route
            path="/settings"
            element={
              <div className="text-sm text-muted-foreground">
                <p>API: <strong>{backendState}</strong></p>
              </div>
            }
          />
        </Routes>
      </AppLayout>
    </DetailDrawerProvider>
  )
}

export default App
