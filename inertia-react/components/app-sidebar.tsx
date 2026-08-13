import { Link } from '@inertiajs/react'
import { usePage as useInertiaPage } from '@inertiajs/react'
import { ChevronsUpDown } from 'lucide-react'

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
} from '@r/components/ui/sidebar'

function initials(username: string): string {
  const parts = username
    .trim()
    .split(/[.\-_\s]+/)
    .filter(Boolean)
  const raw = parts.length >= 2 ? parts[0][0] + parts[1][0] : username.slice(0, 2)
  return raw.toUpperCase()
}

/**
 * Sidebar applicatif.
 *
 * `tone="cursor"` : dashboard produit Cursor (gris froid #eee, actif #e5e5e5,
 * radius 8, avatar rond vert). Défaut = Pulse/Airbnb pour les autres pages.
 */
export function AppSidebar({
  active,
  tone = 'default',
}: {
  active: NavKey
  tone?: 'default' | 'cursor'
}) {
  const page = useInertiaPage<{ authUser: { username: string; env: 'test' | 'prod' } | null }>()
  const user = page.props.authUser
  const env = user?.env
  const cursor = tone === 'cursor'

  return (
    <Sidebar collapsible="offcanvas" className="print:hidden">
      <SidebarHeader className={cn('gap-0 px-2', cursor ? 'py-4' : 'py-3')}>
        <div className="flex items-center gap-2.5 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div
            className={cn(
              'flex size-7 shrink-0 items-center justify-center text-[11px] tracking-tight',
              cursor
                ? 'rounded-[8px] bg-foreground font-medium text-background'
                : 'rounded-lg bg-foreground font-bold text-background'
            )}
          >
            SC
          </div>
          <div className="flex min-w-0 flex-col leading-none group-data-[collapsible=icon]:hidden">
            <span
              className={cn('text-[13px] tracking-tight', cursor ? 'font-medium' : 'font-bold')}
            >
              Supply Chain <span className="text-brand">AERECO</span>
            </span>
            {env === 'test' && (
              <span
                className={cn(
                  'text-[10px] uppercase',
                  cursor
                    ? 'font-medium tracking-[0.04em] text-muted-foreground'
                    : 'font-bold tracking-[0.14em] text-[var(--color-arches,#fc642d)]'
                )}
              >
                Test
              </span>
            )}
          </div>
        </div>
        {env === 'test' && !cursor && (
          <div className="mt-2 h-px w-full bg-[var(--color-arches,#fc642d)] opacity-60 group-data-[collapsible=icon]:hidden" />
        )}
      </SidebarHeader>

      <SidebarContent className="gap-1">
        {NAV_SECTIONS.map((section) => (
          <SidebarGroup key={section.label} className={cn('px-2', cursor ? 'py-1' : 'pt-0')}>
            <SidebarGroupLabel
              className={cn(
                'px-2 group-data-[collapsible=icon]:hidden',
                cursor
                  ? 'mb-0.5 text-[11px] font-normal normal-case tracking-normal text-muted-foreground'
                  : 'text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70'
              )}
            >
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className={cursor ? 'gap-0.5' : undefined}>
                {section.items.map((item) => {
                  const isActive = item.key === active
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton
                        isActive={isActive}
                        tooltip={item.label}
                        render={
                          <Link
                            href={item.href}
                            prefetch={!isActive}
                            onClick={(e) => {
                              // Config est actif sur calendrier, impressions et
                              // journal : sans ça, le clic reprend l'href section
                              // (calendrier) et /configuration/impressions se
                              // recharge via l'onglet au retour (X3 à chaque fois).
                              if (isActive) e.preventDefault()
                            }}
                          />
                        }
                        className={cn(
                          'px-2 text-[13px]',
                          cursor ? 'h-8 rounded-[8px] font-normal' : 'h-7 font-medium',
                          isActive &&
                            (cursor
                              ? 'border-0 bg-[var(--sidebar-selected,#e8e8e8)] text-foreground shadow-none hover:bg-[var(--sidebar-selected,#e8e8e8)] hover:text-foreground data-active:bg-[var(--sidebar-selected,#e8e8e8)]'
                              : 'border border-border bg-white text-foreground shadow-sm hover:bg-white hover:text-foreground data-active:bg-white')
                        )}
                      >
                        <Icon size={16} strokeWidth={cursor ? 1.5 : 1.75} className="shrink-0" />
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
                className={cn(
                  'h-auto py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
                  cursor && 'rounded-[8px]'
                )}
                tooltip={`${user.username} · ${user.env}`}
              >
                <div
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center font-mono text-[10px]',
                    cursor
                      ? 'rounded-full bg-secondary font-medium text-foreground'
                      : 'rounded-full bg-primary font-bold text-primary-foreground'
                  )}
                >
                  {initials(user.username)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span
                    className={cn('truncate text-[13px]', cursor ? 'font-medium' : 'font-semibold')}
                  >
                    {user.username}
                  </span>
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
    </Sidebar>
  )
}

export default AppSidebar
