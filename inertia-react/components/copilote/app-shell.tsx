import type { ReactNode } from 'react'

import { cn } from '@r/lib/utils'

const NAV_WIDTH = '260px'
const INSPECTOR_WIDTH = '300px'

/** App shell 3 colonnes (nav / chat / inspecteur), replis indépendants
 * animés via grid-template-columns.
 *
 * `overlay` (mobile) : le chat prend toute la largeur, les deux panneaux
 * glissent par-dessus depuis leur bord avec un voile ; toucher le voile
 * appelle `onDismiss`. */
export function AppShell(props: {
  navCollapsed: boolean
  inspectorCollapsed: boolean
  sidebar: ReactNode
  inspector: ReactNode
  children: ReactNode
  overlay?: boolean
  onDismiss?: () => void
}) {
  if (props.overlay) {
    const anyOpen = !props.navCollapsed || !props.inspectorCollapsed
    return (
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{props.children}</div>

        <div
          aria-hidden="true"
          onClick={props.onDismiss}
          className={cn(
            'absolute inset-0 z-40 bg-[#222222]/50 transition-opacity duration-200',
            anyOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          )}
        />
        <aside
          className={cn(
            'absolute inset-y-0 left-0 z-50 w-[85vw] max-w-[300px] border-r border-border bg-secondary shadow-xl transition-transform duration-200 ease-out',
            props.navCollapsed && '-translate-x-full'
          )}
        >
          {props.sidebar}
        </aside>
        <aside
          className={cn(
            'absolute inset-y-0 right-0 z-50 w-[85vw] max-w-[320px] border-l border-border bg-card shadow-xl transition-transform duration-200 ease-out',
            props.inspectorCollapsed && 'translate-x-full'
          )}
        >
          {props.inspector}
        </aside>
      </div>
    )
  }

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
