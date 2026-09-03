/**
 * Filtre client de la toolbar Suivi — pill dropdown dédiée (même grammaire que
 * DateWindowPill : Popover base-ui + PILL). La fenêtre chargée (today-90j/+30j)
 * peut porter des dizaines de clients : la liste est recherchable, chaque entrée
 * porte son nb de lignes. Sélection unique — « Tous les clients » par défaut,
 * recliquer le client actif le désélectionne.
 */
import { useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { ChevronDown, Search, Users, X } from 'lucide-react'

import { cn } from '@r/lib/utils'
import { PILL } from '@r/components/vision/toolbar'

export interface ClientOption {
  name: string
  count: number
}

export function ClientFilterPill(props: {
  clients: ClientOption[]
  /** Client retenu — null = tous. */
  value: string | null
  onChange: (client: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = q ? props.clients.filter((c) => c.name.toLowerCase().includes(q)) : props.clients

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
          aria-label={`Client : ${props.value ?? 'tous'}${open ? ' — fermer' : ' — ouvrir'}`}
          title="Filtrer par client"
          className={cn(PILL, props.value && 'border-brand')}
        >
          <Users size={14} strokeWidth={1.75} className="text-muted-foreground" />
          <span
            className={cn(
              'max-w-[160px] truncate whitespace-nowrap',
              !props.value && 'text-muted-foreground'
            )}
          >
            {props.value ?? 'Clients'}
          </span>
          {props.value && (
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
            <Popover.Popup className="w-[260px] rounded-lg border border-rule bg-popover p-2 shadow-lg">
              <div className="flex min-h-[30px] items-center gap-1.5 rounded-full border border-rule bg-card px-3">
                <Search size={13} strokeWidth={1.75} className="text-muted-foreground" />
                <input
                  className="w-full border-0 bg-transparent px-0 text-xs font-medium text-foreground shadow-none outline-none"
                  placeholder="Rechercher un client…"
                  type="text"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.currentTarget.value)}
                />
              </div>
              <div className="mt-1.5 max-h-[280px] overflow-y-auto">
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                    !props.value
                      ? 'bg-brand-soft font-semibold text-brand'
                      : 'text-foreground hover:bg-secondary'
                  )}
                  onClick={() => props.onChange(null)}
                >
                  Tous les clients
                </button>
                {filtered.map((c) => {
                  const active = c.name === props.value
                  return (
                    <button
                      key={c.name}
                      type="button"
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                        active
                          ? 'bg-brand-soft font-semibold text-brand'
                          : 'text-foreground hover:bg-secondary'
                      )}
                      onClick={() => props.onChange(active ? null : c.name)}
                    >
                      <span className="truncate">{c.name}</span>
                      <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                        {c.count}
                      </span>
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
