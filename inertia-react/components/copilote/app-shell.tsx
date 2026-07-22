import type { ReactNode } from 'react'

import { cn } from '@r/lib/utils'

const NAV_WIDTH = '260px'
const INSPECTOR_WIDTH = '300px'

/** App shell 3 colonnes (nav / chat / inspecteur), replis indépendants
 * animés via grid-template-columns. */
export function AppShell(props: {
  navCollapsed: boolean
  inspectorCollapsed: boolean
  sidebar: ReactNode
  inspector: ReactNode
  children: ReactNode
}) {
  return (
    <div
      className="grid flex-1 overflow-hidden transition-[grid-template-columns] duration-[220ms] ease-out"
      style={{
        gridTemplateColumns: `${props.navCollapsed ? '0px' : NAV_WIDTH} 1fr ${
          props.inspectorCollapsed ? '0px' : INSPECTOR_WIDTH
        }`,
      }}
    >
      <aside
        className={cn(
          'overflow-hidden border-r border-border bg-secondary transition-opacity duration-150',
          props.navCollapsed && 'opacity-0'
        )}
      >
        <div className="h-full w-[260px]">{props.sidebar}</div>
      </aside>

      <div className="flex min-w-0 flex-col overflow-hidden">{props.children}</div>

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
