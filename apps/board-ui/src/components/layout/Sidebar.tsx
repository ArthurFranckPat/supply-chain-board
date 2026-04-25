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

  useEffect(() => {
    const next = new Set<string>()
    for (const entry of NAV_ENTRIES) {
      if (entry.type === 'group' && entry.items.some((i) => location.pathname === i.path)) {
        next.add(entry.key)
      }
    }
    setOpenGroups((prev) => {
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

  const activeLeafClass = "bg-primary text-primary-foreground shadow-sm"
  const inactiveLeafClass = "text-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"

  const leafLink = (item: { key: string; label: string; path: string; icon: React.ReactNode }) => (
    <NavLink
      key={item.key}
      to={item.path}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `w-full flex items-center gap-2 py-1.5 text-[11px] font-medium transition-colors text-left select-none ${
          collapsed ? 'px-0 justify-center' : 'px-2.5'
        } ${isActive ? activeLeafClass : inactiveLeafClass}`
      }
    >
      {item.icon}
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  )

  return (
    <aside className={`shrink-0 border-r border-sidebar-border bg-sidebar flex flex-col transition-[width] duration-150 ${collapsed ? 'w-[42px]' : 'w-[210px]'}`}>
      {/* Brand */}
      <div className={`flex items-center gap-2 h-[38px] border-b border-sidebar-border ${collapsed ? 'px-1.5 justify-center' : 'px-3'}`}>
        <div className="w-6 h-6 shrink-0 flex items-center justify-center bg-primary text-primary-foreground">
          <Package className="h-3.5 w-3.5" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-none">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold leading-none">Sage X3</p>
            <p className="text-[12px] font-bold text-foreground leading-none mt-0.5">Supply Chain</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      {!collapsed && (
        <div className="px-3 pt-2 pb-0.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none">
          Menu
        </div>
      )}

      <nav className={`flex flex-col gap-0.5 flex-1 overflow-y-auto ${collapsed ? 'px-1 pt-2' : 'px-1.5'}`}>
        {collapsed ? (
          <>
            {getAllNavLeaves().map((item, idx) => (
              <Fragment key={item.key}>
                {idx > 0 && idx % 4 === 0 && (
                  <div className="h-px bg-sidebar-border my-1 mx-0.5" />
                )}
                {leafLink(item)}
              </Fragment>
            ))}
          </>
        ) : (
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
                  className={`w-full flex items-center justify-between py-1.5 text-[11px] font-medium transition-colors text-left px-2.5 select-none ${
                    isActiveGroup ? 'text-primary' : 'text-foreground hover:bg-sidebar-accent'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {entry.icon}
                    {entry.label}
                  </span>
                  {isOpen ? (
                    <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="flex flex-col gap-0.5 pl-2 mt-0.5 border-l border-sidebar-border ml-2.5">
                    {entry.items.map((item) => (
                      <NavLink
                        key={item.key}
                        to={item.path}
                        className={({ isActive }) =>
                          `w-full flex items-center gap-2 py-1.5 text-[11px] font-medium transition-colors text-left px-2 select-none ${
                            isActive ? activeLeafClass : inactiveLeafClass
                          }`
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
      <div className={collapsed ? 'px-1 pb-1' : 'px-1.5 pb-1'}>
        {!collapsed && (
          <div className="px-2 pb-0.5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider select-none">
            Système
          </div>
        )}
        <NavLink
          to="/settings"
          title={collapsed ? 'Paramètres' : undefined}
          className={({ isActive }) =>
            `w-full flex items-center gap-2 py-1.5 text-[11px] font-medium transition-colors text-left select-none ${
              collapsed ? 'px-0 justify-center' : 'px-2.5'
            } ${isActive ? activeLeafClass : inactiveLeafClass}`
          }
        >
          <Settings className="h-[13px] w-[13px] text-muted-foreground" />
          {!collapsed && 'Paramètres'}
        </NavLink>
      </div>

      {/* Status indicators */}
      {!collapsed && (
        <div className="px-3 py-2 border-t border-sidebar-border flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>API</span>
            <span className={`inline-flex items-center gap-1 px-1.5 py-[1px] text-[9px] font-semibold border ${
              backendState === 'ready' ? 'border-green/30 text-green bg-green/10' : 'border-muted-foreground/20 text-muted-foreground bg-muted'
            }`}>
              <span className={`w-[5px] h-[5px] ${backendState === 'ready' ? 'bg-green' : 'bg-muted-foreground'}`} />
              {backendState === 'ready' ? 'OK' : backendState}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Source</span>
            <span className={`inline-flex items-center gap-1 px-1.5 py-[1px] text-[9px] font-semibold border ${
              loadState === 'ready' ? 'border-green/30 text-green bg-green/10' : 'border-muted-foreground/20 text-muted-foreground bg-muted'
            }`}>
              <span className={`w-[5px] h-[5px] ${loadState === 'ready' ? 'bg-green' : 'bg-muted-foreground'}`} />
              {loadState === 'ready' ? 'OK' : loadState}
            </span>
          </div>
        </div>
      )}

      {/* Collapse toggle */}
      <div className={`border-t border-sidebar-border py-1 ${collapsed ? 'px-1' : 'px-2'}`}>
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Agrandir' : 'Réduire'}
          className={`w-full flex items-center gap-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors select-none ${
            collapsed ? 'px-0 justify-center' : 'px-1.5'
          }`}
        >
          {collapsed
            ? <PanelLeftOpen className="h-3.5 w-3.5 shrink-0" />
            : <>
                <PanelLeftClose className="h-3.5 w-3.5 shrink-0" />
                <span>Réduire</span>
              </>
          }
        </button>
      </div>
    </aside>
  )
}
