import { Activity, LayoutDashboard, Wrench, CalendarDays, FileText, AlertTriangle, ShoppingCart, CheckCircle, PackageSearch, Factory, TrendingUp } from 'lucide-react'

export type ViewKey = 'home' | 'actions' | 'scheduler' | 'analyse-rupture' | 'feasibility' | 'capacity' | 'eol-residuals' | 'fabricable' | 'order-tracking' | 'reports' | 'settings' | 'stock-evolution'
export type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export const NAV_ITEMS: Array<{ key: ViewKey; label: string; icon: React.ReactNode }> = [
  { key: 'home', label: 'Pilotage', icon: <LayoutDashboard className="h-[15px] w-[15px]" /> },
  { key: 'actions', label: 'Actions appro', icon: <Wrench className="h-[15px] w-[15px]" /> },
  { key: 'scheduler', label: 'Ordonnancement', icon: <Activity className="h-[15px] w-[15px]" /> },
  { key: 'analyse-rupture', label: 'Ruptures', icon: <AlertTriangle className="h-[15px] w-[15px]" /> },
  { key: 'feasibility', label: 'Faisabilité', icon: <CheckCircle className="h-[15px] w-[15px]" /> },
  { key: 'eol-residuals', label: 'Stock EOL', icon: <PackageSearch className="h-[15px] w-[15px]" /> },
  { key: 'fabricable', label: 'Fabricabilité', icon: <Factory className="h-[15px] w-[15px]" /> },
  { key: 'capacity', label: 'Capacités', icon: <CalendarDays className="h-[15px] w-[15px]" /> },
  { key: 'order-tracking', label: 'Commandes', icon: <ShoppingCart className="h-[15px] w-[15px]" /> },
  { key: 'stock-evolution', label: 'Historique stock', icon: <TrendingUp className="h-[15px] w-[15px]" /> },
  { key: 'reports', label: 'Rapports', icon: <FileText className="h-[15px] w-[15px]" /> },
]
