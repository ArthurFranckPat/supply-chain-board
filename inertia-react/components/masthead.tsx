import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, usePage } from '@inertiajs/react'
import { ChevronDown } from 'lucide-react'

import { DataStatus } from '@r/components/data-status'
import { route } from '@r/lib/routes'
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
 *                 hauteur 80px, wordmark Plus Jakarta Sans 700 22px (pas d'italique), onglet
 *                 actif souligné par une underline ink 2px (pas Rausch), texte
 *                 inactif en muted-foreground #6a6a6a.
 *
 * Navigation : SolidJS retiré (#91), toutes les pages vivent dans le bundle
 * React — chaque onglet est un <Link> Inertia (visite XHR).
 */

export type MastheadTab =
  | 'dashboard'
  | 'programme'
  | 'sequenceur'
  | 'load'
  | 'ruptures'
  | 'controle-prod'
  | 'tracking'
  | 'expeditions'
  | 'receptions'
  | 'conditionnements'
  | 'promesse'
  | 'copilote'
  | 'config'

type Tab = { key: MastheadTab; label: string; href: string }

/**
 * Onglets nus affichés directement dans la barre (hors menus déroulants).
 */
const TABLEAU_DE_BORD: Tab = {
  key: 'dashboard',
  label: 'Tableau de bord',
  href: route('dashboard'),
}
const SUIVI_COMMANDES: Tab = {
  key: 'tracking',
  label: 'Suivi commandes',
  href: route('suivi.board'),
}
const PLANIFICATION: Tab = {
  key: 'load',
  label: 'Planification',
  href: route('load.index'),
}

/** Groupe d'onglets — `label` optionnel : sans label = liens nus (sans en-tête). */
type TabGroup = { label?: string; tabs: Tab[] }

/**
 * Menu « Ordonnancement » — les deux vues OF (Programme chronologique
 * × commandes ; Séquenceur agrégé par poste) + ruptures composants qui
 * conditionnent le lancement des OF.
 */
const ORDONNANCEMENT_GROUPS: TabGroup[] = [
  {
    tabs: [
      { key: 'programme', label: 'Programme', href: route('scheduler.programme') },
      { key: 'sequenceur', label: 'Séquenceur', href: route('sequenceur.index') },
      { key: 'ruptures', label: 'Ruptures composants', href: route('scheduler.shortage_tracker') },
      { key: 'controle-prod', label: 'Contrôle prod', href: route('controle_prod.index') },
    ],
  },
]

/** Menu « Logistique » — transactions physiques magasin. */
const LOGISTIQUE_GROUPS: TabGroup[] = [
  {
    label: 'Logistique',
    tabs: [
      { key: 'expeditions', label: 'Expéditions', href: route('expeditions.index') },
      { key: 'receptions', label: 'Réceptions', href: route('receptions.index') },
      { key: 'conditionnements', label: 'Conditionnements', href: route('conditionnements.index') },
    ],
  },
]

/**
 * Menu « Plus » — Promesse en lien nu, puis Outils.
 */
const PLUS_GROUPS: TabGroup[] = [
  {
    tabs: [{ key: 'promesse', label: 'Promesse', href: route('promesse.show') }],
  },
  {
    label: 'Outils',
    tabs: [
      { key: 'copilote', label: 'Copilote', href: route('agent.show') },
      { key: 'config', label: 'Config', href: route('calendar_config.index') },
    ],
  },
]

// Variant `stock` — comportement historique.
const tabClsStock = (active: boolean) =>
  cn(
    'border-b-2 px-3.5 py-2.5 text-[12px] font-semibold transition-colors',
    active
      ? 'border-primary text-primary'
      : 'border-transparent text-secondary-foreground hover:text-primary'
  )

// Variant `airbnb` — DESIGN.md `top-nav` + `product-tab-active` :
// Layout fusionné : logo + onglets + utilitaires sur UNE seule rangée
// (au lieu de 2 séparées header/nav). Gain : 48px verticaux.
// DESIGN.md top-nav : 80px de haut, wordmark à gauche, onglets centrés,
// utilitaires à droite.
//
// • nav-link : 12px / 600 (compacté pour 11 onglets sur une rangée)
// • actif : underline ink 3px (border-foreground), texte ink
// • inactif : texte muted-foreground, hover foreground
// Rausch n'apparaît PAS dans la nav chez Airbnb.
const tabClsAirbnb = (active: boolean) =>
  cn(
    'border-b-[3px] px-1.5 py-2 text-[12px] font-semibold leading-tight transition-colors',
    active
      ? 'border-foreground text-foreground'
      : 'border-transparent text-muted-foreground hover:text-foreground'
  )

/**
 * Menu déroulant « Plus » qui regroupe les onglets secondaires par section.
 * Ouverture au clic, fermeture au clic extérieur + Échap, navigation clavier
 * basique. Le déclencheur est marqué actif si l'onglet courant est caché dedans.
 */
function MoreMenu({
  label,
  groups,
  active,
  triggerCls,
}: {
  label: string
  groups: TabGroup[]
  active: MastheadTab
  triggerCls: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const isActive = groups.some((g) => g.tabs.some((t) => t.key === active))

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(triggerCls, 'flex items-center gap-1')}
      >
        {label}
        <ChevronDown
          size={14}
          strokeWidth={2.25}
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        >
          {groups.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="border-t border-border" />}
              {group.label && (
                <div className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  {group.label}
                </div>
              )}
              {group.tabs.map((t) => (
                <Link
                  key={t.key}
                  href={t.href}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                  className={cn(
                    'flex items-center px-3 py-2 text-[13px] font-medium transition-colors',
                    t.key === active
                      ? 'bg-muted/70 text-foreground'
                      : 'text-foreground hover:bg-muted/60'
                  )}
                >
                  {t.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

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

  if (variant === 'airbnb') {
    // Layout fusionné : 1 seule rangée 64px (au lieu de 80+48=128 stock).
    // DESIGN.md top-nav : wordmark à gauche, onglets centrés, utilitaires droite.
    return (
      <header className="relative flex min-h-[64px] flex-none items-center gap-6 border-b border-border bg-background px-7 print:hidden">
        {env === 'test' && (
          <div
            className="absolute inset-x-0 top-0 z-10 h-[4px] bg-[var(--color-arches,#fc642d)]"
            aria-hidden="true"
          />
        )}

        {/* Bloc gauche : wordmark + subtitle + env badge. */}
        <div className="flex items-center gap-3">
          <div className="text-[20px] font-bold leading-none tracking-tight">
            Supply Chain <span className="text-primary">AERECO</span>
            {env === 'test' && (
              <span className="ml-2 align-middle text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-arches,#fc642d)]">
                [TEST]
              </span>
            )}
          </div>
          {env && (
            <span
              title={`Environnement Sage X3 : ${env}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-[2px] font-mono text-[10px] font-bold uppercase tracking-[0.08em]',
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

        {/* Nav centrée — DESIGN.md top-nav : onglets au milieu. */}
        <nav className="flex flex-1 items-center justify-center gap-0">
          {/* Tableau de bord */}
          <Link
            href={TABLEAU_DE_BORD.href}
            className={tabCls(TABLEAU_DE_BORD.key === props.active)}
          >
            {TABLEAU_DE_BORD.label}
          </Link>
          {/* Ordonnancement ▾ */}
          <MoreMenu
            label="Ordonnancement"
            groups={ORDONNANCEMENT_GROUPS}
            active={props.active}
            triggerCls={tabCls(
              ORDONNANCEMENT_GROUPS.some((g) => g.tabs.some((t) => t.key === props.active))
            )}
          />
          {/* Suivi commandes */}
          <Link
            href={SUIVI_COMMANDES.href}
            className={tabCls(SUIVI_COMMANDES.key === props.active)}
          >
            {SUIVI_COMMANDES.label}
          </Link>
          {/* Planification */}
          <Link href={PLANIFICATION.href} className={tabCls(PLANIFICATION.key === props.active)}>
            {PLANIFICATION.label}
          </Link>
          {/* Logistique ▾ */}
          <MoreMenu
            label="Logistique"
            groups={LOGISTIQUE_GROUPS}
            active={props.active}
            triggerCls={tabCls(
              LOGISTIQUE_GROUPS.some((g) => g.tabs.some((t) => t.key === props.active))
            )}
          />
          {/* Plus ▾ */}
          <MoreMenu
            label="Plus"
            groups={PLUS_GROUPS}
            active={props.active}
            triggerCls={tabCls(PLUS_GROUPS.some((g) => g.tabs.some((t) => t.key === props.active)))}
          />
        </nav>

        {/* Bloc droit : meta (optionnel) + actions + statut données + UserMenu. */}
        <div className="flex items-center gap-3">
          {props.meta && (
            <div className="hidden text-right font-mono text-[11px] font-medium leading-relaxed text-muted-foreground xl:block">
              {props.meta}
            </div>
          )}
          {props.actions}
          <DataStatus />
          <UserMenu />
        </div>
      </header>
    )
  }

  // Variant `stock` — structure historique 2 rangées (header + nav) conservée.
  return (
    <header className="relative flex-none border-b bg-background print:hidden">
      {env === 'test' && (
        <div
          className="absolute inset-x-0 top-0 z-10 h-[4px] bg-[var(--color-arches,#fc642d)]"
          aria-hidden="true"
        />
      )}
      <div className="flex min-h-[60px] items-end justify-between gap-5 px-7 pb-2 pt-3.5">
        <div className="flex items-center gap-3.5">
          <div className="text-[24px] font-bold leading-[0.9] tracking-tight">
            Supply Chain <span className="font-medium italic text-primary">AERECO</span>
            {env === 'test' && (
              <span className="ml-2 align-middle text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--color-arches,#fc642d)]">
                [TEST]
              </span>
            )}
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

      <nav className="flex min-h-[44px] items-center gap-1 border-t px-7">
        <Link href={TABLEAU_DE_BORD.href} className={tabCls(TABLEAU_DE_BORD.key === props.active)}>
          {TABLEAU_DE_BORD.label}
        </Link>
        <MoreMenu
          label="Ordonnancement"
          groups={ORDONNANCEMENT_GROUPS}
          active={props.active}
          triggerCls={tabCls(
            ORDONNANCEMENT_GROUPS.some((g) => g.tabs.some((t) => t.key === props.active))
          )}
        />
        <Link href={SUIVI_COMMANDES.href} className={tabCls(SUIVI_COMMANDES.key === props.active)}>
          {SUIVI_COMMANDES.label}
        </Link>
        <Link href={PLANIFICATION.href} className={tabCls(PLANIFICATION.key === props.active)}>
          {PLANIFICATION.label}
        </Link>
        <MoreMenu
          label="Logistique"
          groups={LOGISTIQUE_GROUPS}
          active={props.active}
          triggerCls={tabCls(
            LOGISTIQUE_GROUPS.some((g) => g.tabs.some((t) => t.key === props.active))
          )}
        />
        <MoreMenu
          label="Plus"
          groups={PLUS_GROUPS}
          active={props.active}
          triggerCls={tabCls(PLUS_GROUPS.some((g) => g.tabs.some((t) => t.key === props.active)))}
        />
        <div className="ml-auto flex items-center gap-2 py-1.5">
          {props.actions}
          <DataStatus />
          <UserMenu />
        </div>
      </nav>
    </header>
  )
}

export default Masthead
