import * as React from 'react'
import { Head } from '@inertiajs/react'

import { cn } from '@r/lib/utils'
import { type NavKey } from '@r/lib/nav'
import { AppSidebar } from '@r/components/app-sidebar'
import { TopBar } from '@r/components/top-bar'
import { useThemeBody } from '@r/lib/theme-body'
import { SidebarProvider, SidebarInset } from '@r/components/ui/sidebar'
import { TooltipProvider } from '@r/components/ui/tooltip'

/**
 * AppLayout — shell applicatif Sidebar.
 *
 * Sidebar `offcanvas` : fermée = absente (seul le SidebarTrigger reste).
 * Thèmes : `airbnb` (défaut pages legacy), `cursor` (dashboard pilot).
 * Surfaces via tokens `--sidebar` / `--sidebar-canvas`.
 */

import type { MastheadTab } from '@r/components/masthead'

type ThemeVariant = 'airbnb' | 'cursor' | 'stock' | 'navy'

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
  /** Board Operate : TopBar sans Go to / notifs factices. */
  quietChrome?: boolean
  title?: string
  children: React.ReactNode
}

const THEME_SCOPE: Record<ThemeVariant, string> = {
  airbnb: 'theme-airbnb',
  cursor: 'theme-cursor',
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
  quietChrome = false,
  title,
  children,
}: AppLayoutProps) {
  // Map MastheadTab → NavKey (même ensemble, alias)
  const navKey = active as unknown as NavKey

  // Les portails Base UI rendent dans document.body : le thème doit y être
  // posé aussi, sinon Dialog/Sheet/Select/Tooltip retombent sur Airbnb.
  useThemeBody(THEME_SCOPE[theme])

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
  // Pas de transition width au premier paint : sinon le gap sidebar anime
  // 16rem ↔ 3rem et la grille KPI grossit frame par frame.
  const [sidebarMotion, setSidebarMotion] = React.useState(false)
  React.useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setSidebarMotion(true))
    return () => cancelAnimationFrame(id)
  }, [])

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
        className={cn(
          THEME_SCOPE[theme],
          dense && 'print:h-auto print:overflow-visible',
          !sidebarMotion &&
            '**:data-[slot=sidebar-gap]:transition-none **:data-[slot=sidebar-container]:transition-none'
        )}
      >
        {title && <Head title={title} />}
        <AppSidebar active={navKey} tone={theme === 'cursor' ? 'cursor' : 'default'} />

        <SidebarInset
          data-app-layout="sidebar"
          data-app-layout-inset
          className={cn(
            'flex min-h-svh flex-1 flex-col overflow-hidden bg-[var(--sidebar-canvas)]',
            dense && 'print:h-auto print:overflow-visible',
            'print:m-0 print:rounded-none print:shadow-none'
          )}
        >
          <TopBar
            active={navKey}
            subtitle={subtitle}
            meta={meta}
            actions={mastheadActions}
            quiet={quietChrome || dense}
          />

          {toolbar && (
            /* `data-slot` : c'est la RANGÉE qui impose sa hauteur de contrôle,
               pas chaque composant posé dedans. Sans crochet ici, un champ de
               formulaire (32 px, la bonne valeur dans une fiche) glissé entre
               deux pills de 24 px ne pouvait s'aligner qu'au prix d'un
               `!important` recopié dans chaque page. Voir « rangée d'outils »
               dans app.css. */
            <div
              data-slot="toolbar-row"
              className="flex min-h-12 flex-none items-center gap-3 border-b border-sidebar-border bg-[var(--sidebar-canvas)] px-6 py-2 print:hidden"
            >
              {toolbar}
            </div>
          )}

          <main
            className={cn(
              'flex min-h-0 flex-1 flex-col bg-[var(--sidebar-canvas)]',
              scrollable ? 'overflow-y-auto' : 'overflow-hidden',
              !dense && maxWidth === 'full' && !scrollable && 'px-6 pt-3 pb-4',
              !dense && !(maxWidth === 'full' && !scrollable) && 'px-6 py-4',
              dense && 'overflow-hidden p-0'
            )}
          >
            <div
              className={cn(
                'mx-auto w-full flex-1 min-h-0',
                maxWidth === '7xl' && !dense && 'max-w-7xl',
                maxWidth === 'full' && 'max-w-none',
                (dense || maxWidth === 'full') && !scrollable && 'h-full'
              )}
            >
              {children}
            </div>
          </main>

          {!hideFooter && !dense && (
            <footer className="flex h-9 flex-none items-center justify-between border-t border-sidebar-border bg-[var(--sidebar-canvas)] px-6 text-xs text-muted-foreground print:hidden">
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
