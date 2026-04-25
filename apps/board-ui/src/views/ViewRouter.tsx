import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { PilotageView } from './PilotageView'
import { ActionsView } from './ActionsView'
import { OrdonnancementView } from './OrdonnancementView'
import { CapacityView } from './CapacityView'
import { RapportsView } from './RapportsView'
import { AnalyseRuptureView } from './AnalyseRuptureView'
import { FeasibilityView } from './FeasibilityView'
import { EolResidualsView } from './EolResidualsView'
import { ResidualFabricationView } from './ResidualFabricationView'
import { OrderTrackingView } from './OrderTrackingView'
import { StockEvolutionView } from './StockEvolutionView'
import { LotEcoView } from './LotEcoView'
import type { ViewKey } from '@/components/layout/nav'
import type { LoadState, BackendState } from '@/hooks/useAppBootstrap'
import type { DataSourceSnapshot, RunState } from '@/types/api'
import type { SuiviStatusResponse } from '@/types/suivi-commandes'
import type { SchedulingOptions } from './PilotageView'
import type { SchedulerResult } from '@/types/scheduler'
import type { ReactNode } from 'react'

export interface ViewRouterProps {
  activeView: ViewKey
  loadState: LoadState
  backendState: BackendState
  lastSourceSnapshot: DataSourceSnapshot | null
  suiviData: SuiviStatusResponse | null
  reloadSuivi: () => void
  schedulingOptions: SchedulingOptions
  onOptionsChange: (options: SchedulingOptions) => void
  onNavigate: (view: ViewKey) => void
  onRunSchedule: () => void
  schedule: {
    isLoading: boolean
    result: SchedulerResult | null
    error: Error | null
    runState: RunState | null
  }
}

function wrap(node: ReactNode) {
  return <ErrorBoundary>{node}</ErrorBoundary>
}

export function ViewRouter({
  activeView,
  loadState,
  backendState,
  lastSourceSnapshot,
  suiviData,
  reloadSuivi,
  schedulingOptions,
  onOptionsChange,
  onNavigate,
  onRunSchedule,
  schedule,
}: ViewRouterProps) {
  switch (activeView) {
    case 'home':
      return wrap(
        <PilotageView
          loadState={loadState}
          scheduleState={schedule.isLoading ? 'running' : schedule.result ? 'success' : 'idle'}
          lastSourceSnapshot={lastSourceSnapshot}
          backendState={backendState}
          suiviReady={suiviData !== null}
          options={schedulingOptions}
          onRunSchedule={onRunSchedule}
          onOptionsChange={onOptionsChange}
          onNavigate={(view) => onNavigate(view as ViewKey)}
        />
      )
    case 'actions':
      return wrap(<ActionsView data={null} />)
    case 'scheduler':
      return wrap(
        <OrdonnancementView
          isLoading={schedule.isLoading}
          result={schedule.result}
          error={schedule.error instanceof Error ? schedule.error.message : schedule.error ?? null}
          runState={schedule.runState}
        />
      )
    case 'capacity':
      return wrap(<CapacityView />)
    case 'analyse-rupture':
      return wrap(<AnalyseRuptureView />)
    case 'feasibility':
      return wrap(<FeasibilityView />)
    case 'eol-residuals':
      return wrap(<EolResidualsView />)
    case 'fabricable':
      return wrap(<ResidualFabricationView />)
    case 'order-tracking':
      return wrap(<OrderTrackingView data={suiviData} loadState={loadState} onReload={reloadSuivi} />)
    case 'stock-evolution':
      return wrap(<StockEvolutionView />)
    case 'lot-eco':
      return wrap(<LotEcoView />)
    case 'reports':
      return wrap(<RapportsView embeddedReports={null} />)
    case 'settings':
      return (
        <div className="text-sm text-muted-foreground">
          <p>API: <strong>{backendState}</strong></p>
        </div>
      )
    default:
      return wrap(<PilotageView
        loadState={loadState}
        scheduleState={schedule.isLoading ? 'running' : schedule.result ? 'success' : 'idle'}
        lastSourceSnapshot={lastSourceSnapshot}
        backendState={backendState}
        suiviReady={suiviData !== null}
        options={schedulingOptions}
        onRunSchedule={onRunSchedule}
        onOptionsChange={onOptionsChange}
        onNavigate={(view) => onNavigate(view as ViewKey)}
      />)
  }
}
