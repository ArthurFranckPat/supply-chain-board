import { useEffect, type ReactNode } from 'react'
import { Link, usePage } from '@inertiajs/react'

import { route } from '@/lib/routes'
import { isReactRoute } from '@/lib/react-routes'
import { cn } from '@r/lib/utils'
import UserMenu from '@r/components/user-menu'

/**
 * Masthead partagé du runtime React — port du masthead Solid.
 *
 * Deux variantes :
 *   • `stock`   — rendu shadcn par défaut, primary/border, Geist. Comportement
 *                 historique conservé pour les pages React migrées qui ne sont
 *                 pas encore passées au thème Airbnb.
 *   • `airbnb`  — aligné sur Airbnb DESIGN.md `top-nav` + `product-tab-active` :
 *                 hauteur 80px, wordmark Inter 700 22px (pas d'italique), onglet
 *                 actif souligné par une underline ink 2px (pas Rausch), texte
 *                 inactif en muted-foreground #6a6a6a.
 *
 * Navigation inter-runtimes : chaque onglet passe par `isReactRoute` — page
 * React → <Link> Inertia (XHR), page Solid → <a> natif (hard visit). Règle
 * §4.4 du plan de migration.
 */

export type MastheadTab =
  | 'dashboard'
  | 'programme'
  | 'load'
  | 'ruptures'
  | 'tracking'
  | 'expeditions'
  | 'receptions'
  | 'conditionnements'
  | 'promesse'
  | 'copilote'
  | 'config'

/** Onglets canoniques (ordre + cibles uniques) — miroir du masthead Solid. */
const TABS: { key: MastheadTab; label: string; href: string }[] = [
  { key: 'dashboard', label: 'Tableau', href: route('dashboard') },
  { key: 'programme', label: 'Programme', href: route('scheduler.programme') },
  { key: 'load', label: 'Charge', href: route('load.index') },
  { key: 'ruptures', label: 'Ruptures', href: route('scheduler.shortage_tracker') },
  { key: 'tracking', label: 'Suivi', href: route('suivi.board') },
  { key: 'expeditions', label: 'Expéditions', href: route('expeditions.index') },
  { key: 'receptions', label: 'Réceptions', href: route('receptions.index') },
  { key: 'conditionnements', label: 'Conditionnements', href: route('conditionnements.index') },
  { key: 'promesse', label: 'Promesse', href: route('promesse.show') },
  { key: 'copilote', label: 'Copilote', href: route('agent.show') },
  { key: 'config', label: 'Config', href: route('calendar_config.index') },
]

// Variant `stock` — comportement historique.
const tabClsStock = (active: boolean) =>
  cn(
    'border-b-2 px-3.5 py-2.5 text-[12px] font-semibold transition-colors',
    active
      ? 'border-primary text-primary'
      : 'border-transparent text-secondary-foreground hover:text-primary'
  )

// Variant `airbnb` — DESIGN.md `product-tab-active` / `product-tab-inactive` :
// • nav-link : 16px / 600 / 1.25 (cf. DESIGN.md typography.nav-link)
// • actif : underline ink 2px (border-foreground), texte ink (text-foreground)
// • inactif : texte muted-foreground #6a6a6a (DESIGN.md colors.muted)
// Rausch n'apparaît PAS dans la nav chez Airbnb — la marque est réservée
// aux CTA, à l'orbe search et au cœur saved.
const tabClsAirbnb = (active: boolean) =>
  cn(
    'border-b-2 px-4 py-3 text-[14px] font-semibold leading-tight transition-colors',
    active
      ? 'border-foreground text-foreground'
      : 'border-transparent text-muted-foreground hover:text-foreground'
  )

