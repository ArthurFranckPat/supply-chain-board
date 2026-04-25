import { useState, useEffect } from 'react'
import { ApiError } from '@/api/client'
import { useScheduleRun } from '@/hooks/useScheduleRun'
import { useAppBootstrap } from '@/hooks/useAppBootstrap'
import { AppLayout } from '@/components/layout/AppLayout'
import { DetailDrawerProvider } from '@/context/DetailDrawerContext'
import { ViewRouter } from '@/views/ViewRouter'
import type { DataSource } from '@/types/api'
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
    <DetailDrawerProvider>
      <AppLayout
        activeView={activeView}
        onNavigate={setActiveView}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        backendState={backendState}
        loadState={loadState}
        onRunSchedule={handleRunSchedule}
        scheduleResult={schedule.result}
        errorMessage={errorMessage}
      >
        <ViewRouter
          activeView={activeView}
          loadState={loadState}
          backendState={backendState}
          lastSourceSnapshot={lastSourceSnapshot}
          suiviData={suiviData}
          reloadSuivi={reloadSuivi}
          schedulingOptions={schedulingOptions}
          onOptionsChange={setSchedulingOptions}
          onNavigate={setActiveView}
          onRunSchedule={handleRunSchedule}
          schedule={{
            isLoading: schedule.isLoading,
            result: schedule.result,
            error: schedule.error instanceof Error ? schedule.error : null,
            runState: schedule.runState ?? null,
          }}
        />
      </AppLayout>
    </DetailDrawerProvider>
  )
}

export default App
