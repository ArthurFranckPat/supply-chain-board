import { useEffect, useRef, useState } from 'react'
import { router, usePage } from '@inertiajs/react'

import { cn } from '@r/lib/utils'

/** Identité partagée par `inertia_middleware.share()` sur toutes les pages. */
type AuthUser = { username: string; env: 'test' | 'prod' } | null

/** Initiales (2 lettres) dérivées du username pour la pastille avatar. */
function initials(username: string): string {
  const parts = username
    .trim()
    .split(/[.\-_\s]+/)
    .filter(Boolean)
  const raw = parts.length >= 2 ? parts[0][0] + parts[1][0] : username.slice(0, 2)
  return raw.toUpperCase()
}

/**
 * Profil utilisateur minimal (issue #13) : pastille avatar cliquable qui
 * ouvre un menu avec l'identité X3 courante et un bouton de déconnexion.
 * Port React du composant Solid (rendu shadcn stock).
 */
export function UserMenu() {
  const page = usePage<{ authUser: AuthUser }>()
  const user = page.props.authUser

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Fermeture au clic extérieur (menu léger, pas de portail).
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [])

  if (!user) return null

  function logout() {
    setOpen(false)
    router.post('/logout', {})
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        title={user.username}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex size-7 items-center justify-center rounded-full font-mono text-[10px] font-bold uppercase transition-opacity hover:opacity-85',
          'bg-primary text-primary-foreground'
        )}
      >
        {initials(user.username)}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-50 w-56 overflow-hidden rounded-lg border bg-card shadow-lg"
        >
          <div className="border-b px-3 py-2.5">
            <div className="truncate text-[13px] font-semibold text-foreground">
              {user.username}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Sage X3 · {user.env}
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
