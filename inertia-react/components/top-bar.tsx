import * as React from 'react'

import { type NavKey } from '@r/lib/nav'
import { SidebarTrigger } from '@r/components/ui/sidebar'

type TopBarProps = {
  active: NavKey
  subtitle: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  quiet?: boolean
}

export function TopBar({ active: _active, subtitle, meta, actions }: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-sidebar-border bg-[var(--sidebar-canvas)] px-6 print:hidden">
      <SidebarTrigger className="-ml-1" />

      <div className="hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden="true" />

      <nav
        aria-label="Fil d'Ariane"
        className="flex min-w-0 items-center gap-2 text-xs font-normal"
      >
        <span className="truncate text-sm font-normal tracking-[-0.02em] text-foreground">
          {subtitle}
        </span>
        {meta && (
          <span className="hidden items-center gap-2 truncate font-mono text-xs text-muted-foreground lg:flex">
            <span className="mx-1 hidden h-3 w-px bg-border lg:block" aria-hidden="true" />
            {meta}
          </span>
        )}
      </nav>

      {actions && <div className="flex flex-1 items-center justify-end gap-2">{actions}</div>}
    </header>
  )
}

export default TopBar
