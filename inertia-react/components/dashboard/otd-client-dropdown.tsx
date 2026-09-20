import { useState, useMemo } from 'react'
import { Popover } from '@base-ui/react/popover'
import { ChevronDown, Search, Users, X, Globe, Building2, Check } from 'lucide-react'

import { cn } from '@r/lib/utils'

export interface ClientOption {
  name: string
  count: number
}

export interface OtdClientDropdownProps {
  clients: ClientOption[]
  /**
   * Client sélectionné :
   * - null ou '' : tous les clients
   * - '__export__' : filtre export (tous les clients sauf ALDES)
   * - string : client spécifique
   */
  value: string | null
  onChange: (client: string | null) => void
  className?: string
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const isAldes = (name: string) => fold(name).includes('aldes')

export function OtdClientDropdown({ clients, value, onChange, className }: OtdClientDropdownProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  // Totaux calculés depuis l'ensemble des clients
  const totalCount = useMemo(() => clients.reduce((sum, c) => sum + c.count, 0), [clients])

  const exportCount = useMemo(
    () => clients.filter((c) => !isAldes(c.name)).reduce((sum, c) => sum + c.count, 0),
    [clients]
  )

  const aldesCount = useMemo(
    () => clients.filter((c) => isAldes(c.name)).reduce((sum, c) => sum + c.count, 0),
    [clients]
  )

  const q = query.trim().toLowerCase()
  const filteredClients = useMemo(() => {
    if (!q) return clients
    return clients.filter((c) => c.name.toLowerCase().includes(q))
  }, [clients, q])

  // Déterminer l'état et le libellé affiché
  const isExport = value === '__export__' || value?.toLowerCase() === 'export'
  const isAldesVal = Boolean(value && !isExport && isAldes(value))
  const isSpecific = Boolean(value && !isExport && !isAldesVal)
  const hasFilter = Boolean(value)

  const label = useMemo(() => {
    if (isExport) return 'Clients export'
    if (isAldesVal) return 'ALDES'
    if (value) return value
    return 'Tous les clients'
  }, [isExport, isAldesVal, value])

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <div data-print-keep className={cn('relative flex-1 min-w-0', className)}>
        <Popover.Trigger
          aria-label={`Filtrer par client : ${label}${open ? ' — fermer' : ' — ouvrir'}`}
          title={label}
          className={cn(
            'flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-rule bg-card px-2.5 text-xs text-foreground transition-colors hover:bg-secondary cursor-pointer select-none',
            hasFilter && 'border-brand/60 bg-brand-soft/25 font-semibold text-foreground'
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5 truncate">
            {isExport ? (
              <Globe size={13} className="shrink-0 text-brand" />
            ) : isAldesVal ? (
              <Building2 size={13} className="shrink-0 text-brand" />
            ) : (
              <Users
                size={13}
                className={cn('shrink-0', hasFilter ? 'text-brand' : 'text-muted-foreground')}
              />
            )}
            <span className="truncate">{label}</span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {hasFilter && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Effacer le filtre client"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(null)
                }}
                className="flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                title="Effacer le filtre client"
              >
                <X size={12} strokeWidth={2} />
              </span>
            )}
            <ChevronDown size={14} className="text-muted-foreground" />
          </div>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            className="z-50"
          >
            <Popover.Popup className="w-[280px] max-w-[calc(100vw-32px)] rounded-lg border border-rule bg-popover p-2 shadow-float">
              {/* Barre de recherche */}
              <div className="mb-2 flex min-h-[30px] items-center gap-1.5 rounded-md border border-rule bg-card px-2.5">
                <Search size={13} className="shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  autoComplete="off"
                  className="w-full border-0 bg-transparent text-xs text-foreground shadow-none outline-none placeholder:text-muted-foreground"
                  placeholder="Rechercher un client…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="text-muted-foreground hover:text-foreground"
                    title="Effacer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Raccourcis / Presets */}
              <div className="space-y-0.5">
                {/* 1. Tous les clients */}
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors cursor-pointer',
                    !hasFilter
                      ? 'bg-brand-soft font-semibold text-brand'
                      : 'text-foreground hover:bg-secondary'
                  )}
                  onClick={() => {
                    onChange(null)
                    setOpen(false)
                  }}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Users size={13} className="shrink-0" />
                    <span className="truncate">Tous les clients</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                      {totalCount}
                    </span>
                    {!hasFilter && <Check size={12} className="text-brand shrink-0" />}
                  </div>
                </button>

                {/* 2. Clients export (hors ALDES) */}
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors cursor-pointer',
                    isExport
                      ? 'bg-brand-soft font-semibold text-brand'
                      : 'text-foreground hover:bg-secondary'
                  )}
                  onClick={() => {
                    onChange('__export__')
                    setOpen(false)
                  }}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Globe size={13} className="shrink-0 text-brand" />
                    <div className="truncate">
                      <span className="font-semibold">Clients export</span>
                      <span className="ml-1 text-2xs text-muted-foreground font-normal">
                        (hors ALDES)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-2xs font-semibold text-brand tabular-nums">
                      {exportCount}
                    </span>
                    {isExport && <Check size={12} className="text-brand shrink-0" />}
                  </div>
                </button>

                {/* 3. ALDES */}
                {aldesCount > 0 && (
                  <button
                    type="button"
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors cursor-pointer',
                      isAldesVal
                        ? 'bg-brand-soft font-semibold text-brand'
                        : 'text-foreground hover:bg-secondary'
                    )}
                    onClick={() => {
                      onChange('ALDES')
                      setOpen(false)
                    }}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Building2 size={13} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">ALDES</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                        {aldesCount}
                      </span>
                      {isAldesVal && <Check size={12} className="text-brand shrink-0" />}
                    </div>
                  </button>
                )}
              </div>

              {/* Séparateur */}
              <div className="my-1.5 border-t border-rule-soft" />

              {/* Titre section clients individuels */}
              <div className="px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Clients ({filteredClients.length})
              </div>

              {/* Liste défilante des clients */}
              <div className="max-h-[180px] overflow-y-auto space-y-0.5 mt-1">
                {filteredClients.map((c) => {
                  const isSelected = value === c.name
                  return (
                    <button
                      key={c.name}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors cursor-pointer',
                        isSelected
                          ? 'bg-brand-soft font-semibold text-brand'
                          : 'text-foreground hover:bg-secondary'
                      )}
                      onClick={() => {
                        onChange(isSelected ? null : c.name)
                        setOpen(false)
                      }}
                    >
                      <span className="truncate">{c.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                          {c.count}
                        </span>
                        {isSelected && <Check size={12} className="text-brand shrink-0" />}
                      </div>
                    </button>
                  )
                })}

                {filteredClients.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                    Aucun client ne correspond.
                  </p>
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </div>
    </Popover.Root>
  )
}
