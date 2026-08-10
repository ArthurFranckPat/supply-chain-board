import * as React from 'react'
import { Link } from '@inertiajs/react'
import { usePage as useInertiaPage, router } from '@inertiajs/react'
import { ChevronsUpDown, LogOut } from 'lucide-react'

import { NAV_SECTIONS, type NavKey } from '@r/lib/nav'
import { cn } from '@r/lib/utils'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@r/components/ui/sidebar'

function initials(username: string): string {
  const parts = username
    .trim()
    .split(/[.\-_\s]+/)
    .filter(Boolean)
  const raw = parts.length >= 2 ? parts[0][0] + parts[1][0] : username.slice(0, 2)
  return raw.toUpperCase()
}

export function AppSidebar({ active }: { active: NavKey }) {
  const page = useInertiaPage<{ authUser: { username: string; env: 'test' | 'prod' } | null }>()
  const user = page.props.authUser
  const env = user?.env

  return (
    <Sidebar collapsible="icon" variant="inset" className="print:hidden">
      <SidebarHeader className="gap-0 px-2 py-3">
        <div className="flex items-center gap-2 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-foreground text-background font-bold text-[11px] tracking-tight">
            SC
          </div>
          <div className="flex min-w-0 flex-col leading-none group-data-[collapsible=icon]:hidden">
            <span className="text-[13px] font-bold tracking-tight">
              Supply Chain <span className="text-primary">AERECO</span>
            </span>
            {env === 'test' && (
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--color-arches,#fc642d)]">
                Test
              </span>
            )}
          </div>
        </div>
        {env === 'test' && (
          <div className="mt-2 h-px w-full bg-[var(--color-arches,#fc642d)] opacity-60 group-data-[collapsible=icon]:hidden" />
        )}
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {NAV_SECTIONS.map((section) => (
          <SidebarGroup key={section.label} className="p-2 pt-0">
            <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 group-data-[collapsible=icon]:hidden">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const isActive = item.key === active
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        render={<Link href={item.href} prefetch />}
                        className={cn(
                          'h-7 px-2 text-[13px] font-medium',
                          isActive &&
                            'bg-white shadow-sm border border-border text-foreground hover:bg-white hover:text-foreground data-active:bg-white'
                        )}
                      >
                        <Icon size={16} strokeWidth={1.75} className="shrink-0" />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-2">
        {user ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="h-auto py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                tooltip={`${user.username} · ${user.env}`}
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-mono text-[10px] font-bold">
                  {initials(user.username)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-[13px] font-semibold">{user.username}</span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    Sage X3 · {user.env}
                  </span>
                </div>
                <ChevronsUpDown
                  size={14}
                  className="ml-auto shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
                />
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}

export default AppSidebar
