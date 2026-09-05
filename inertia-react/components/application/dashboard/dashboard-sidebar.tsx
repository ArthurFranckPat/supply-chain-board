'use client'

import { useState, type ComponentType, type ReactNode } from 'react'
import {
  RiAsterisk,
  RiBankLine,
  RiCalendarLine,
  RiChatAiLine,
  RiCloseLine,
  RiHomeLine,
  RiImageAiLine,
  RiMegaphoneLine,
  RiSettings4Line,
  RiSideBarFill,
  RiUserSmileLine,
} from '@remixicon/react'
import { SettingsModal } from '@r/components/application/settings/settings-modal'
import { ThemeToggle } from '@r/components/application/theme/theme-toggle'
import { Badge } from '@r/components/base/badges/badge'
import { DataStatus } from '@r/components/data-status'
import { cx } from '@r/utils/cx'
import { DashboardUserMenu } from './dashboard-user-menu'

/**
 * Figma sources:
 *   expanded  → Board UI → dashboard 1 → Sidebar (node 3731:2934)
 *   collapsed → Board UI → Sidebar (node 3768:3382)
 *
 * Floating sidebar panel. Expanded: 260px wide, p 12, radius/3xl (24px),
 * white 1px border, "Background/Sidebar Elevation" shadow, bg
 * background/secondary. Collapsed: 60px wide (36px icon items + 12px
 * padding); collapse button sits centered above the workspace avatar, quick
 * search becomes a 36px neutral-200 square, nav items become icon-only
 * squares, the team card reduces to its avatar.
 *
 * The two states morph into each other: the panel width animates while
 * labels / badges / kbd collapse via max-width + opacity.
 */

type IconComponent = ComponentType<{
  'className'?: string
  'aria-hidden'?: boolean | 'true' | 'false'
}>

/**
 * Collapsible text/badge slot: blurs + fades + shrinks away when the rail
 * closes, and blurs back in on expand. The icons/rows themselves stay pinned in
 * place — only these label/badge slots animate — so nothing jumps to center.
 */
function Collapsible({
  collapsed,
  children,
  className,
}: {
  collapsed: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cx(
        'flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out',
        // Expanded, the cap is the row itself: a fixed cap (it was 160px)
        // clipped any label wider than it, "Components and Blocks" included.
        collapsed ? 'max-w-0 opacity-0 blur-[3px]' : 'max-w-full opacity-100 blur-0',
        className
      )}
    >
      {children}
    </span>
  )
}

