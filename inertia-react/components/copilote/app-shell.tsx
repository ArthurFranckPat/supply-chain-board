import type { ReactNode } from 'react'

import { cn } from '@r/lib/utils'

const NAV_WIDTH = '260px'
const INSPECTOR_WIDTH = '300px'

/** App shell 3 colonnes (nav / chat / inspecteur), replis indépendants
 * animés via grid-template-columns. Vit dans les children d'AppLayout
 * (`dense scrollable={false}`) — `flex-1` pour occuper l'inset sous le TopBar.
 * La sidebar conversations n'est PAS la sidebar app. */
export function AppShell(props: {
  navCollapsed: boolean
  inspectorCollapsed: boolean
  sidebar: ReactNode
  inspector: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className="grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-[220ms] ease-out"
      style={{
        gridTemplateColumns: `${props.navCollapsed ? '0px' : NAV_WIDTH} 1fr ${
          props.inspectorCollapsed ? '0px' : INSPECTOR_WIDTH
        }`,
      }}
    >
      <aside
        className={cn(
          'overflow-hidden border-r border-border bg-muted transition-opacity duration-150',
          props.navCollapsed && 'opacity-0'
        )}
      >
        <div className="h-full w-[260px]">{props.sidebar}</div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-[var(--sidebar-canvas)]">
        {props.children}
      </div>

      <aside
        className={cn(
          'overflow-hidden border-l border-border bg-card transition-opacity duration-150',
          props.inspectorCollapsed && 'opacity-0'
        )}
      >
        <div className="h-full w-[300px]">{props.inspector}</div>
      </aside>
    </div>
  )
}
