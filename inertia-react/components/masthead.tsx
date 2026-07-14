import React, { useEffect } from 'react'
import { router, usePage } from '@inertiajs/react'
import { Pill } from 'carbon-react'
import NavigationBar from 'carbon-react/esm/components/navigation-bar'
import { Menu, MenuItem } from 'carbon-react/esm/components/menu'
import { route } from '@/lib/routes'
import { isReactRoute } from '@/lib/react-routes'
import UserMenu from './user-menu'

// Casts `as any` : Carbon-react 161 n'expose pas className/flex/selected sur les
// types TS publics de NavigationBar/Menu/MenuItem (gap connu, pattern établi
// dans data-table.tsx). On garde le contrôle du layout via ces casts.
const NavBar = NavigationBar as any
const CarbonMenu = Menu as any
const CarbonMenuItem = MenuItem as any

export type MastheadTab =
  | 'dashboard'
  | 'programme'
  | 'load'
  | 'ruptures'
  | 'tracking'
  | 'expeditions'
  | 'receptions'
  | 'conditionnements'
  | 'config'

const TABS: { key: MastheadTab; label: string; href: string }[] = [
  { key: 'dashboard', label: 'Tableau', href: route('dashboard') },
  { key: 'programme', label: 'Programme', href: route('scheduler.programme') },
  { key: 'load', label: 'Charge', href: route('load.index') },
  { key: 'ruptures', label: 'Ruptures', href: route('scheduler.shortage_tracker') },
  { key: 'tracking', label: 'Suivi', href: route('suivi.board') },
  { key: 'expeditions', label: 'Expéditions', href: route('expeditions.index') },
  { key: 'receptions', label: 'Réceptions', href: route('receptions.index') },
  { key: 'conditionnements', label: 'Conditionnements', href: route('conditionnements.index') },
  { key: 'config', label: 'Config', href: route('calendar_config.index') },
]

interface MastheadProps {
  subtitle: string
  active: MastheadTab
  meta?: React.ReactNode
  actions?: React.ReactNode
}

/**
 * Masthead applicatif — une seule ligne compacte via `NavigationBar` Carbon.
 *
 * Layout natif Sage (ne PAS court-circuiter le flex de NavigationBar avec des
 * divs Tailwind internes — ça casse l'alignement vertical et crée des hauteurs
 * incohérentes). Les enfants directs de NavigationBar sont alignés par son
 * flex natif : branding à gauche, Menu flexible au centre, zone droite pour
 * meta + actions + UserMenu.
 *
 * Migration (issue #77) : l'ancienne version empilait un <header> custom
 * Tailwind (titre font-black 28px + badge custom) au-dessus d'un NavigationBar
 * Carbon — deux barres incohérentes. Désormais tout vit dans le NavigationBar.
 *
 * Navigation inter-runtimes (issue §3.4) : les onglets sont des <a> natifs par
 * défaut (full page load) ; si la destination est servie par le runtime React
 * courant, on intercepte en visite Inertia (XHR, SPA).
 */
export function Masthead({ subtitle, active, meta, actions }: MastheadProps) {
  const { authUser } = usePage().props as unknown as { authUser: { env: 'test' | 'prod' } | null }
  const env = authUser?.env

  useEffect(() => {
    if (env) {
      document.documentElement.dataset.env = env
    } else {
      delete document.documentElement.dataset.env
    }
  }, [env])

  const handleTabClick = (e: React.MouseEvent, href: string) => {
    if (isReactRoute(href)) {
      e.preventDefault()
      router.visit(href)
    }
  }

  return (
    <header className="relative flex-none print:hidden">
      {/* Bandeau d'alerte fin en environnement test (signal visuel discret). */}
      {env === 'test' && (
        <div className="absolute inset-x-0 top-0 z-10 h-[3px] bg-brand" aria-hidden="true" />
      )}

      {/* Une SEULE barre NavigationBar. Pas de div Tailwind wrapper qui
          court-circuiterait son flex natif. On laisse Carbon gérer l'alignement
          vertical de tous les enfants. */}
      <NavBar
        aria-label="Navigation principale"
        navigationType="light"
        px={6}
      >
        {/* ── Branding compact (zone gauche, flex:none via flexGrow:0) ── */}
        <span
          className="flex flex-none items-center gap-2 text-[14px] font-semibold tracking-tight text-foreground"
          style={{ flexGrow: 0, paddingRight: '16px' }}
        >
          Supply Chain
          <span className="italic text-brand">AERECO</span>
          <span className="hidden md:inline font-mono text-[10px] font-medium tracking-[0.12em] text-muted-foreground ml-2">
            {subtitle}
          </span>
          {env && (
            <Pill
              size="S"
              colorVariant={env === 'test' ? 'information' : 'neutral'}
              fill={env === 'test'}
              pillRole="status"
              title={`Environnement Sage X3 : ${env}`}
            >
              {env === 'test' ? 'Test' : 'Prod'}
            </Pill>
          )}
        </span>

        {/* ── Onglets — Menu Carbon (zone centrale, flex:1 natif) ──
            minWidth={0} + overflowX="auto" : sans ça, un flex item flex:1 garde son
            min-width:auto par défaut (= largeur de son contenu) → avec 9 onglets +
            branding + meta/search/avatar qui ne tiennent plus sur une largeur d'écran
            réduite, c'est TOUTE la NavigationBar (donc toute la page, ce header est sur
            chaque écran) qui déborde horizontalement au lieu du menu seul. */}
        <CarbonMenu menuType="light" flex="1" minWidth={0} overflowX="auto">
          {TABS.map((t) => (
            <CarbonMenuItem
              key={t.key}
              href={t.href}
              selected={t.key === active}
              onClick={(e: React.MouseEvent) => handleTabClick(e, t.href)}
            >
              {t.label}
            </CarbonMenuItem>
          ))}
        </CarbonMenu>

        {/* ── Zone droite — meta + actions + UserMenu ── */}
        <span
          className="flex flex-none items-center gap-2"
          style={{ flexGrow: 0 }}
        >
          {meta && (
            <span className="hidden lg:inline-block font-mono text-[11px] font-medium leading-relaxed text-muted-foreground text-right">
              {meta}
            </span>
          )}
          {actions}
          <UserMenu />
        </span>
      </NavBar>
    </header>
  )
}

export default Masthead
