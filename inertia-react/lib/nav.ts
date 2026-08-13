import {
  LayoutDashboard,
  CalendarRange,
  GalleryVerticalEnd,
  TriangleAlert,
  ClipboardList,
  Kanban,
  Settings,
  type LucideIcon,
} from 'lucide-react'

import { route } from '@r/lib/routes'

/**
 * Clé de navigation — alias de MastheadTab pour la sidebar.
 * Garde la compat avec `AppLayout active` existant.
 */
export type NavKey =
  'dashboard' | 'programme' | 'sequenceur' | 'load' | 'ruptures' | 'tracking' | 'config'

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
        href: route('scheduler.programme'),
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
        href: route('scheduler.shortage_tracker'),
        icon: TriangleAlert,
      },
    ],
  },
  {
    label: 'Suivi',
    items: [
      {
        key: 'tracking',
        label: 'Suivi commandes',
        href: route('suivi.board'),
        icon: ClipboardList,
      },
      { key: 'load', label: 'Planification', href: route('load.index'), icon: Kanban },
    ],
  },
  {
    label: 'Outils',
    items: [
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
