import {
  Activity,
  LayoutDashboard,
  Wrench,
  CalendarDays,
  FileText,
  AlertTriangle,
  ShoppingCart,
  CheckCircle,
  PackageSearch,
  Factory,
  TrendingUp,
  Scale,
} from 'lucide-react'

export type ViewKey =
  | 'home'
  | 'actions'
  | 'scheduler'
  | 'analyse-rupture'
  | 'feasibility'
  | 'capacity'
  | 'eol-residuals'
  | 'fabricable'
  | 'order-tracking'
  | 'reports'
  | 'settings'
  | 'stock-evolution'
  | 'lot-eco'

export type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface NavLeaf {
  type: 'leaf'
  key: ViewKey
  label: string
  path: string
  icon: React.ReactNode
}

export interface NavGroup {
  type: 'group'
  key: string
  label: string
  icon: React.ReactNode
  items: Array<{ key: ViewKey; label: string; path: string; icon: React.ReactNode }>
}

export type NavEntry = NavLeaf | NavGroup

export const NAV_ENTRIES: NavEntry[] = [
  {
    type: 'leaf',
    key: 'home',
    label: 'Pilotage',
    path: '/pilotage',
    icon: <LayoutDashboard className="h-[15px] w-[15px]" />,
  },
  {
    type: 'group',
    key: 'planification',
    label: 'Planification',
    icon: <CalendarDays className="h-[15px] w-[15px]" />,
    items: [
      { key: 'scheduler', label: 'Ordonnancement', path: '/scheduler', icon: <Activity className="h-[15px] w-[15px]" /> },
      { key: 'capacity', label: 'Capacités atelier', path: '/capacity', icon: <CalendarDays className="h-[15px] w-[15px]" /> },
      { key: 'feasibility', label: 'Faisabilité commande', path: '/feasibility', icon: <CheckCircle className="h-[15px] w-[15px]" /> },
    ],
  },
  {
    type: 'group',
    key: 'analyses',
    label: 'Analyses',
    icon: <TrendingUp className="h-[15px] w-[15px]" />,
    items: [
      { key: 'analyse-rupture', label: 'Ruptures & Gaps', path: '/analyse-rupture', icon: <AlertTriangle className="h-[15px] w-[15px]" /> },
      { key: 'eol-residuals', label: 'Stock résiduel', path: '/eol-residuals', icon: <PackageSearch className="h-[15px] w-[15px]" /> },
      { key: 'fabricable', label: 'Projet fabrication', path: '/fabricable', icon: <Factory className="h-[15px] w-[15px]" /> },
      { key: 'lot-eco', label: 'Lots économiques', path: '/lot-eco', icon: <Scale className="h-[15px] w-[15px]" /> },
      { key: 'stock-evolution', label: 'Évolution stock', path: '/stock-evolution', icon: <TrendingUp className="h-[15px] w-[15px]" /> },
    ],
  },
  {
    type: 'group',
    key: 'suivi',
    label: 'Suivi',
    icon: <ShoppingCart className="h-[15px] w-[15px]" />,
    items: [
      { key: 'order-tracking', label: 'Suivi commandes', path: '/order-tracking', icon: <ShoppingCart className="h-[15px] w-[15px]" /> },
      { key: 'actions', label: "Actions d'appro", path: '/actions', icon: <Wrench className="h-[15px] w-[15px]" /> },
    ],
  },
  {
    type: 'leaf',
    key: 'reports',
    label: 'Rapports',
    path: '/reports',
    icon: <FileText className="h-[15px] w-[15px]" />,
  },
]

/** Flatten all navigable leaves (for collapsed sidebar or lookup) */
export function getAllNavLeaves(): Array<{ key: ViewKey; label: string; path: string; icon: React.ReactNode }> {
  const leaves: Array<{ key: ViewKey; label: string; path: string; icon: React.ReactNode }> = []
  for (const entry of NAV_ENTRIES) {
    if (entry.type === 'leaf') {
      leaves.push(entry)
    } else {
      leaves.push(...entry.items)
    }
  }
  return leaves
}

/** Find label for a given path */
export function getNavLabel(path: string): string {
  for (const entry of NAV_ENTRIES) {
    if (entry.type === 'leaf' && entry.path === path) return entry.label
    if (entry.type === 'group') {
      const item = entry.items.find((i) => i.path === path)
      if (item) return item.label
    }
  }
  return ''
}

/** Check if a path belongs to a given group */
export function pathBelongsToGroup(path: string, groupKey: string): boolean {
  const group = NAV_ENTRIES.find((e) => e.type === 'group' && e.key === groupKey) as NavGroup | undefined
  return group?.items.some((i) => i.path === path) ?? false
}
