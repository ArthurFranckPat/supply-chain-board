import {
  LayoutDashboard,
  CalendarRange,
  GalleryVerticalEnd,
  TriangleAlert,
  Factory,
  Gauge,
  ClipboardList,
  Kanban,
  Truck,
  PackageCheck,
  Boxes,
  TrendingUp,
  Package,
  BadgeCheck,
  Bot,
  Settings,
  type LucideIcon,
} from 'lucide-react'

import { route } from '@r/lib/routes'

/**
 * Clé de navigation — alias de MastheadTab pour la sidebar.
 * Garde la compat avec `AppLayout active` existant.
 */
export type NavKey =
  | 'dashboard'
  | 'programme'
  | 'sequenceur'
  | 'charge'
  | 'ruptures'
  | 'controle-prod'
  | 'cockpit'
  | 'suivi'
  | 'expeditions'
  | 'receptions'
  | 'approvisionnements'
  | 'besoins-evolution'
  | 'conditionnements'
  | 'promesse'
  | 'copilote'
  | 'config'

export type NavItem = {
  key: NavKey
  label: string
  href: string
  icon: LucideIcon
}

export type NavSection = {
  label: string
  items: NavItem[]
}

/**
 * Sections verticales — libellés FR conservés (pas de "CARE/PHARMACY"
 * anglophones de la maquette Pulse). Icônes lucide proches de la maquette.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Vue d'ensemble",
    items: [
      {
        key: 'dashboard',
        label: 'Tableau de bord',
        href: route('dashboard'),
        icon: LayoutDashboard,
      },
    ],
  },
  {
    label: 'Ordonnancement',
    items: [
      {
        key: 'programme',
        label: 'Programme',
        href: route('programme.index'),
        icon: CalendarRange,
      },
      {
        key: 'sequenceur',
        label: 'Séquenceur',
        href: route('sequenceur.index'),
        icon: GalleryVerticalEnd,
      },
      {
        key: 'ruptures',
        label: 'Ruptures composants',
        href: route('ruptures.index'),
        icon: TriangleAlert,
      },
      {
        key: 'controle-prod',
        label: 'Contrôle prod',
        href: route('controle_prod.index'),
        icon: Factory,
      },
      { key: 'cockpit', label: 'Cockpit poste', href: route('cockpit.index'), icon: Gauge },
    ],
  },
  {
    label: 'Suivi',
    items: [
      {
        key: 'suivi',
        label: 'Suivi commandes',
        href: route('suivi.board'),
        icon: ClipboardList,
      },
      { key: 'charge', label: 'Charge', href: route('charge.index'), icon: Kanban },
    ],
  },
  {
    label: 'Logistique',
    items: [
      { key: 'expeditions', label: 'Expéditions', href: route('expeditions.index'), icon: Truck },
      {
        key: 'receptions',
        label: 'Réceptions',
        href: route('receptions.index'),
        icon: PackageCheck,
      },
      {
        key: 'approvisionnements',
        label: 'Approvisionnements',
        href: route('approvisionnements.index'),
        icon: Boxes,
      },
      {
        key: 'besoins-evolution',
        label: 'Évolution des besoins',
        href: route('besoins.evolution'),
        icon: TrendingUp,
      },
      {
        key: 'conditionnements',
        label: 'Conditionnements',
        href: route('conditionnements.index'),
        icon: Package,
      },
    ],
  },
  {
    label: 'Outils',
    items: [
      { key: 'promesse', label: 'Promesse', href: route('promesse.show'), icon: BadgeCheck },
      { key: 'copilote', label: 'Copilote', href: route('copilote.show'), icon: Bot },
      { key: 'config', label: 'Config', href: route('calendar_config.index'), icon: Settings },
    ],
  },
]

/** Résout la section d'une clé (pour breadcrumb). */
export function getSectionForKey(key: NavKey): NavSection | undefined {
  return NAV_SECTIONS.find((s) => s.items.some((i) => i.key === key))
}

/** Tous les items à plat (pour palette Go to). */
export function allNavItems(): NavItem[] {
  return NAV_SECTIONS.flatMap((s) => s.items)
}