function NavItem({
  icon: Icon,
  label,
  badge,
  isSelected = false,
  collapsed = false,
  href = '#',
  onClick,
}: {
  icon: IconComponent
  label: string
  badge?: ReactNode
  isSelected?: boolean
  collapsed?: boolean
  href?: string
  /** Action rows (e.g. Settings → modal) intercept the navigation. */
  onClick?: () => void
}) {
  return (
    <a
      href={href}
      onClick={
        onClick
          ? (event) => {
              event.preventDefault()
              onClick()
            }
          : undefined
      }
      aria-current={isSelected ? 'page' : undefined}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={cx(
        'flex items-center justify-between overflow-hidden rounded-2lg p-2',
        'transition-[width,background-color] duration-300 ease-in-out',
        collapsed ? 'w-9' : 'w-full',
        isSelected
          ? 'bg-linear-to-b from-accent-500 to-accent-600 shadow-nav-selected'
          : 'hover:bg-background-secondary-hover'
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Icon
          className={cx(
            'size-5 shrink-0',
            isSelected ? 'text-white' : 'text-foreground-icon-secondary'
          )}
          aria-hidden
        />
        <Collapsible collapsed={collapsed}>
          <span
            className={cx(
              'text-body-medium whitespace-nowrap',
              isSelected ? 'text-white' : 'text-text-secondary'
            )}
          >
            {label}
          </span>
        </Collapsible>
      </span>
      {badge && <Collapsible collapsed={collapsed}>{badge}</Collapsible>}
    </a>
  )
}

/** A primary navigation row. Rows without an `href` are decoration only. */
export interface DashboardNavItem {
  key: string
  label: string
  icon: IconComponent
  href?: string
  badge?: string | number
}

/** Kept as a name for callers that typed their `selected` prop; any key works. */
export type DashboardNavKey = string

/** The Pro dashboard's navigation, the default set. */
export const DASHBOARD_NAV: DashboardNavItem[] = [
  { key: 'home', label: 'Home', icon: RiHomeLine, href: '/templates/dashboard', badge: 152 },
  { key: 'marketing', label: 'Marketing', icon: RiMegaphoneLine, href: '/templates/marketing' },
  { key: 'calendar', label: 'Calendar', icon: RiCalendarLine, href: '/templates/calendar' },
  { key: 'finance', label: 'Finance', icon: RiBankLine, href: '/templates/finance' },
  { key: 'medical', label: 'Medical Report', icon: RiAsterisk, href: '/templates/medical-profile' },
  { key: 'ai-chat', label: 'AI Chat', icon: RiChatAiLine, href: '/templates/ai-chat' },
  {
    key: 'ai-image',
    label: 'AI Image Generation',
    icon: RiImageAiLine,
    href: '/templates/ai-image-generation',
  },
  { key: 'profile', label: 'Profile', icon: RiUserSmileLine, href: '/templates/ai-profile' },
]

/**
 * The primary rows. A component of its own so the closures over `collapsed`
 * live here: built inline in the sidebar, the compiler could not tell they
 * leave `mobile` untouched and dropped the sidebar's manual memoization.
 */
function NavRows({
  items,
  selected,
  collapsed,
}: {
  items: DashboardNavItem[]
  selected: string
  collapsed: boolean
}) {
  return items.map((item) => {
    const isSelected = selected === item.key
    return (
      <NavItem
        key={item.key}
        icon={item.icon}
        label={item.label}
        href={item.href}
        isSelected={isSelected}
        collapsed={collapsed}
        badge={
          item.badge !== undefined ? (
            <Badge color={isSelected ? 'primary' : 'neutral'}>{item.badge}</Badge>
          ) : undefined
        }
      />
    )
  })
}

export function DashboardSidebar({
  mobile = false,
  onClose,
  fluid = false,
  showThemeToggle = true,
  selected = 'home',
  items = DASHBOARD_NAV,
  flat = false,
  className,
}: {
  /** Rendered inside the mobile drawer: always expanded, close button instead of collapse. */
  mobile?: boolean
  onClose?: () => void
  /** Expanded width fills its container below `lg` instead of the fixed
   *  260px (e.g. the landing page, where the sidebar isn't in a drawer).
   *  Collapsed width stays the fixed 60px rail at every breakpoint — the
   *  whole point of collapsing is to shrink, so it must never get
   *  overridden back to full width. */
  fluid?: boolean
  /** Hide the app-level theme control when the sidebar is used as marketing artwork. */
  showThemeToggle?: boolean
  /** Which nav item shows the selected (filled blue) state. */
  selected?: DashboardNavKey
  /** Primary navigation rows. The Pro dashboard's set unless a screen brings its own. */
  items?: DashboardNavItem[]
  /** Removes the floating panel treatment for a sidebar revealed beneath mobile content. */
  flat?: boolean
  className?: string
} = {}) {
  const [collapsedState, setCollapsed] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [suppressUserHover, setSuppressUserHover] = useState(false)
  const collapsed = mobile ? false : collapsedState

  return (
    <aside
      className={cx(
        'flex h-full shrink-0 flex-col justify-between overflow-hidden',
        flat
          ? 'bg-background-full'
          : 'rounded-3xl border border-border-button-white bg-background-secondary-default shadow-sidebar',
        'transition-[width] duration-300 ease-in-out',
        // Collapsed rail keeps the 60px spec: 1px border + 11px padding on each
        // side leaves an exactly 36px column so the w-9 (36px) icon items center.
        collapsed ? 'w-[60px] px-[11px] py-3' : fluid ? 'w-full p-3 lg:w-[260px]' : 'w-[260px] p-3',
        className
      )}
    >
      {/* `overflow-y: auto` forces the x axis to clip too, and this box hugs
          its contents on every side — so the selected item's 1px ring, the
          profile's hover pill (which outsets 6px) and focus rings all landed
          outside it. Padding moves the clip edge out; the matching negative
          margin borrows that space back from the rail's own padding, leaving
          every child exactly where it was. */}
      <div className="-m-2 flex min-h-0 w-[calc(100%+16px)] flex-col gap-3 overflow-y-auto p-2 [scrollbar-width:none]">
        {/* Workspace switcher / collapse control */}
        <div
          className={cx(
            'flex w-full transition-[gap] duration-300 ease-in-out',
            collapsed
              ? 'flex-col-reverse items-start justify-center gap-2.5'
              : 'flex-row items-center justify-between'
          )}
        >
          {/* The clip is here to hide the label as `max-width` animates shut,
              but it also cropped the trigger's hover pill down to four corner
              arcs. Same trick as the scroller: pad the clip box out by the
              pill's 8px reach and pull it back with a negative margin, so the
              widths below are 16px larger than the footprint they produce. */}
          <div
            className={cx(
              '-m-2 min-w-0 overflow-hidden p-2 transition-[max-width,opacity,transform] duration-300 ease-in-out',
              'max-w-[206px] scale-100 opacity-100'
            )}
          >
            <DashboardUserMenu
              collapsed={collapsed}
              suppressHover={suppressUserHover}
              onHoverSuppressionEnd={() => setSuppressUserHover(false)}
              avatarClassName={
                flat
                  ? 'bg-background-tertiary-default dark:bg-background-secondary-default'
                  : undefined
              }
            />
          </div>
          {mobile ? (
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={onClose}
              className="cursor-pointer text-foreground-icon-secondary"
            >
              <RiCloseLine className="size-5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              onClick={() => {
                const isExpanding = collapsedState
                setCollapsed(!collapsedState)
                setSuppressUserHover(isExpanding)
              }}
              className={cx(
                'cursor-pointer text-foreground-icon-secondary transition-transform duration-300 ease-in-out',
                collapsed && 'flex w-9 items-center justify-center'
              )}
            >
              <RiSideBarFill
                className={cx(
                  'size-5 transition-transform duration-300 ease-in-out',
                  !collapsed && '-scale-x-100'
                )}
                aria-hidden
              />
            </button>
          )}
        </div>

        <div className="flex w-full flex-col gap-3">
          {/* Primary nav. The 2px inset is for the expanded rail only: the
              collapsed column is exactly as wide as a 36px item, so padding
              here pushes every item 2px right and the rail's own clip shaves
              that much off its selected fill and hover state. */}
          <nav className={cx('flex w-full flex-col gap-1', !collapsed && 'px-0.5')}>
            <NavRows items={items} selected={selected} collapsed={collapsed} />
          </nav>
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-1">
        {/* Paramètres + bascule de thème sur une MÊME rangée : le toggle n'est
            plus une pilule orpheline flottant au milieu du rail. Icône seule
            (variante `collapsed` du composant) : elle montre le mode d'arrivée
            (soleil en dark, lune en light) et reste au service du clavier. */}
        <div
          className={cx(
            'w-full items-center',
            collapsed ? 'flex flex-col gap-1' : 'flex flex-row justify-between gap-1'
          )}
        >
          <div className={collapsed ? 'w-full' : 'min-w-0 flex-1'}>
            <NavItem
              icon={RiSettings4Line}
              label="Paramètres"
              collapsed={collapsed}
              onClick={() => setSettingsOpen(true)}
            />
          </div>
          {showThemeToggle && <ThemeToggle collapsed className="shrink-0" />}
        </div>

        {/* DataStatus intégré après retrait du topbar — variante compacte :
            pastille de fraîcheur, « maj HH:MM · il y a n min » et ⟳. La durée
            de chargement et le récap de diff restent au masthead (tooltip
            inchangé au survol). Aucune boîte : dans un rail, une boîte se lit
            comme un champ de saisie. */}
        {!collapsed && <DataStatus variant="compact" className="px-2 pb-1" />}
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        planArtSrc="/templates/settings-plan-art.png"
      />
    </aside>
  )
}
