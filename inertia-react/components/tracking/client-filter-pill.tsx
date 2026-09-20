/**
 * Filtre client de la toolbar Suivi — pill dropdown dédiée (même grammaire que
 * DateWindowPill : Popover base-ui + PILL). La fenêtre chargée (today-90j/+30j)
 * peut porter des dizaines de clients : la liste est recherchable, chaque entrée
 * porte son nb de lignes. Sélection unique — « Tous les clients » par défaut,
 * recliquer le client actif le désélectionne.
 */
import { useMemo, useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Building2, Check, ChevronDown, Globe, Search, Users, X } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { PILL } from '@r/components/vision/toolbar'

export interface ClientOption {
  name: string
  count: number
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const isAldes = (name: string) => fold(name).includes('aldes')

export function ClientFilterPill(props: {
  clients: ClientOption[]
  /** Client retenu — null = tous, '__export__' = clients export, string = client spécifique. */
  value: string | null
  onChange: (client: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const totalCount = useMemo(
    () => props.clients.reduce((sum, c) => sum + c.count, 0),
    [props.clients]
  )

  const exportCount = useMemo(
    () => props.clients.filter((c) => !isAldes(c.name)).reduce((sum, c) => sum + c.count, 0),
    [props.clients]
  )

  const aldesCount = useMemo(
    () => props.clients.filter((c) => isAldes(c.name)).reduce((sum, c) => sum + c.count, 0),
    [props.clients]
  )

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return props.clients
    return props.clients.filter((c) => c.name.toLowerCase().includes(q))
  }, [props.clients, q])

  const isExport = props.value === '__export__'
  const isAldesVal = Boolean(props.value && !isExport && isAldes(props.value))
  const hasFilter = Boolean(props.value)

  const label = useMemo(() => {
    if (isExport) return 'Clients export'
    if (isAldesVal) return props.value ?? 'ALDES'
    if (props.value) return props.value
    return 'Clients'
  }, [isExport, isAldesVal, props.value])

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery('')
      }}
    >
      <div data-print-keep className="relative">
        <Popover.Trigger
          aria-label={`Client : ${hasFilter ? label : 'tous'}${open ? ' — fermer' : ' — ouvrir'}`}
          title={hasFilter ? `Client : ${label}` : 'Filtrer par client'}
          className={cn(PILL, hasFilter && 'border-brand')}
        >
          {isExport ? (
            <Globe size={14} strokeWidth={1.75} className="shrink-0 text-brand" />
          ) : isAldesVal ? (
            <Building2 size={14} strokeWidth={1.75} className="shrink-0 text-brand" />
          ) : (
            <Users
              size={14}
              strokeWidth={1.75}
              className={cn('shrink-0', hasFilter ? 'text-brand' : 'text-muted-foreground')}
            />
          )}
          <span
            className={cn(
              'max-w-[160px] truncate whitespace-nowrap',
              !hasFilter && 'text-muted-foreground'
            )}
          >
            {label}
          </span>
          {hasFilter && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Retirer le filtre client"
              onClick={(e) => {
                e.stopPropagation()
                props.onChange(null)
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={13} strokeWidth={2} />
            </span>
          )}
          <ChevronDown size={16} strokeWidth={1.75} className="text-muted-foreground" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner
            side="bottom"
            align="start"
            sideOffset={8}
            collisionPadding={8}
            className="z-50"
          >
            <Popover.Popup className="w-[280px] rounded-lg border border-rule bg-popover p-2 shadow-lg">
              <div className="flex min-h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3">
                <Search size={13} strokeWidth={1.75} className="shrink-0 text-muted-foreground" />
                <input
                  className="w-full border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
                  placeholder="Rechercher un client…"
                  type="text"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="Effacer la recherche"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                )}
              </div>

              {/* Raccourcis presets */}
              <div className="mt-2 space-y-0.5">
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
                    props.onChange(null)
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
                    {!hasFilter && <Check size={12} className="shrink-0 text-brand" />}
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
                    props.onChange(isExport ? null : '__export__')
                    setOpen(false)
                  }}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Globe size={13} className="shrink-0 text-brand" />
                    <div className="truncate">
                      <span className="font-semibold">Clients export</span>
                      <span className="ml-1 text-2xs font-normal text-muted-foreground">
                        (hors ALDES)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="rounded bg-brand-soft px-1.5 py-0.5 font-mono text-2xs font-semibold tabular-nums text-brand">
                      {exportCount}
                    </span>
                    {isExport && <Check size={12} className="shrink-0 text-brand" />}
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
                      props.onChange(isAldesVal ? null : 'ALDES')
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
                      {isAldesVal && <Check size={12} className="shrink-0 text-brand" />}
                    </div>
                  </button>
                )}
              </div>

              {/* Séparateur */}
              <div className="my-1.5 border-t border-rule-soft" />

              {/* Titre section clients individuels */}
              <div className="px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Clients ({filtered.length})
              </div>

              {/* Liste défilante des clients */}
              <div className="mt-1 max-h-[200px] overflow-y-auto space-y-0.5">
                {filtered.map((c) => {
                  const active = c.name === props.value
                  return (
                    <button
                      key={c.name}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors cursor-pointer',
                        active
                          ? 'bg-brand-soft font-semibold text-brand'
                          : 'text-foreground hover:bg-secondary'
                      )}
                      onClick={() => {
                        props.onChange(active ? null : c.name)
                        setOpen(false)
                      }}
                    >
                      <span className="truncate">{c.name}</span>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                          {c.count}
                        </span>
                        {active && <Check size={12} className="shrink-0 text-brand" />}
                      </div>
                    </button>
                  )
                })}
                {filtered.length === 0 && (
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
