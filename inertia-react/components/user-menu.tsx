import React, { useState, useEffect, useRef } from 'react'
import { router, usePage } from '@inertiajs/react'
import { cn } from '@/libs/cn'

type AuthUser = { username: string; env: 'test' | 'prod' } | null

function initials(username: string): string {
  const parts = username
    .trim()
    .split(/[.\-_\s]+/)
    .filter(Boolean)
  const raw = parts.length >= 2 ? parts[0][0] + parts[1][0] : username.slice(0, 2)
  return raw.toUpperCase()
}

export function UserMenu({ tone }: { tone?: 'terra' | 'primary' }) {
  const { authUser } = usePage().props as unknown as { authUser: AuthUser }
  const [open, setOpen] = useState(false)
  const rootEl = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootEl.current && !rootEl.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  if (!authUser) return null

  const logout = () => {
    setOpen(false)
    router.post('/logout')
  }

  const avatarTone =
    tone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-brand text-card'

  return (
    <div className="relative" ref={rootEl}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        title={authUser.username}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex size-7 items-center justify-center rounded-full font-mono text-[10px] font-bold uppercase transition-opacity hover:opacity-85',
          avatarTone
        )}
      >
        {initials(authUser.username)}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-50 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          <div className="border-b border-border px-3 py-2.5">
            <div className="truncate text-[13px] font-semibold text-foreground">{authUser.username}</div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Sage X3 · {authUser.env}
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60"
          >
            <span className="material-symbols-outlined text-[18px] text-muted-foreground">
              logout
            </span>
            Déconnexion
          </button>
        </div>
      )}
    </div>
  )
}

export default UserMenu
