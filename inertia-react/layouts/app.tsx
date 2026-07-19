import * as React from 'react'
import { Head } from '@inertiajs/react'

import { Masthead, type MastheadTab } from '@r/components/masthead'
import { cn } from '@r/lib/utils'

/**
 * AppLayout — shell applicatif Layout B (B2B adapté Airbnb).
 *
 * Structure :
 *   ┌──────────────────────────────────────────────┐
 *   │             Masthead 80px (variant airbnb)   │
 *   ├──────────────────────────────────────────────┤
 *   │             Toolbar 56px (slot optionnel)    │
 *   ├──────────────────────────────────────────────┤
 *   │                                             │
 *   │             Zone principale (scrollable)    │
 *   │                                             │
 *   ├──────────────────────────────────────────────┤
 *   │             Footer compact 32px (optionnel) │
 *   └──────────────────────────────────────────────┘
 *
 * Calqué sur les principes Airbnb (canvas blanc, ink #222, Rausch voltage
 * unique, radius soft, une seule ombre) tout en servant le métier supply
 * chain (toolbar dédiée, footer statut sync X3, pas de footer marketing).
 *
 * Usage :
 *   <AppLayout active="dashboard" subtitle="Tableau de bord">
 *     <Toolbar>…pills…</Toolbar>
 *     <MonContenu />
 *   </AppLayout>
 *
 * Variantes :
 *   • `theme="airbnb"` (défaut) — scope .theme-airbnb + Masthead variant airbnb.
 *   • `theme="stock"` — shadcn de base, Masthead variant stock.
 *   • `theme="navy"` — legacy scope .theme-navy (pages non migrées), Masthead stock.
 *
 *   • `dense` — board / programme : pas de padding zone principale, pas de
 *     footer, maxWidth="full". Le contenu occupe tout l'écran.
 *   • `scrollable` (défaut true) — zone principale scrollable. Mettre false
 *     pour le gantt / board qui gèrent leur propre scroll.
 */

type ThemeVariant = 'airbnb' | 'stock' | 'navy'

interface AppLayoutProps {
  /** Onglet Masthead actif. */
  active: MastheadTab
  /** Sous-titre affiché dans le Masthead (contexte de la page). */
  subtitle: string
  /** Métadonnées affichées en haut à droite du Masthead (dates, compteurs). */
  meta?: React.ReactNode
  /** Actions poussées à droite de la nav (à côté du UserMenu). */
  mastheadActions?: React.ReactNode
  /** Slot toolbar — pills de filtrage, sélecteurs de période, etc. */
  toolbar?: React.ReactNode
  /** Slot footer custom. Par défaut : footer compact (statut sync + version). */
  footer?: React.ReactNode
  /** Désactive le footer (mode dense, board plein écran). */
  hideFooter?: boolean
  /** Variant thème. */
  theme?: ThemeVariant
  /** Mode dense : pas de padding, maxWidth full. Pour board / programme. */
  dense?: boolean
  /** Zone principale scrollable. Défaut true. */
  scrollable?: boolean
  /** Largeur max du contenu. Défaut '7xl' (1280px). */
  maxWidth?: '7xl' | 'full'
  /** Titre <head> Inertia. */
  title?: string
  /** Contenu de la zone principale. */
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
  const mastheadVariant = theme === 'airbnb' ? 'airbnb' : 'stock'

  return (
    <div
      data-app-layout="b"
      className={cn(
        'flex h-screen flex-col overflow-hidden bg-background text-foreground',
        THEME_SCOPE[theme],
        dense && 'print:h-auto print:overflow-visible'
      )}
    >
      {title && <Head title={title} />}

      <Masthead
        subtitle={subtitle}
        active={active}
        variant={mastheadVariant}
        meta={meta}
        actions={mastheadActions}
      />

      {/* Toolbar — 56px, pills de filtrage.
          Pas de border-top (Masthead a déjà un border-bottom), border-bottom
          hairline pour séparer de la zone principale. Padding horizontal
          identique au Masthead (px-7 = 28px) pour aligner les pills avec
          les onglets. */}
      {toolbar && (
        <div className="flex min-h-[56px] flex-none items-center gap-2 border-b border-border bg-background px-7 py-2.5 print:hidden">
          {toolbar}
        </div>
      )}

      {/* Zone principale.
          - `dense` : pas de padding, maxWidth full (board, programme).
          - défaut : padding px-7 py-4 (aligné avec la toolbar), maxWidth 7xl centré.
          - `scrollable` : overflow-y-auto (la plupart des pages).
          - non scrollable : le contenu gère son propre scroll (gantt). */}
      <main
        className={cn(
          'flex-1 min-h-0',
          scrollable && 'overflow-y-auto',
          !dense && 'px-7 py-4',
          dense && 'overflow-hidden'
        )}
      >
        <div
          className={cn(
            'mx-auto h-full w-full',
            maxWidth === '7xl' && !dense && 'max-w-7xl',
            dense && 'max-w-none'
          )}
        >
          {children}
        </div>
      </main>

      {/* Footer compact — statut sync X3 + version, 32px de haut.
          Pas de footer marketing (inutile en interne). Désactivé en dense
          et sur print. */}
      {!hideFooter && !dense && (
        <footer className="flex h-8 flex-none items-center justify-between border-t border-border bg-background px-7 text-[11px] text-muted-foreground print:hidden">
          {footer ?? <DefaultFooter />}
        </footer>
      )}
    </div>
  )
}

/** Footer par défaut — peut être remplacé via la prop `footer`. */
function DefaultFooter() {
  return (
    <>
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        <span className="font-mono">Connecté à Sage X3</span>
      </span>
      <span className="font-mono">Supply Chain Board · v0.2</span>
    </>
  )
}

export default AppLayout
