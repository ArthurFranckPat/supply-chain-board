'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { RiLogoutBoxRLine } from '@remixicon/react'
import { router, usePage } from '@inertiajs/react'
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  DialogTrigger as AriaDialogTrigger,
  Popover as AriaPopover,
} from 'react-aria-components'
import { Avatar } from '@r/components/base/avatar/avatar'
import { Badge } from '@r/components/base/badges/badge'
import { Button } from '@r/components/base/buttons/button'
import { ChevronUpDownSmall } from '@r/components/foundations/icons/chevrons'
import { cx } from '@r/utils/cx'

/**
 * Figma source: Board UI → sidebar account menu (node 3828:3895).
 *
 * Menu ouvert depuis le sélecteur de la sidebar (avatar + nom + chevron).
 * BRANCHÉ SUR LA SESSION : l'identité vient de la prop Inertia partagée
 * `authUser` (middleware Inertia — username + environnement X3), plus des
 * affichages factices « users with access » du template BoardUI. Le menu
 * porte l'identité réelle (initiales dérivées du username), l'environnement
 * X3 courant, et l'action de déconnexion (POST /logout).
 */

type AvatarColor = 'neutral' | 'lime' | 'pink'

type AuthUser = { username: string; env: string } | null

/** Initiales dérivées du username : « jean.dupont » → « JD », « abl » → « AB ».
 *  Le nom complet n'existe pas côté session — le username X3 fait office. */
function initialsOf(username: string): string {
  const parts = username.split(/[.\s_-]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return username.slice(0, 2).toUpperCase()
}

/** Label slot on the trigger: blurs + fades away as the rail collapses. */
function Collapsible({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <span
      className={cx(
        'flex min-w-0 items-center overflow-hidden transition-[max-width,opacity,filter] duration-300 ease-in-out',
        collapsed ? 'max-w-0 opacity-0 blur-[3px]' : 'max-w-40 opacity-100 blur-0'
      )}
    >
      {children}
    </span>
  )
}

/** Le contenu du panneau — identité de session + déconnexion — exposé pour
 *  d'autres déclencheurs éventuels. */
export function AccountMenuContent() {
  const user = usePage<{ authUser: AuthUser }>().props.authUser
  const name = user?.username ?? 'Invité'

  return (
    <>
      {/* Identité de session */}
      <div className="flex w-full flex-col gap-1.5 pt-[5px]">
        <span className="px-2 text-body-medium text-text-secondary">Connecté</span>
        <div className="flex w-full items-center gap-2 rounded-2lg px-2 py-1.5">
          <Avatar size="xs" color="neutral" initials={initialsOf(name)} />
          <span className="min-w-0 flex-1 truncate text-body-medium text-text-primary">{name}</span>
          {user && (
            <Badge color="neutral" title="Environnement X3 de la session">
              X3 {user.env}
            </Badge>
          )}
        </div>
      </div>

      {/* Divider centered in the 28px gap between the list and the actions */}
      <div className="-mx-2.5 my-3.5 h-px bg-border-button-default" />

      {/* Actions */}
      <div className="flex w-full px-2 pb-2">
        <Button
          variant="secondary"
          size="small"
          leadingIcon={RiLogoutBoxRLine}
          className="w-full"
          onClick={() => router.post('/logout', {})}
        >
          Se déconnecter
        </Button>
      </div>
    </>
  )
}

export function DashboardUserMenu({
  collapsed = false,
  suppressHover = false,
  onHoverSuppressionEnd,
  avatarClassName,
}: {
  collapsed?: boolean
  /** Prevents expansion from creating a hover state under a stationary pointer. */
  suppressHover?: boolean
  /** Re-arms hover after the pointer fully leaves the trigger. */
  onHoverSuppressionEnd?: () => void
  avatarClassName?: string
}) {
  const user = usePage<{ authUser: AuthUser }>().props.authUser
  const name = user?.username ?? 'Invité'
  const [isOpen, setIsOpen] = useState(false)
  // "right" placement assumes room to the sidebar's right (true in-flow on
  // desktop) — on mobile the sidebar can span the full viewport, so the
  // 265px panel would render off-screen. Below sm, drop into a plain
  // dropdown under the trigger instead.
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    setIsMobile(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return (
    <AriaDialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <AriaButton
        aria-label={name}
        onPointerLeave={() => {
          if (suppressHover) onHoverSuppressionEnd?.()
        }}
        className={cx(
          'relative flex min-w-0 cursor-pointer items-center gap-2 rounded-full outline-none',
          'focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2',
          // Hover pill (Figma node 3829:4063): a fully-rounded 2px border/button/hover
          // outline drawn via a pseudo-element so it never shifts the layout.
          'before:pointer-events-none before:absolute before:-inset-x-1.5 before:-inset-y-[5px] before:rounded-full before:border-2 before:border-transparent before:transition-colors before:duration-150',
          !suppressHover && 'hover:before:border-border-sidebar-profile-hover',
          // Collapsed, the trigger takes the rail's own 36px column and centres
          // the 32px avatar in it, instead of sizing to the avatar plus a gap
          // held open for a label that's shrunk to nothing. That gap made the
          // button 42px wide in a 36px rail, which pushed its hover pill
          // off-centre and into the rail's clip.
          //
          // The pill's insets go square too: 36×32 plus the expanded 6/5 reach
          // is a 48×42 stadium, not the circle the avatar wants. 3/5 lands it
          // on 42×42.
          collapsed && 'w-9 justify-center gap-0 before:-inset-x-[3px]'
        )}
      >
        <Avatar size="md" color="neutral" initials={initialsOf(name)} className={avatarClassName} />
        <Collapsible collapsed={collapsed}>
          <span className="flex items-center gap-0.5">
            <span className="truncate text-body-medium whitespace-nowrap text-text-primary">
              {name}
            </span>
            <ChevronUpDownSmall className="size-4 shrink-0 text-foreground-icon-tertiary" />
          </span>
        </Collapsible>
      </AriaButton>

      <AriaPopover
        placement={isMobile ? 'bottom start' : 'right top'}
        offset={8}
        className={cx(
          'w-[265px] max-w-[calc(100vw-32px)] origin-top-left overflow-y-auto',
          'rounded-2xl border border-border-button-default bg-background-primary-default p-2.5 shadow-dropdown',
          'transition duration-150 ease-out',
          'data-[entering]:opacity-0 data-[entering]:scale-95 data-[entering]:blur-[2px]',
          'data-[exiting]:opacity-0 data-[exiting]:scale-95 data-[exiting]:blur-[2px]'
        )}
      >
        <AriaDialog aria-label="Menu du compte" className="flex flex-col outline-none">
          <AccountMenuContent />
        </AriaDialog>
      </AriaPopover>
    </AriaDialogTrigger>
  )
}
