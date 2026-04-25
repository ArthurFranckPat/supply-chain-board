import { type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { DetailDrawer } from './DetailDrawer'
import { useDetailDrawer } from '@/context/DetailDrawerContext'
import type { BackendState, LoadState } from '@/hooks/useAppBootstrap'
import type { SchedulerResult } from '@/types/scheduler'

interface AppLayoutProps {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  backendState: BackendState
  loadState: LoadState
  onRunSchedule: () => void
  scheduleResult?: SchedulerResult | null
  errorMessage: string | null
  children: ReactNode
}

export function AppLayout({
  sidebarCollapsed,
  onToggleSidebar,
  backendState,
  loadState,
  onRunSchedule,
  scheduleResult,
  errorMessage,
  children,
}: AppLayoutProps) {
  const { item, close } = useDetailDrawer()
  const location = useLocation()

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        backendState={backendState}
        loadState={loadState}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar
          activePath={location.pathname}
          onRunSchedule={onRunSchedule}
          scheduleResult={scheduleResult}
        />

        {errorMessage && (
          <div className="shrink-0 bg-destructive text-destructive-foreground px-4 py-1.5 text-xs font-medium border-b border-destructive/20">
            {errorMessage}
          </div>
        )}

        <div className="flex-1 overflow-auto p-3">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </div>
      </div>

      <DetailDrawer item={item} onClose={close} />
    </div>
  )
}
