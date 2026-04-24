import { Settings, Package, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { NAV_ITEMS } from './nav'
import type { ViewKey } from './nav'
import type { BackendState, LoadState } from '@/hooks/useAppBootstrap'

interface SidebarProps {
  activeView: ViewKey
  onNavigate: (view: ViewKey) => void
  collapsed: boolean
  onToggleCollapse: () => void
  backendState: BackendState
  loadState: LoadState
}

export function Sidebar({ activeView, onNavigate, collapsed, onToggleCollapse, backendState, loadState }: SidebarProps) {
  return (
    <aside className={`shrink-0 border-r border-border bg-card flex flex-col transition-[width] duration-200 ${collapsed ? 'w-[56px]' : 'w-[220px]'}`}>
      {/* Brand + collapse toggle */}
      <div className={`flex items-center gap-2.5 py-[14px] ${collapsed ? 'px-3 justify-center' : 'px-4.5'}`}>
        <div className="w-8 h-8 rounded-[9px] shrink-0 flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0f766e,#166534)' }}>
          <Package className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[9.5px] text-muted-foreground font-mono uppercase tracking-wider font-medium leading-none">Supply Chain</p>
            <p className="text-[15px] font-bold text-foreground leading-tight mt-0.5">Ordo Cockpit</p>
          </div>
        )}
      </div>

      {/* Navigation label */}
      {!collapsed && (
        <div className="px-3 pt-3.5 pb-1.5 text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
          Navigation
        </div>
      )}

      {/* Nav items */}
      <nav className={`flex flex-col gap-0.5 flex-1 ${collapsed ? 'px-2 pt-3' : 'px-2.5'}`}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            title={collapsed ? item.label : undefined}
            className={`w-full flex items-center gap-2.5 py-2 rounded-[7px] text-[12.5px] font-medium transition-colors text-left ${
              collapsed ? 'px-0 justify-center' : 'px-[11px]'
            } ${
              activeView === item.key
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-accent'
            }`}
          >
            {item.icon}
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      {/* System section */}
      <div className={collapsed ? 'px-2 pb-2' : 'px-2.5 pb-2'}>
        {!collapsed && (
          <div className="px-[11px] pb-1.5 text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
            Système
          </div>
        )}
        <button
          onClick={() => onNavigate('settings')}
          title={collapsed ? 'Paramètres' : undefined}
          className={`w-full flex items-center gap-2.5 py-2 rounded-[7px] text-[12.5px] font-medium transition-colors text-left ${
            collapsed ? 'px-0 justify-center' : 'px-[11px]'
          } ${
            activeView === 'settings'
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-accent'
          }`}
        >
          <Settings className="h-[15px] w-[15px] text-muted-foreground" />
          {!collapsed && 'Paramètres'}
        </button>
      </div>

      {/* Status indicators */}
      {!collapsed && (
        <div className="px-3.5 py-3.5 border-t border-border flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>API</span>
            <span className={`inline-flex items-center gap-1.5 px-[7px] py-[2px] rounded-full text-[10px] font-semibold ${
              backendState === 'ready' ? 'bg-green/10 text-green' : 'bg-muted text-muted-foreground'
            }`}>
              <span className={`w-[5px] h-[5px] rounded-full ${backendState === 'ready' ? 'bg-green' : 'bg-muted-foreground'}`} />
              {backendState === 'ready' ? 'ready' : backendState}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Source</span>
            <span className={`inline-flex items-center gap-1.5 px-[7px] py-[2px] rounded-full text-[10px] font-semibold ${
              loadState === 'ready' ? 'bg-green/10 text-green' : 'bg-muted text-muted-foreground'
            }`}>
              <span className={`w-[5px] h-[5px] rounded-full ${loadState === 'ready' ? 'bg-green' : 'bg-muted-foreground'}`} />
              {loadState === 'ready' ? 'ready' : loadState}
            </span>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className={`border-t border-border py-2 ${collapsed ? 'px-2' : 'px-3'}`}>
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Agrandir' : 'Réduire'}
          className={`w-full flex items-center gap-2 py-1.5 rounded-[7px] text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors ${
            collapsed ? 'px-0 justify-center' : 'px-2'
          }`}
        >
          {collapsed
            ? <PanelLeftOpen className="h-4 w-4 shrink-0" />
            : <>
                <PanelLeftClose className="h-4 w-4 shrink-0" />
                <span>Réduire</span>
              </>
          }
        </button>
      </div>
    </aside>
  )
}
