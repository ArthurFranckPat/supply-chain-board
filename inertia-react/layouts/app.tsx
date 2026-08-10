import * as React from 'react'
import { Head } from '@inertiajs/react'

import { cn } from '@r/lib/utils'
import { type NavKey } from '@r/lib/nav'
import { AppSidebar } from '@r/components/app-sidebar'
import { TopBar } from '@r/components/top-bar'
import { SidebarProvider, SidebarInset } from '@r/components/ui/sidebar'
import { TooltipProvider } from '@r/components/ui/tooltip'

/**
 * AppLayout — shell applicatif Sidebar (Pulse/Notion).
 *
 * Palette : sidebar #f7f6f3, accent hover #efede8, border #ebebeb,
 * wrapper #f7f6f3, carte principale blanche arrondie (via SidebarInset variant inset).
 * Basé sur shadcn Sidebar (SidebarProvider + Sidebar collapsible icon + SidebarInset).
 *
 * Masthead.tsx conservé mais non rendu (compat rollback).
 * Props inchangées pour les pages existantes.
 */

import type { MastheadTab } from '@r/components/masthead'

type ThemeVariant = 'airbnb' | 'stock' | 'navy'

interface AppLayoutProps {
  active: MastheadTab
  subtitle: string
  meta?: React.ReactNode
  mastheadActions?: React.ReactNode
  toolbar?: React.ReactNode
  footer?: React.ReactNode
  hideFooter?: boolean
  theme?: ThemeVariant
  dense?: boolean
  scrollable?: boolean
  maxWidth?: '7xl' | 'full'
  title?: string
  children: React.ReactNode
}

const THEME_SCOPE: Record<ThemeVariant, string> = {
  airbnb: 'theme-airbnb',
  stock: '',
  navy: 'theme-navy',
}

export function AppLayout({
  active,
  subtitle,
  meta,
  mastheadActions,
  toolbar,
  footer,
  hideFooter = false,
  theme = 'airbnb',
  dense = false,
  scrollable = true,
  maxWidth = '7xl',
  title,
  children,
}: AppLayoutProps) {
  // Map MastheadTab → NavKey (même ensemble, alias)
  const navKey = active as unknown as NavKey

  // Persistance de l'état replié : chaque navigation remonte un nouvel
  // AppLayout (page différente) donc un Provider frais. Sans état
  // contrôlé, `defaultOpen` ramène toujours en étendu — d'où le bug
  // « clic sur icône en collapsed ré-ouvre en extended ». On lit
  // `sidebar_state` (cookie posé par SidebarProvider) et on contrôle
  // le Provider depuis le layout.
  const [sidebarOpen, setSidebarOpen] = React.useState<boolean>(() => {
    if (typeof document === 'undefined') return true
    const m = document.cookie.match(/(?:^|; )sidebar_state=([^;]*)/)
    if (m) return m[1] === 'true'
    return true
  })

  return (
    <TooltipProvider>
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        style={
          {
            '--sidebar-width': '16rem',
            '--sidebar-width-icon': '3rem',
          } as React.CSSProperties
        }
        className={cn(THEME_SCOPE[theme], dense && 'print:h-auto print:overflow-visible')}
      >
        {title && <Head title={title} />}
        <AppSidebar active={navKey} />

        <SidebarInset
          data-app-layout="sidebar"
          data-app-layout-inset
          className={cn(
            'flex min-h-svh flex-1 flex-col overflow-hidden bg-background',
            dense && 'print:h-auto print:overflow-visible',
            'print:m-0 print:rounded-none print:shadow-none'
          )}
        >
          <TopBar active={navKey} subtitle={subtitle} meta={meta} actions={mastheadActions} />

          {toolbar && (
            <div className="flex min-h-[56px] flex-none items-center gap-2 border-b border-border bg-background px-4 py-2.5 print:hidden">
              {toolbar}
            </div>
          )}

          <main
            className={cn(
              'flex flex-1 min-h-0 flex-col',
              scrollable ? 'overflow-y-auto' : 'overflow-hidden',
              !dense && 'px-4 py-3',
              dense && 'overflow-hidden p-0'
            )}
          >
            <div
              className={cn(
                'mx-auto w-full flex-1 min-h-0',
                maxWidth === '7xl' && !dense && 'max-w-7xl',
                dense && 'max-w-none h-full'
              )}
            >
              {children}
            </div>
          </main>

          {!hideFooter && !dense && (
            <footer className="flex h-8 flex-none items-center justify-between border-t border-border bg-background px-4 text-[11px] text-muted-foreground print:hidden">
              {footer ?? <DefaultFooter />}
            </footer>
          )}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function DefaultFooter() {
  return (
    <>
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-ferme" aria-hidden="true" />
        <span className="font-mono">Connecté à Sage X3</span>
      </span>
      <span className="font-mono">Supply Chain Board · v0.2</span>
    </>
  )
}

export default AppLayout
