import { Fragment, useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Settings, Package, PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { NAV_ENTRIES, getAllNavLeaves, pathBelongsToGroup } from './nav'
import type { BackendState, LoadState } from '@/hooks/useAppBootstrap'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  backendState: BackendState
  loadState: LoadState
}

export function Sidebar({ collapsed, onToggleCollapse, backendState, loadState }: SidebarProps) {
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())

  // Auto-open group containing active path
  useEffect(() => {
    const next = new Set<string>()
    for (const entry of NAV_ENTRIES) {
      if (entry.type === 'group' && entry.items.some((i) => location.pathname === i.path)) {
        next.add(entry.key)
      }
    }
    setOpenGroups((prev) => {
      // Merge with existing so user-opened groups stay open
      const merged = new Set(prev)
      next.forEach((k) => merged.add(k))
      return merged
    })
  }, [location.pathname])

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const linkClass = (isActive: boolean, base: string) =>
    `${base} ${isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent'}`

  const leafLink = (item: { key: string; label: string; path: string; icon: React.ReactNode }) => (
    <NavLink
      key={item.key}
      to={item.path}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        linkClass(isActive, `w-full flex items-center gap-2.5 py-2 rounded-[7px] text-[12.5px] font-medium transition-colors text-left ${collapsed ? 'px-0 justify-center' : 'px-[11px]'}`)
      }
    >
      {item.icon}
      {!collapsed && item.label}
    </NavLink>
  )

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

      {/* Navigation */}
      {!collapsed && (
        <div className="px-3 pt-3.5 pb-1.5 text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
          Navigation
        </div>
      )}

      <nav className={`flex flex-col gap-0.5 flex-1 ${collapsed ? 'px-2 pt-3' : 'px-2.5'}`}>
        {collapsed ? (
          // Collapsed: flat list of all leaves + separator hints
          <>
            {getAllNavLeaves().map((item, idx) => (
              <Fragment key={item.key}>
                {idx > 0 && idx % 3 === 0 && (
                  <div className="h-px bg-border my-1 mx-1" />
                )}
                {leafLink(item)}
              </Fragment>
            ))}
          </>
        ) : (
          // Expanded: grouped
          NAV_ENTRIES.map((entry) => {
            if (entry.type === 'leaf') {
              return leafLink(entry)
            }

            const isOpen = openGroups.has(entry.key)
            const isActiveGroup = pathBelongsToGroup(location.pathname, entry.key)

            return (
              <div key={entry.key}>
                <button
                  onClick={() => toggleGroup(entry.key)}
                  className={`w-full flex items-center justify-between py-2 rounded-[7px] text-[12.5px] font-medium transition-colors text-left px-[11px] ${
                    isActiveGroup ? 'text-primary' : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    {entry.icon}
                    {entry.label}
                  </span>
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-0.5 pl-2 mt-0.5">
                    {entry.items.map((item) => (
                      <NavLink
                        key={item.key}
                        to={item.path}
                        className={({ isActive }) =>
                          linkClass(isActive, 'w-full flex items-center gap-2.5 py-2 rounded-[7px] text-[12px] font-medium transition-colors text-left px-[11px]')
                        }
                      >
                        {item.icon}
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </nav>

      {/* System section */}
      <div className={collapsed ? 'px-2 pb-2' : 'px-2.5 pb-2'}>
        {!collapsed && (
          <div className="px-[11px] pb-1.5 text-[9.5px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
            Système
          </div>
        )}
        <NavLink
          to="/settings"
          title={collapsed ? 'Paramètres' : undefined}
          className={({ isActive }) =>
            linkClass(isActive, `w-full flex items-center gap-2.5 py-2 rounded-[7px] text-[12.5px] font-medium transition-colors text-left ${collapsed ? 'px-0 justify-center' : 'px-[11px]'}`)
          }
        >
          <Settings className="h-[15px] w-[15px] text-muted-foreground" />
          {!collapsed && 'Paramètres'}
        </NavLink>
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
            : <Fragment>
                <PanelLeftClose className="h-4 w-4 shrink-0" />
                <span>Réduire</span>
              </Fragment>
          }
        </button>
      </div>
    </aside>
  )
}
