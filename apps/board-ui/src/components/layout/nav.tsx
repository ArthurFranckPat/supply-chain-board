import { Activity, LayoutDashboard, Wrench, CalendarDays, FileText, AlertTriangle, ShoppingCart, CheckCircle, PackageSearch, Factory, TrendingUp, Scale } from 'lucide-react'

export type ViewKey = 'home' | 'actions' | 'scheduler' | 'analyse-rupture' | 'feasibility' | 'capacity' | 'eol-residuals' | 'fabricable' | 'order-tracking' | 'reports' | 'settings' | 'stock-evolution' | 'lot-eco'
export type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export const NAV_ITEMS: Array<{ key: ViewKey; label: string; path: string; icon: React.ReactNode }> = [
  { key: 'home', label: 'Pilotage', path: '/pilotage', icon: <LayoutDashboard className="h-[15px] w-[15px]" /> },
  { key: 'actions', label: 'Actions appro', path: '/actions', icon: <Wrench className="h-[15px] w-[15px]" /> },
  { key: 'scheduler', label: 'Ordonnancement', path: '/scheduler', icon: <Activity className="h-[15px] w-[15px]" /> },
  { key: 'analyse-rupture', label: 'Ruptures', path: '/analyse-rupture', icon: <AlertTriangle className="h-[15px] w-[15px]" /> },
  { key: 'feasibility', label: 'Faisabilité', path: '/feasibility', icon: <CheckCircle className="h-[15px] w-[15px]" /> },
  { key: 'eol-residuals', label: 'Stock EOL', path: '/eol-residuals', icon: <PackageSearch className="h-[15px] w-[15px]" /> },
  { key: 'fabricable', label: 'Fabricabilité', path: '/fabricable', icon: <Factory className="h-[15px] w-[15px]" /> },
  { key: 'capacity', label: 'Capacités', path: '/capacity', icon: <CalendarDays className="h-[15px] w-[15px]" /> },
  { key: 'order-tracking', label: 'Commandes', path: '/order-tracking', icon: <ShoppingCart className="h-[15px] w-[15px]" /> },
  { key: 'stock-evolution', label: 'Historique stock', path: '/stock-evolution', icon: <TrendingUp className="h-[15px] w-[15px]" /> },
  { key: 'lot-eco', label: 'Lot Eco', path: '/lot-eco', icon: <Scale className="h-[15px] w-[15px]" /> },
  { key: 'reports', label: 'Rapports', path: '/reports', icon: <FileText className="h-[15px] w-[15px]" /> },
]
