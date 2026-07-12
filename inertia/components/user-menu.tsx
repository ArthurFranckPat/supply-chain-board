import type { Component } from 'solid-js'
import { Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { router, usePage } from '@/lib/inertia-solid'
import { cn } from '@/libs/cn'

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
 *
 * Lit `authUser` depuis les props partagées Inertia ; ne rend rien si
 * personne n'est connecté. `tone` adapte la couleur à la page hôte :
 * `terra` pour les pages Papier, `primary` pour le shell ruptures.
 */
export const UserMenu: Component<{ tone?: 'terra' | 'primary' }> = (props) => {
  const page = usePage<{ authUser: AuthUser }>()
  const user = createMemo(() => page.props.authUser)

  const [open, setOpen] = createSignal(false)
  let rootEl: HTMLDivElement | undefined

  // Fermeture au clic extérieur (menu léger, pas de portail Kobalte).
  const onDocClick = (e: MouseEvent) => {
    if (rootEl && !rootEl.contains(e.target as Node)) setOpen(false)
  }
  document.addEventListener('click', onDocClick)
  onCleanup(() => document.removeEventListener('click', onDocClick))

  function logout() {
    setOpen(false)
    router.post('/logout', {})
  }

  const avatarTone = () =>
    props.tone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-brand text-card'

  return (
    <Show when={user()}>
      {(u) => (
        <div class="relative" ref={rootEl}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            title={u().username}
            aria-haspopup="menu"
            aria-expanded={open()}
            class={cn(
              'flex size-7 items-center justify-center rounded-full font-mono text-[10px] font-bold uppercase transition-opacity hover:opacity-85',
              avatarTone()
            )}
          >
            {initials(u().username)}
          </button>

          <Show when={open()}>
            <div
              role="menu"
              class="absolute right-0 top-9 z-50 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
            >
              <div class="border-b border-border px-3 py-2.5">
                <div class="truncate text-[13px] font-semibold text-foreground">{u().username}</div>
                <div class="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Sage X3 · {u().env}
                </div>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={logout}
                class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60"
              >
                <span class="material-symbols-outlined text-[18px] text-muted-foreground">
                  logout
                </span>
                Déconnexion
              </button>
            </div>
          </Show>
        </div>
      )}
    </Show>
  )
}

export default UserMenu
