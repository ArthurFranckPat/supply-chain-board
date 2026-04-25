import { type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { DetailDrawer } from './DetailDrawer'
import { useDetailDrawer } from '@/context/DetailDrawerContext'
import type { ViewKey } from './nav'
import type { BackendState, LoadState } from '@/hooks/useAppBootstrap'
import type { SchedulerResult } from '@/types/scheduler'

interface AppLayoutProps {
  activeView: ViewKey
  onNavigate: (view: ViewKey) => void
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
  activeView,
  onNavigate,
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

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        activeView={activeView}
        onNavigate={onNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        backendState={backendState}
        loadState={loadState}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        <Topbar
          activeView={activeView}
          onRunSchedule={onRunSchedule}
          scheduleResult={scheduleResult}
        />

        {errorMessage && (
          <div className="bg-destructive text-destructive-foreground px-6 py-2 text-sm font-medium">
            {errorMessage}
          </div>
        )}

        <div className="flex-1 overflow-auto p-6">
          {children}
        </div>
      </main>

      <DetailDrawer item={item} onClose={close} />
    </div>
  )
}