export function Masthead(props: {
  subtitle: string
  active: MastheadTab
  meta?: ReactNode
  actions?: ReactNode
  /** Variant visuel. Défaut : `stock` (préserve les pages migrées). */
  variant?: 'stock' | 'airbnb'
}) {
  const page = usePage<{ authUser: { env: 'test' | 'prod' } | null }>()
  const env = page.props.authUser?.env
  const variant = props.variant ?? 'stock'

  // Marque l'environnement X3 courant sur <html> — parité avec le masthead
  // Solid (le sélecteur [data-env] fait la déclinaison test côté CSS Papier).
  useEffect(() => {
    if (env) document.documentElement.dataset.env = env
    else delete document.documentElement.dataset.env
  }, [env])

  const tabCls = variant === 'airbnb' ? tabClsAirbnb : tabClsStock

  return (
    <header
      className={cn(
        'relative flex-none border-b bg-background print:hidden',
        variant === 'airbnb' && 'min-h-[80px]'
      )}
    >
      {env === 'test' && (
        /* Bandeau Arches orange — couleur du brand book Airbnb (#fc642d).
           Sous .theme-airbnb, le signal test/prod passe par ce bandeau + le
           suffixe [TEST] du wordmark. On n'altère PAS le Rausch (couleur
           marque). Hors thème airbnb, bg-primary reste le fallback. */
        <div
          className="absolute inset-x-0 top-0 z-10 h-[4px] bg-[var(--color-arches,#fc642d)]"
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          'flex items-end justify-between gap-5 px-7 pb-2 pt-3.5',
          variant === 'airbnb' ? 'min-h-[80px] pt-5' : 'min-h-[60px]'
        )}
      >
        <div className="flex items-center gap-3.5">
          {variant === 'airbnb' ? (
            /* DESIGN.md top-nav + nav-link : wordmark 16px/600 (on pousse à
               22px/700 pour le wordmark — Airbnb Cereal capital) — pas
               d'italique sur AERECO (DESIGN.md ne l'utilise pas). */
            <div className="text-[22px] font-bold leading-[1.05] tracking-tight">
              Supply Chain <span className="font-bold text-primary">AERECO</span>
              {env === 'test' && (
                <span className="ml-2 align-middle text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--color-arches,#fc642d)]">
                  [TEST]
                </span>
              )}
            </div>
          ) : (
            <div className="text-[24px] font-bold leading-[0.9] tracking-tight">
              Supply Chain <span className="font-medium italic text-primary">AERECO</span>
              {env === 'test' && (
                <span className="ml-2 align-middle text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--color-arches,#fc642d)]">
                  [TEST]
                </span>
              )}
            </div>
          )}
          <div className="pb-1 font-mono text-[10px] font-medium tracking-[0.12em] text-muted-foreground">
            {props.subtitle}
          </div>
          {env && (
            <span
              title={`Environnement Sage X3 : ${env}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-[3px] font-mono text-[10px] font-bold uppercase tracking-[0.08em]',
                env === 'test'
                  ? 'border-transparent bg-[var(--color-arches,#fc642d)] text-white'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              <span className="size-[5px] rounded-full bg-current" />
              {env === 'test' ? 'Test' : 'Prod'}
            </span>
          )}
        </div>
        {props.meta && (
          <div className="text-right font-mono text-[11px] font-medium leading-relaxed text-muted-foreground">
            {props.meta}
          </div>
        )}
      </div>

      <nav
        className={cn(
          'flex items-center gap-1 border-t px-7',
          variant === 'airbnb' ? 'min-h-[48px]' : 'min-h-[44px]'
        )}
      >
        {TABS.map((t) =>
          isReactRoute(t.href) ? (
            <Link key={t.key} href={t.href} className={tabCls(t.key === props.active)}>
              {t.label}
            </Link>
          ) : (
            <a key={t.key} href={t.href} className={tabCls(t.key === props.active)}>
              {t.label}
            </a>
          )
        )}
        <div className="ml-auto flex items-center gap-2 py-1.5">
          {props.actions}
          <UserMenu />
        </div>
      </nav>
    </header>
  )
}

export default Masthead
