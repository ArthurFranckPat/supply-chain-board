import * as React from 'react'
import { Search, Bell } from 'lucide-react'

import { getSectionForKey, type NavKey } from '@r/lib/nav'
import { SidebarTrigger } from '@r/components/ui/sidebar'
import { cn } from '@r/lib/utils'

type TopBarProps = {
  active: NavKey
  subtitle: string
  meta?: React.ReactNode
  actions?: React.ReactNode
}

export function TopBar({ active, subtitle, meta, actions }: TopBarProps) {
  const section = getSectionForKey(active)

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-4 print:hidden">
      <SidebarTrigger className="-ml-1" />

      <div className="hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden="true" />

      {/* Breadcrumb Pulse : OVERVIEW › Dashboard */}
      <nav
        aria-label="Fil d'Ariane"
        className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium"
      >
        {section && (
          <>
            <span className="hidden uppercase tracking-[0.12em] text-muted-foreground sm:inline">
              {section.label}
            </span>
            <span className="hidden text-muted-foreground sm:inline" aria-hidden="true">
              ›
            </span>
          </>
        )}
        <span className="truncate font-semibold text-foreground">{subtitle}</span>
        {meta && (
          <span className="hidden items-center gap-2 truncate font-mono text-[11px] text-muted-foreground lg:flex">
            <span className="mx-1 hidden h-3 w-px bg-border lg:block" aria-hidden="true" />
            {meta}
          </span>
        )}
      </nav>

      <div className="flex flex-1 items-center justify-end gap-2">
        {/* Go to… pill — visuel Pulse, ⌘K */}
        <div
          className={cn(
            'hidden h-8 items-center gap-2 rounded-full border border-border bg-muted/40 px-3 text-[13px] text-muted-foreground sm:flex',
            'w-[220px] lg:w-[260px]'
          )}
          role="search"
          aria-label="Recherche rapide"
        >
          <Search size={14} strokeWidth={1.75} className="shrink-0" />
          <span className="flex-1 truncate text-left">Go to…</span>
          <kbd className="hidden items-center rounded bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground shadow-sm ring-1 ring-border lg:inline-flex">
            ⌘K
          </kbd>
        </div>

        {actions}

        <button
          type="button"
          aria-label="Notifications"
          className="relative flex size-8 items-center justify-center rounded-full border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Bell size={16} strokeWidth={1.75} />
          <span className="absolute -right-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
            2
          </span>
        </button>
      </div>
    </header>
  )
}

export default TopBar
